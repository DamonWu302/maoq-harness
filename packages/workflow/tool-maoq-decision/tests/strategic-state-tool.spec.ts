import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { buildMarketSnapshot, MarketSnapshotService, MarketSnapshotStore, type MarketSnapshotDraft } from '@deepseek-ai/dsh-market-snapshot'
import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentCapabilities, SubagentProvider, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { WorkflowEngine, WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type { WorkflowResult, WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalDraft } from '../../../market/market-snapshot/tests/fixtures.ts'
import * as toolMaoqDecision from '../src/index.ts'
import { MAOQ_DAILY_STATE_OBJECTIVE, MAOQ_DAILY_STATE_SPECIALISTS } from '../src/strategic.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

class StubEngine extends WorkflowEngine {
  requests: WorkflowStartRequest[] = []
  settle!: (result: WorkflowResult) => void

  start(request: WorkflowStartRequest): WorkflowRun {
    this.requests.push(request)
    const result = new Promise<WorkflowResult>((resolve) => { this.settle = resolve })
    return {
      id: WorkflowRunId(`strategic-${this.requests.length}`),
      meta: request.meta,
      result,
      cancel: (reason) => {
        this.settle({
          value: null,
          stopReason: 'cancelled',
          ...(reason === undefined ? {} : { error: reason }),
          agentsStarted: 0,
        })
      },
      dispose: () => Promise.resolve(),
    }
  }
}

class StubProvider implements SubagentProvider {
  readonly name = 'fresh'
  readonly capabilities: SubagentCapabilities = {
    agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true,
  }
  readonly inheritsParentContext = false
  start(_request: SubagentStartRequest): Promise<SubagentRun> {
    return Promise.reject(new Error('owned by StubEngine'))
  }
}

function datedDraft(date: string, offset: number): MarketSnapshotDraft {
  const base = normalDraft()
  const retrievedAt = `${date}T15:10:00+08:00`
  const provenance = (value: typeof base.breadth.provenance) => ({
    ...value,
    source: { ...value.source, retrievedAt, recordId: `${value.source.recordId}-${date}` },
  })
  return {
    ...base,
    identity: {
      ...base.identity,
      tradingDate: date,
      cutoffTime: `${date}T15:30:00+08:00`,
      adjustmentVersion: `qfq-${date}`,
      sourceVersions: base.identity.sourceVersions.map(value => `${value}-${date}`),
    },
    stocks: base.stocks.map(item => ({ ...item, tradingDate: date, provenance: provenance(item.provenance) })),
    sectors: base.sectors.map(item => ({
      ...item,
      tradingDate: date,
      close: item.close + offset,
      provenance: provenance(item.provenance),
    })),
    breadth: { ...base.breadth, provenance: provenance(base.breadth.provenance) },
    emotion: { ...base.emotion, provenance: provenance(base.emotion.provenance) },
    news: base.news.map(item => ({ ...item, id: `${item.id}-${date}`, publishedAt: `${date}T10:00:00+08:00`, fetchedAt: `${date}T10:01:00+08:00`, eventAt: `${date}T10:00:00+08:00`, provenance: provenance(item.provenance) })),
  }
}

async function setup(analysisMode: 'quick' | 'deep' = 'deep', snapshotCount = 3) {
  const root = await mkdtemp(join(tmpdir(), 'maoq-strategic-tool-'))
  roots.push(root)
  const snapshots = [
    buildMarketSnapshot(datedDraft('2026-08-26', 0)),
    buildMarketSnapshot(datedDraft('2026-08-27', 1)),
    buildMarketSnapshot(datedDraft('2026-08-28', 2)),
  ].slice(0, snapshotCount)
  const store = new MarketSnapshotStore(root)
  await Promise.all(snapshots.map(snapshot => store.put(snapshot)))
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SubagentRuntime)
  ctx.subagents.registerProvider(new StubProvider())
  await ctx.plugin(StubEngine)
  await ctx.plugin(MarketSnapshotService, { root })
  await ctx.plugin(toolMaoqDecision, {
    subagentProvider: 'fresh',
    analysisMode,
    stateRoot: join(root, 'decisions'),
  })
  return { ctx, engine: ctx.workflowEngine as StubEngine, snapshots, snapshotStore: store, parent: { id: SessionId('commander'), options: {} } as unknown as Agent }
}

