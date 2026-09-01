import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, type Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentCapabilities, SubagentProvider, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { WorkflowEngine, WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type { WorkflowResult, WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { describe, expect, it, vi } from 'vitest'
import * as toolMaoqDecision from '../src/index.ts'

class StubEngine extends WorkflowEngine {
  requests: WorkflowStartRequest[] = []
  disposed = 0
  settle!: (result: WorkflowResult) => void

  start(request: WorkflowStartRequest): WorkflowRun {
    this.requests.push(request)
    const result = new Promise<WorkflowResult>((resolve) => { this.settle = resolve })
    return {
      id: WorkflowRunId(`maoq-${this.requests.length}`),
      meta: request.meta,
      result,
      cancel: (reason) => {
        this.settle({
          value: null,
          stopReason: 'cancelled',
          ...reason === undefined ? {} : { error: reason },
          agentsStarted: 0,
        })
      },
      dispose: () => {
        this.disposed += 1
        return Promise.resolve()
      },
    }
  }
}

class StubProvider implements SubagentProvider {
  readonly name = 'fresh'
  readonly capabilities: SubagentCapabilities = {
    agentOptions: true,
    outputSchema: true,
    depthLimit: true,
    toolFilter: true,
    persona: true,
  }
  readonly inheritsParentContext = false

  start(_request: SubagentStartRequest): Promise<SubagentRun> {
    return Promise.reject(new Error('StubProvider.start is owned by StubEngine'))
  }
}

async function setup(config: toolMaoqDecision.Config = {}) {
  return setupWithProvider(new StubProvider(), Object.assign({}, config, { subagentProvider: 'fresh' }))
}

async function setupWithProvider(provider: SubagentProvider, config: toolMaoqDecision.Config) {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SubagentRuntime)
  ctx.subagents.registerProvider(provider)
  await ctx.plugin(StubEngine)
  const fiber = await ctx.plugin(toolMaoqDecision, config)
  const parent = { id: SessionId('commander'), options: {} } as unknown as Agent
  return { ctx, engine: ctx.workflowEngine as StubEngine, parent, fiber }
}

function execute(ctx: Context, parent: Agent, args: unknown, signal = new AbortController().signal): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal,
    callId: ToolCallId('maoq-call'),
    name: 'maoq_decide',
    arguments: args,
    agent: parent,
  })
}

const decision = {
  marketRegime: 'emotion recovery',
  principalContradiction: 'risk appetite is improving while index breadth remains weak',
  battlefield: 'low-priced infrastructure leaders',
  tactic: 'first divergence recovery',
  action: 'paper_trade',
  candidates: [{ symbol: '000001.SZ', role: 'leader', thesis: 'strongest verified relative strength' }],
  confidence: 0.68,
  invalidationConditions: ['sector breadth falls below the snapshot threshold'],
  selectedSpecialists: ['market_regime', 'emotion_cycle'],
}

const reports = [
  {
    role: 'market_regime',
    conclusion: 'risk appetite is recovering',
    evidence: ['advance-decline breadth improved'],
    counterEvidence: ['index remains below resistance'],
    invalidationConditions: ['breadth reverses'],
    confidence: 0.7,
  },
  {
    role: 'emotion_cycle',
    conclusion: 'cycle is moving out of repair',
    evidence: ['height and promotion rate improved'],
    counterEvidence: ['failed breakouts remain elevated'],
    invalidationConditions: ['promotion rate collapses'],
    confidence: 0.66,
  },
]

const approved = {
  status: 'approved',
  specialists: ['market_regime', 'emotion_cycle'],
  reports,
  decision,
  risk: {
    approved: true,
    verdict: 'approve',
    reasons: ['paper-only action and explicit invalidation'],
    hardLimits: ['no live execution'],
    invalidationConditions: ['snapshot expires'],
  },
  tokenUsage: {
    calls: [
      { label: 'market_regime', phase: 'Specialist research', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } },
      { label: 'emotion_cycle', phase: 'Specialist research', usage: { inputTokens: 90, outputTokens: 20, totalTokens: 110 } },
      { label: 'MAOQ commander synthesis', phase: 'Decision synthesis', usage: { inputTokens: 200, outputTokens: 30, totalTokens: 230 } },
      { label: 'Independent risk review', phase: 'Independent risk review', usage: { inputTokens: 180, outputTokens: 20, totalTokens: 200 } },
    ],
    total: { inputTokens: 570, outputTokens: 90, totalTokens: 660, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
    unavailableCalls: 0,
  },
}

async function settle(
  engine: StubEngine,
  pending: Promise<ToolExecutionResult>,
  value: unknown,
  agentsStarted = 4,
): Promise<ToolExecutionResult> {
  await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) })
  engine.settle({ value, stopReason: 'completed', agentsStarted })
  return pending
}

