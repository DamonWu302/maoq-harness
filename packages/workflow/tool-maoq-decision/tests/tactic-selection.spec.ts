import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, type Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import {
  buildMarketSnapshot,
  contentHash,
  MarketSnapshotService,
  MarketSnapshotStore,
  type MarketProvenance,
  type MarketSnapshotDraft,
} from '@deepseek-ai/dsh-market-snapshot'
import { computeStrategicFeatures, STRATEGIC_ENGINE_VERSION } from '@deepseek-ai/dsh-market-strategic-state'
import {
  createEmptyTacticScorecard,
  TACTIC_ROUTER_VERSION,
  TacticRoutingStore,
  type TacticRouteCandidate,
  type TacticRoutingRecord,
} from '@deepseek-ai/dsh-market-tactic-routing'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentCapabilities, SubagentProvider, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { WorkflowEngine, WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type { WorkflowResult, WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { normalDraft } from '../../../market/market-snapshot/tests/fixtures.ts'
import type { ResolvedConfig } from '../src/index.ts'
import { executeTacticSelection, registerTacticCommanderTool } from '../src/tactic.ts'
import {
  StrategicDecisionStore,
  STRATEGIC_WORKFLOW_VERSION,
  type StrategicDecisionInput,
  type StrategicDecisionResult,
} from '../src/strategic-store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

class StubEngine extends WorkflowEngine {
  requests: WorkflowStartRequest[] = []
  settle!: (result: WorkflowResult) => void
  disposed = 0
  cancelled: string[] = []

  start(request: WorkflowStartRequest): WorkflowRun {
    this.requests.push(request)
    const result = new Promise<WorkflowResult>((resolve) => { this.settle = resolve })
    return {
      id: WorkflowRunId('tactic-run'),
      meta: request.meta,
      result,
      cancel: (reason) => {
        this.cancelled.push(reason ?? '')
        this.settle({ value: null, stopReason: 'cancelled', agentsStarted: 0, ...(reason === undefined ? {} : { error: reason }) })
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
  readonly inheritsParentContext = false
  readonly capabilities: SubagentCapabilities = {
    agentOptions: true,
    outputSchema: true,
    depthLimit: true,
    toolFilter: true,
    persona: true,
  }

  start(_request: SubagentStartRequest): Promise<SubagentRun> {
    return Promise.reject(new Error('owned by stub workflow engine'))
  }
}

const ZERO_COMPONENTS = {
  stateFit: 0,
  conditionalExpectancy: 0,
  contextAlignment: 0,
  recentEffectiveness: 0,
  executionAndCost: 0,
  drawdownPenalty: 0,
  crowdingPenalty: 0,
  transitionPenalty: 0,
  uncertaintyPenalty: 0,
}

function candidate(tacticId: TacticRouteCandidate['tacticId']): TacticRouteCandidate {
  const defense = tacticId === 'defensive_no_trade'
  return {
    tacticId,
    tacticVersion: defense ? 'defensive-no-trade-v1' : 'regime-signed-breakout-pullback-v1',
    promotionStatus: defense ? 'eligible' : 'research',
    eligibilityStatus: defense ? 'eligible' : 'research_only',
    scope: defense ? 'defense' : 'research',
    routeScore: defense ? 0 : 0.3,
    evidenceScope: defense ? null : 'exact_context',
    scoreComponents: ZERO_COMPONENTS,
    metrics: null,
    maximumPaperPositionPct: 0,
    evidenceRefs: [`snapshot:${'a'.repeat(64)}#${tacticId}`],
  }
}

function route(active = true): TacticRoutingRecord {
  const defense = candidate('defensive_no_trade')
  const body: Omit<TacticRoutingRecord, 'routeId'> = {
    routerVersion: TACTIC_ROUTER_VERSION,
    tradingDate: '2026-09-02',
    cutoffTime: '2026-09-02T19:15:00+08:00',
    currentSnapshotHash: 'a'.repeat(64),
    eligibilityEngineVersion: 'maoq-tactic-eligibility-v3',
    scorecardId: 'b'.repeat(64),
    context: {
      contextVersion: 'maoq-tactic-context-v1',
      marketRegime: 'risk_on_trend',
      emotionCycle: 'startup',
      sectorStructure: 'broad',
      volatilityBand: 'normal',
      crowdingBand: 'low',
      executionQualityBand: 'normal',
    },
    slate: active ? [candidate('regime_signed_breakout_pullback'), defense] : [defense],
    defensiveFallback: defense,
    rejected: [],
    cashFloorPct: 100,
  }
  return { ...body, routeId: contentHash(body) }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'maoq-tactic-selection-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SubagentRuntime)
  ctx.subagents.registerProvider(new StubProvider())
  await ctx.plugin(StubEngine)
  const config: ResolvedConfig = {
    subagentProvider: 'fresh',
    maxSpecialists: 4,
    maxResultChars: 32_768,
    analysisMode: 'quick',
    stateRoot: join(root, 'decisions'),
    tacticStateRoot: join(root, 'tactics'),
    maxStateFiles: 500,
    maxTacticStateFiles: 500,
    maxSnapshotFiles: 500,
    dailyStateMaximumAgeHours: 24,
    autoDailyRefresh: false,
    dailyRefreshTime: '19:15',
    dailyRefreshRetryMinutes: 15,
    dailyRefreshWindowMinutes: 120,
  }
  return {
    ctx,
    engine: ctx.workflowEngine as StubEngine,
    config,
    parent: { id: SessionId('tactic-parent'), options: {} } as unknown as Agent,
  }
}

function datedDraft(date: string, offset: number): MarketSnapshotDraft {
  const base = normalDraft()
  const retrievedAt = `${date}T18:50:00+08:00`
  const provenance = (value: MarketProvenance): MarketProvenance => ({
    ...value,
    source: { ...value.source, retrievedAt, recordId: `${value.source.recordId}-${date}` },
  })
  return {
    ...base,
    identity: {
      ...base.identity,
      tradingDate: date,
      cutoffTime: `${date}T19:00:00+08:00`,
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
    news: base.news.map(item => ({
      ...item,
      id: `${item.id}-${date}`,
      publishedAt: `${date}T10:00:00+08:00`,
      fetchedAt: `${date}T10:01:00+08:00`,
      eventAt: `${date}T10:00:00+08:00`,
      provenance: provenance(item.provenance),
    })),
  }
}

async function setupToolState(options: {
  state?: 'none' | 'fresh' | 'vetoed' | 'stale' | 'mismatch'
  maxResultChars?: number
  scorecard?: boolean
} = {}) {
  const fixture = await setup()
  Object.assign(fixture.config, { maxResultChars: options.maxResultChars ?? fixture.config.maxResultChars })
  const snapshots = [
    buildMarketSnapshot(datedDraft('2026-08-30', 0)),
    buildMarketSnapshot(datedDraft('2026-08-31', 1)),
    buildMarketSnapshot(datedDraft('2026-09-01', 2)),
  ]
  const snapshot = snapshots[2]!
  const snapshotRoot = join(fixture.config.stateRoot, '..', 'snapshots')
  await Promise.all(snapshots.map(item => new MarketSnapshotStore(snapshotRoot).put(item)))
  await fixture.ctx.plugin(SystemPrompt)
  await fixture.ctx.plugin(ToolRuntime)
  await fixture.ctx.plugin(MarketSnapshotService, { root: snapshotRoot })
  registerTacticCommanderTool(fixture.ctx, () => fixture.config)
  if ((options.state ?? 'fresh') !== 'none') {
    const features = computeStrategicFeatures(snapshot, snapshots.slice(0, 2))
    const state = options.state ?? 'fresh'
    const input: StrategicDecisionInput = {
      objective: '识别主要矛盾与阻力最小方向。',
      snapshotHash: snapshot.identity.contentHash,
      historySnapshotHashes: [],
      decisionTime: snapshot.identity.cutoffTime,
      maximumAgeHours: 48,
      specialists: ['market_regime', 'sector_battlefield'],
      analysisMode: state === 'stale' ? 'deep' : 'quick',
      subagentProvider: 'fresh',
      providerSettingsFingerprint: 'unavailable',
      featureEngineVersion: STRATEGIC_ENGINE_VERSION,
      workflowVersion: STRATEGIC_WORKFLOW_VERSION,
    }
    const result: StrategicDecisionResult = {
      runId: 'strategic-fixture',
      agentsStarted: 2,
      analysisMode: input.analysisMode,
      status: state === 'vetoed' ? 'vetoed' : 'approved',
      actionable: state !== 'vetoed',
      features: (state === 'mismatch'
        ? { ...features, currentSnapshotHash: 'f'.repeat(64) }
        : features) as unknown as StrategicDecisionResult['features'],
      reports: [],
      interpretation: {},
      risk: {},
      tokenUsage: {},
    }
    await new StrategicDecisionStore(fixture.config.stateRoot).put(
      input,
      result,
      features.tradingDate,
      features.cutoffTime,
    )
    if (options.scorecard === true) {
      await new TacticRoutingStore(fixture.config.tacticStateRoot)
        .publishScorecard(createEmptyTacticScorecard('2026-09-01T18:00:00+08:00'))
    }
  }
  return fixture
}

function executeTool(fixture: Awaited<ReturnType<typeof setup>>, agent: Agent | undefined = fixture.parent) {
  return fixture.ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('tactic-tool-call'),
    name: 'maoq_select_tactics',
    arguments: {},
    ...(agent === undefined ? {} : { agent }),
  })
}

describe('P2 routed tactic workflow', () => {
  it('shows only the deterministic route to two fresh agents and persists the host decision', async () => {
    const fixture = await setup()
    const routed = route()
    const pending = executeTacticSelection(
      fixture.ctx,
      fixture.config,
      routed,
      fixture.parent,
      new AbortController().signal,
    )
    await vi.waitFor(() => { expect(fixture.engine.requests).toHaveLength(1) })
    expect(fixture.engine.requests[0]).toMatchObject({ maxTotalAgents: 2, args: { route: routed } })
    expect(fixture.engine.requests[0]!.script).toContain('Choose only from the exact deterministic route')
    expect(fixture.engine.requests[0]!.script).toContain('secondaryTacticId: proposalResult.value.secondaryTacticId || null')
    const evidenceRefs = routed.slate[0]!.evidenceRefs
    fixture.engine.settle({
      stopReason: 'completed',
      agentsStarted: 2,
      value: {
        proposal: {
          routeId: routed.routeId,
          primaryTacticId: 'regime_signed_breakout_pullback',
          secondaryTacticId: null,
          thesis: 'The qualified trend route has the strongest bounded evidence.',
          evidenceRefs,
          counterEvidenceRefs: [],
          confidence: 0.7,
          invalidationConditions: ['The tactic leaves the deterministic route.'],
        },
        risk: {
          routeId: routed.routeId,
          approved: true,
          verdict: 'approve',
          reasons: ['The proposal stays inside the route.'],
          hardLimits: ['Research scope creates no paper position.'],
          invalidationConditions: ['A new route requires a new review.'],
        },
        tokenUsage: { calls: [], total: {}, unavailableCalls: 0 },
      },
    })
    const result = await pending
    expect(result).toMatchObject({ agentsStarted: 2, decision: { scope: 'research', status: 'approved' } })
    const persisted = await new TacticRoutingStore(fixture.config.tacticStateRoot)
      .getDecision(result.decision.decisionId)
    expect(persisted).toEqual(result.decision)
  })

  it('uses deterministic defense without starting unnecessary agents', async () => {
    const fixture = await setup()
    const result = await executeTacticSelection(
      fixture.ctx,
      fixture.config,
      route(false),
      fixture.parent,
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      agentsStarted: 0,
      decision: { scope: 'defense', finalPrimaryTacticId: 'defensive_no_trade' },
    })
    expect(fixture.engine.requests).toHaveLength(0)
  })

  it('offers the defensive fallback when the active slate omits it', async () => {
    const fixture = await setup()
    const base = route()
    const active = base.slate[0] as TacticRouteCandidate
    const { routeId: _routeId, ...routeBody } = base
    const body: Omit<TacticRoutingRecord, 'routeId'> = { ...routeBody, slate: [active] }
    const routed = { ...body, routeId: contentHash(body) }
    const pending = executeTacticSelection(
      fixture.ctx,
      fixture.config,
      routed,
      fixture.parent,
      new AbortController().signal,
    )
    await vi.waitFor(() => { expect(fixture.engine.requests).toHaveLength(1) })
    expect(fixture.engine.requests[0]!.script).toContain('args.route.defensiveFallback.tacticId')
    fixture.engine.settle({
      stopReason: 'completed',
      agentsStarted: 2,
      value: {
        proposal: {
          routeId: routed.routeId,
          primaryTacticId: 'defensive_no_trade',
          secondaryTacticId: null,
          thesis: 'The routed active tactic does not justify attack under current resistance.',
          evidenceRefs: routed.defensiveFallback.evidenceRefs,
          counterEvidenceRefs: routed.slate.flatMap(item => item.evidenceRefs),
          confidence: 0.6,
          invalidationConditions: ['The active route gains a stronger evidence margin.'],
        },
        risk: {
          routeId: routed.routeId,
          approved: true,
          verdict: 'approve',
          reasons: ['Defense remains inside the host-owned route fallback.'],
          hardLimits: ['No order may be created.'],
          invalidationConditions: ['A new route requires a new review.'],
        },
        tokenUsage: { calls: [], total: {}, unavailableCalls: 0 },
      },
    })
    expect((await pending).decision).toMatchObject({ scope: 'defense', finalPrimaryTacticId: 'defensive_no_trade' })
  })

  it('cancels on parent abort, disposes the run, and rejects malformed workflow output', async () => {
    const aborted = await setup()
    const controller = new AbortController()
    const pending = executeTacticSelection(aborted.ctx, aborted.config, route(), aborted.parent, controller.signal)
    await vi.waitFor(() => { expect(aborted.engine.requests).toHaveLength(1) })
    controller.abort()
    await expect(pending).rejects.toThrow(/parent step aborted/)
    expect(aborted.engine.cancelled).toEqual(['parent step aborted'])
    expect(aborted.engine.disposed).toBe(1)

    const preAborted = await setup()
    const before = new AbortController()
    before.abort()
    await expect(executeTacticSelection(preAborted.ctx, preAborted.config, route(), preAborted.parent, before.signal))
      .rejects.toThrow(/parent step aborted/)
    expect(preAborted.engine.disposed).toBe(1)

    const malformed = await setup()
    const malformedPending = executeTacticSelection(
      malformed.ctx,
      malformed.config,
      route(),
      malformed.parent,
      new AbortController().signal,
    )
    await vi.waitFor(() => { expect(malformed.engine.requests).toHaveLength(1) })
    malformed.engine.settle({ stopReason: 'completed', agentsStarted: 2, value: [] })
    await expect(malformedPending).rejects.toThrow(/malformed result/)
    expect(malformed.engine.disposed).toBe(1)
  })

  it('executes the registered zero-agent defense path from a fresh persisted strategic mirror', async () => {
    for (const scorecard of [false, true]) {
      const fixture = await setupToolState({ scorecard })
      const result = await executeTool(fixture)
      expect(result.isError).toBe(false)
      if (result.isError) throw new Error('expected tactic tool success')
      expect(result.value).toMatchObject({ agentsStarted: 0, decision: { scope: 'defense' } })
    }
  })

  it('fails closed for missing, vetoed, stale, or mirror-inconsistent strategic state', async () => {
    for (const state of ['none', 'vetoed', 'stale', 'mismatch'] as const) {
      const fixture = await setupToolState({ state })
      expect((await executeTool(fixture)).isError).toBe(true)
    }
    const missingAgent = await setupToolState()
    expect((await missingAgent.ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('tactic-missing-agent'),
      name: 'maoq_select_tactics',
      arguments: {},
    })).isError).toBe(true)
  })

  it('renders both truncation forms and exposes compact presentation metadata', async () => {
    const tiny = await setupToolState({ maxResultChars: 5 })
    const tinyResult = await executeTool(tiny)
    expect((tinyResult.content[0] as { text: string }).text).toHaveLength(5)

    const bounded = await setupToolState({ maxResultChars: 40 })
    const boundedResult = await executeTool(bounded)
    expect((boundedResult.content[0] as { text: string }).text.endsWith('… [truncated]')).toBe(true)

    const full = await setupToolState()
    const fullResult = await executeTool(full)
    expect((fullResult.content[0] as { text: string }).text).toContain('deterministic:')
    const definition = full.ctx.tools.get('maoq_select_tactics')
    expect(definition?.presentCall?.({})).toEqual({ card: 'generic', title: 'Select routed MAOQ tactics' })
    expect(definition?.presentResult?.({}, { content: [], isError: false })).toEqual({ card: 'generic' })

    if (definition === undefined) throw new Error('maoq_select_tactics definition missing')
    const controller = new AbortController()
    controller.abort()
    await expect(definition.execute({}, {
      signal: controller.signal,
      agent: full.parent,
    } as unknown as ToolRunContext)).resolves.toMatchObject({ agentsStarted: 0 })
  })
})