function workflowValue(
  features: StrategicFeatureRecord,
  badRef = false,
  specialists: readonly string[] = ['market_regime'],
) {
  const refs = features.evidence.map(item => item.ref)
  const supporting = badRef ? ['invented'] : [refs[0]!]
  const application = {
    methodId: 'principal_contradiction',
    application: '识别当前占主导地位的风险偏好与分歧矛盾。',
    evidenceRefs: [refs[0]!, refs[1]!],
    limitation: '仅适用于已冻结的日线快照。',
  }
  return {
    reports: [{
      role: 'market_regime',
      conclusion: '风险偏好修复',
      supportingEvidenceRefs: supporting,
      counterEvidenceRefs: [refs[1]!],
      transitionConditions: ['指数均值转负则降级'],
      confidence: 0.68,
      maoMethodApplications: [application],
    }],
    decision: {
      marketRegime: features.marketRegime.status === 'ready' ? features.marketRegime.value.label : 'repair',
      emotionCycle: features.emotionCycle.status === 'ready' ? features.emotionCycle.value.label : 'repair',
      principalContradiction: '风险偏好修复与分歧压力的矛盾',
      leastResistanceBattlefield: '银行',
      supportingEvidenceRefs: [refs[0]!],
      counterEvidenceRefs: [refs[1]!],
      transitionConditions: ['晋级率低于 0.2 则转为退潮'],
      confidence: 0.68,
      eligiblePosture: 'watch',
      maoMethodApplications: [application],
      selectedSpecialists: specialists,
    },
    risk: { approved: true, verdict: 'approve', reasons: ['引用闭合'], evidenceRefs: [refs[0]!], hardLimits: ['禁止实盘'] },
    tokenUsage: { calls: [], total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, unavailableCalls: 0 },
  }
}