describe('maoq_decide', () => {
  it('runs only the commander-selected specialists, then synthesis and risk review', async () => {
    const { ctx, engine, parent } = await setup()
    const pending = execute(ctx, parent, {
      objective: 'Find the least-resistance battlefield.',
      specialists: ['market_regime', 'emotion_cycle'],
    })
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) })
    expect(engine.requests[0]).toMatchObject({
      args: {
        objective: 'Find the least-resistance battlefield.',
        specialists: ['market_regime', 'emotion_cycle'],
      },
      subagentProvider: 'fresh',
      maxTotalAgents: 4,
      parent,
    })
    expect(engine.requests[0]!.script).toContain('Promise.all')
    expect(engine.requests[0]!.script).toContain('Independent risk review')

    const result = await settle(engine, pending, approved)
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected MAOQ decision success')
    expect(result.value).toMatchObject({ status: 'approved', agentsStarted: 4, decision, risk: approved.risk })
    expect(engine.disposed).toBe(1)
  })

  it('preserves an independent risk veto and rejects an inconsistent approval', async () => {
    const first = await setup()
    const vetoed = {
      ...approved,
      status: 'vetoed',
      risk: { ...approved.risk, approved: false, verdict: 'veto', reasons: ['evidence snapshot is stale'] },
    }
    const vetoResult = await settle(
      first.engine,
      execute(first.ctx, first.parent, { objective: 'Decide.', specialists: approved.specialists }),
      vetoed,
    )
    expect(vetoResult.isError).toBe(false)
    if (vetoResult.isError) throw new Error('expected a structured veto')
    expect(vetoResult.value).toMatchObject({ status: 'vetoed', risk: { approved: false, verdict: 'veto' } })

    const second = await setup()
    const inconsistent = await settle(
      second.engine,
      execute(second.ctx, second.parent, { objective: 'Decide.', specialists: approved.specialists }),
      { ...vetoed, status: 'approved' },
    )
    expect(inconsistent.isError).toBe(true)
    expect((inconsistent.content[0] as { text: string }).text).toContain('risk veto cannot produce approved status')
  })

  it('rejects empty, duplicate, and over-budget specialist selections before starting a workflow', async () => {
    const { ctx, engine, parent } = await setup({ maxSpecialists: 2 })
    for (const args of [
      { objective: ' ', specialists: ['market_regime'] },
      { objective: 'Decide.', specialists: [] },
      { objective: 'Decide.', specialists: ['market_regime', 'market_regime'] },
      { objective: 'Decide.', specialists: ['market_regime', 'emotion_cycle', 'policy_macro'] },
    ]) {
      expect((await execute(ctx, parent, args)).isError).toBe(true)
    }
    expect(engine.requests).toHaveLength(0)
  })

  it('registers bounded-autonomy guidance and unloads cleanly', async () => {
    const { ctx, fiber } = await setup()
    const section = (await ctx.systemPrompt.assemble()).sections.find(candidate => candidate.name === 'tool:maoq-decision')
    expect(section?.text).toContain('smallest sufficient specialist set')
    expect(section?.text).toContain('risk veto')
    expect(ctx.tools.get('maoq_decide')).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('maoq_decide')).toBeUndefined()
  })

  it('validates direct configuration defaults and invalid values', async () => {
    const defaults = await setupWithProvider(new StubProvider(), { subagentProvider: 'fresh' })
    await defaults.fiber.dispose()
    toolMaoqDecision.apply(defaults.ctx, {})
    for (const config of [
      { subagentProvider: '' },
      { subagentProvider: ' fresh ' },
      { subagentProvider: 'fresh', maxSpecialists: 0 },
      { subagentProvider: 'fresh', maxSpecialists: 7 },
      { subagentProvider: 'fresh', maxSpecialists: 1.5 },
      { subagentProvider: 'fresh', maxResultChars: 0 },
      { subagentProvider: 'fresh', maxResultChars: 1.5 },
      { subagentProvider: 'fresh', dailyRefreshTime: '24:00' },
      { subagentProvider: 'fresh', dailyRefreshTime: '23:00', dailyRefreshWindowMinutes: 120 },
      { subagentProvider: 'fresh', dailyRefreshRetryMinutes: 0 },
      { subagentProvider: 'fresh', dailyRefreshRetryMinutes: 481 },
      { subagentProvider: 'fresh', dailyRefreshWindowMinutes: -1 },
      { subagentProvider: 'fresh', dailyRefreshWindowMinutes: 481 },
    ]) {
      expect(() => { toolMaoqDecision.apply(defaults.ctx, config) }).toThrow()
    }
  })

  it('requires a registered fresh structured-output provider', async () => {
    const cases: Array<{ provider: SubagentProvider; expected: string; route: string }> = [
      {
        provider: new StubProvider(),
        route: 'missing',
        expected: 'is not registered',
      },
      {
        provider: Object.assign(new StubProvider(), { capabilities: { ...new StubProvider().capabilities, outputSchema: false } }),
        route: 'fresh',
        expected: 'does not support structured output',
      },
      {
        provider: Object.assign(new StubProvider(), { inheritsParentContext: true }),
        route: 'fresh',
        expected: 'requires fresh agents',
      },
    ]
    for (const { provider, route, expected } of cases) {
      const { ctx, engine, parent } = await setupWithProvider(provider, { subagentProvider: route })
      const result = await execute(ctx, parent, { objective: 'Decide.', specialists: ['market_regime'] })
      expect(result.isError).toBe(true)
      expect((result.content[0] as { text: string }).text).toContain(expected)
      expect(engine.requests).toHaveLength(0)
    }
  })

  it('rejects malformed council fields at the host boundary', async () => {
    const malformed: Array<[unknown, string]> = [
      [null, 'malformed council result'],
      [{ ...approved, status: 'unknown' }, 'malformed council result'],
      [{ ...approved, specialists: ['emotion_cycle', 'market_regime'] }, 'inconsistent decision fields'],
      [{ ...approved, reports: [] }, 'inconsistent decision fields'],
      [{ ...approved, decision: null }, 'inconsistent decision fields'],
      [{ ...approved, decision: { ...decision, selectedSpecialists: [] } }, 'inconsistent decision fields'],
      [{ ...approved, risk: null }, 'inconsistent decision fields'],
      [{ ...approved, risk: { ...approved.risk, approved: 'yes' } }, 'inconsistent decision fields'],
      [{ ...approved, risk: { ...approved.risk, verdict: 'maybe' } }, 'inconsistent decision fields'],
      [{ ...approved, reports: [{ ...reports[0], role: 'emotion_cycle' }, reports[1]] }, 'wrong specialists'],
      [{ ...approved, reports: [null, reports[1]] }, 'wrong specialists'],
      [{ ...approved, risk: { ...approved.risk, approved: false } }, 'inconsistent risk verdict'],
      [{ ...approved, status: 'vetoed' }, 'approved risk verdict must produce approved status'],
    ]
    for (const [value, expected] of malformed) {
      const run = await setup()
      const result = await settle(
        run.engine,
        execute(run.ctx, run.parent, { objective: 'Decide.', specialists: approved.specialists }),
        value,
      )
      expect(result.isError).toBe(true)
      expect((result.content[0] as { text: string }).text).toContain(expected)
    }
  })

  it('renders workflow failures, cancellation, truncation, and presentation intent', async () => {
    for (const terminal of [
      { value: null, stopReason: 'cancelled' as const, agentsStarted: 0 },
      { value: null, stopReason: 'cancelled' as const, error: 'parent stopped', agentsStarted: 0 },
      { value: null, stopReason: 'error' as const, agentsStarted: 0 },
      { value: null, stopReason: 'error' as const, error: 'worker failed', agentsStarted: 0 },
    ]) {
      const run = await setup()
      const pending = execute(run.ctx, run.parent, { objective: 'Decide.', specialists: ['market_regime'] })
      await vi.waitFor(() => { expect(run.engine.requests).toHaveLength(1) })
      run.engine.settle(terminal)
      expect((await pending).isError).toBe(true)
    }

    const short = await setup({ maxResultChars: 5 })
    const truncated = await settle(
      short.engine,
      execute(short.ctx, short.parent, { objective: 'Decide.', specialists: approved.specialists }),
      approved,
    )
    expect((truncated.content[0] as { text: string }).text).toHaveLength(5)

    const longer = await setup({ maxResultChars: 40 })
    const bounded = await settle(
      longer.engine,
      execute(longer.ctx, longer.parent, { objective: 'Decide.', specialists: approved.specialists }),
      approved,
    )
    expect((bounded.content[0] as { text: string }).text.endsWith('… [truncated]')).toBe(true)

    const tool = longer.ctx.tools.get('maoq_decide')
    expect(tool?.presentCall?.({ objective: 'Decide.', specialists: ['market_regime'] })).toEqual({
      card: 'generic', title: 'MAOQ decision council', rawInput: 'Decide.',
    })
    expect(tool?.presentResult?.(
      { objective: 'Decide.', specialists: ['market_regime'] },
      { content: [], isError: false },
    )).toEqual({ card: 'generic' })
  })

  it('requires a calling agent and forwards parent abort to workflow cancellation', async () => {
    const run = await setup()
    const missing = await run.ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('missing-agent'),
      name: 'maoq_decide',
      arguments: { objective: 'Decide.', specialists: ['market_regime'] },
    })
    expect(missing.isError).toBe(true)

    const controller = new AbortController()
    const pending = execute(run.ctx, run.parent, { objective: 'Decide.', specialists: ['market_regime'] }, controller.signal)
    await vi.waitFor(() => { expect(run.engine.requests).toHaveLength(1) })
    controller.abort()
    const cancelled = await pending
    expect(cancelled.isError).toBe(true)
    expect(run.engine.disposed).toBe(1)

    const preAborted = await setup()
    const controllerBeforeStart = new AbortController()
    controllerBeforeStart.abort()
    const definition = preAborted.ctx.tools.get('maoq_decide')
    if (definition === undefined) throw new Error('maoq_decide definition missing')
    await expect(definition.execute(
      { objective: 'Decide.', specialists: ['market_regime'] },
      {
        signal: controllerBeforeStart.signal,
        agent: preAborted.parent,
      } as unknown as ToolRunContext,
    )).rejects.toThrow('cancelled')
  })
})