describe('maoq_analyze_strategy', () => {
  it('generates one host-canonical daily state and reuses it across repeated refreshes', async () => {
    const { ctx, engine, snapshots, parent } = await setup('quick')
    const pending = ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('daily-state-first'),
      name: 'maoq_state_refresh_daily',
      arguments: {},
      agent: parent,
    })
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) }, { timeout: 4_000 })
    const request = engine.requests[0]!
    const requestArgs = request.args as Record<string, unknown>
    const features = requestArgs['features'] as StrategicFeatureRecord
    expect(requestArgs).toMatchObject({
      objective: MAOQ_DAILY_STATE_OBJECTIVE,
      specialists: MAOQ_DAILY_STATE_SPECIALISTS,
      analysisMode: 'quick',
    })
    expect(features.tradingDate).toBe('2026-08-28')
    expect(request.maxTotalAgents).toBe(2)
    engine.settle({
      value: { ...workflowValue(features, false, MAOQ_DAILY_STATE_SPECIALISTS), reports: [] },
      stopReason: 'completed',
      agentsStarted: 2,
    })
    const first = await pending
    expect(first.isError).toBe(false)
    if (first.isError) throw new Error('expected canonical daily state')
    expect(first.value).toMatchObject({ cacheHit: false, agentsStarted: 2 })

    const repeated = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('daily-state-repeated'),
      name: 'maoq_state_refresh_daily',
      arguments: {},
      agent: parent,
    })
    expect(repeated.isError).toBe(false)
    if (repeated.isError) throw new Error('expected cached canonical daily state')
    expect(repeated.value).toMatchObject({ cacheHit: true, agentsStarted: 0 })
    expect(engine.requests).toHaveLength(1)
    expect(repeated.value).toMatchObject({ decisionId: (first.value as Record<string, unknown>)['decisionId'] })

    const latest = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('daily-state-latest'),
      name: 'maoq_state_latest',
      arguments: { asOfTime: snapshots[2]!.identity.cutoffTime },
    })
    expect(latest.isError).toBe(false)
    if (latest.isError) throw new Error('expected latest canonical daily state')
    expect(latest.value).toMatchObject({
      found: true,
      freshness: { currentUseAllowed: true },
      state: { input: { objective: MAOQ_DAILY_STATE_OBJECTIVE, specialists: MAOQ_DAILY_STATE_SPECIALISTS } },
    })
  })

  it('fails closed before starting agents when three trading dates are unavailable', async () => {
    const { ctx, engine, parent } = await setup('quick', 2)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('daily-state-insufficient-history'),
      name: 'maoq_state_refresh_daily',
      arguments: {},
      agent: parent,
    })
    expect(result.isError).toBe(true)
    expect(engine.requests).toHaveLength(0)
    expect((result.content[0] as { text: string }).text).toContain('at least three distinct trading dates')
  })

  it('uses only synthesis plus independent risk review in quick mode', async () => {
    const { ctx, engine, snapshots, snapshotStore, parent } = await setup('quick')
    const arguments_ = {
      objective: '快速判断市场状态。',
      snapshotHash: snapshots[2]!.identity.contentHash,
      historySnapshotHashes: snapshots.slice(0, 2).map(item => item.identity.contentHash),
      decisionTime: '2026-08-28T16:00:00+08:00',
      maximumAgeHours: 48,
      specialists: ['market_regime'],
    } as const
    const pending = ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-quick'),
      name: 'maoq_analyze_strategy',
      arguments: arguments_,
      agent: parent,
    })
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) }, { timeout: 4_000 })
    const request = engine.requests[0]!
    const features = (request.args as Record<string, unknown>)['features'] as StrategicFeatureRecord
    expect(request.maxTotalAgents).toBe(2)
    expect(request.meta.name).toBe('maoq-strategic-state-quick')
    expect(request.script).toContain("args.analysisMode === 'deep' ? await Promise.all")
    const value = workflowValue(features)
    engine.settle({ value: { ...value, reports: [] }, stopReason: 'completed', agentsStarted: 2 })
    const result = await pending
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected quick strategic result')
    expect(result.value).toMatchObject({ analysisMode: 'quick', agentsStarted: 2, cacheHit: false })
    if (typeof result.value !== 'object' || result.value === null || Array.isArray(result.value)) {
      throw new Error('expected strategic result object')
    }
    const decisionIdValue: unknown = result.value['decisionId']
    if (typeof decisionIdValue !== 'string') throw new Error('expected strategic decision id')
    expect(decisionIdValue).toMatch(/^[a-f0-9]{64}$/)

    const repeatedResults = []
    for (let index = 1; index < 10; index += 1) {
      repeatedResults.push(await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId(`strategy-quick-repeated-${String(index)}`),
        name: 'maoq_analyze_strategy',
        arguments: arguments_,
        agent: parent,
      }))
    }
    expect(engine.requests).toHaveLength(1)
    for (const repeated of repeatedResults) {
      expect(repeated.isError).toBe(false)
      if (repeated.isError) throw new Error('expected cached strategic result')
      expect(repeated.value).toMatchObject({
        decisionId: decisionIdValue,
        analysisMode: 'quick',
        agentsStarted: 0,
        cacheHit: true,
      })
    }

    const latest = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-latest'),
      name: 'maoq_state_latest',
      arguments: {
        asOfTime: '2026-08-28T16:00:00+08:00',
      },
    })
    expect(latest.isError).toBe(false)
    if (latest.isError) throw new Error('expected latest state')
    expect(latest.value).toMatchObject({
      found: true,
      freshness: { status: 'fresh', currentUseAllowed: true, reasons: [] },
      state: { decisionId: decisionIdValue },
    })

    await snapshotStore.put(buildMarketSnapshot(datedDraft('2026-08-29', 3)))
    const stale = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-latest-stale'),
      name: 'maoq_state_latest',
      arguments: {
        asOfTime: '2026-08-29T16:00:00+08:00',
      },
    })
    expect(stale.isError).toBe(false)
    if (stale.isError) throw new Error('expected stale state result')
    expect(stale.value).toMatchObject({
      found: true,
      freshness: {
        status: 'stale',
        currentUseAllowed: false,
        reasons: ['snapshot_changed'],
      },
    })

    const history = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-history'),
      name: 'maoq_state_history',
      arguments: { limit: 10 },
    })
    expect(history.isError).toBe(false)
    if (history.isError) throw new Error('expected strategic history')
    expect(history.value).toMatchObject({
      count: 1,
      states: [{ decisionId: decisionIdValue, principalContradiction: '风险偏好修复与分歧压力的矛盾' }],
    })

    const byId = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-by-id'),
      name: 'maoq_state_get',
      arguments: { decisionId: decisionIdValue, asOfTime: '2026-08-28T16:00:00+08:00' },
    })
    expect(byId.isError).toBe(false)
    if (byId.isError) throw new Error('expected strategic state by id')
    expect(byId.value).toMatchObject({
      found: true,
      freshness: { status: 'fresh', currentUseAllowed: true },
      state: { decisionId: decisionIdValue },
    })
  })

  it('loads immutable snapshots, preserves deterministic labels, and exposes sourced Mao method attribution', async () => {
    const { ctx, engine, snapshots, parent } = await setup()
    const pending = ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy'),
      name: 'maoq_analyze_strategy',
      arguments: {
        objective: '判断主要矛盾与阻力最小的板块。',
        snapshotHash: snapshots[2]!.identity.contentHash,
        historySnapshotHashes: snapshots.slice(0, 2).map(item => item.identity.contentHash),
        decisionTime: '2026-08-28T16:00:00+08:00',
        maximumAgeHours: 24,
        specialists: ['market_regime'],
      },
      agent: parent,
    })
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) }, { timeout: 4_000 })
    const features = (engine.requests[0]!.args as Record<string, unknown>)['features'] as StrategicFeatureRecord
    expect(features.eligibleForInterpretation).toBe(true)
    expect(engine.requests[0]!.script).toContain('do not invent quotations')
    expect(engine.requests[0]!.script).toContain('enum: evidenceRefs')
    engine.settle({ value: workflowValue(features), stopReason: 'completed', agentsStarted: 3 })
    const result = await pending
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected strategic result')
    expect(result.value).toMatchObject({
      analysisMode: 'deep',
      status: 'approved',
      actionable: true,
      interpretation: {
        maoMethodApplications: [{ sourceTitle: '《矛盾论》', attributionKind: 'paraphrase' }],
      },
    })
    expect((result.content[0] as { text: string }).text).toContain('《矛盾论》')
  })

  it('rejects an invented specialist evidence reference outside model control', async () => {
    const { ctx, engine, snapshots, parent } = await setup()
    const pending = ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-bad-ref'),
      name: 'maoq_analyze_strategy',
      arguments: {
        objective: '判断市场状态。',
        snapshotHash: snapshots[2]!.identity.contentHash,
        historySnapshotHashes: snapshots.slice(0, 2).map(item => item.identity.contentHash),
        decisionTime: '2026-08-28T16:00:00+08:00',
        maximumAgeHours: 24,
        specialists: ['market_regime'],
      },
      agent: parent,
    })
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(1) }, { timeout: 4_000 })
    const features = (engine.requests[0]!.args as Record<string, unknown>)['features'] as StrategicFeatureRecord
    engine.settle({ value: workflowValue(features, true), stopReason: 'completed', agentsStarted: 3 })
    const result = await pending
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain('known evidence refs')
  })
})
