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

async function setup(analysisMode: 'quick' | 'deep' = 'deep') {
  const root = await mkdtemp(join(tmpdir(), 'maoq-strategic-tool-'))
  roots.push(root)
  const snapshots = [
    buildMarketSnapshot(datedDraft('2026-08-26', 0)),
    buildMarketSnapshot(datedDraft('2026-08-27', 1)),
    buildMarketSnapshot(datedDraft('2026-08-28', 2)),
  ]
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
  await ctx.plugin(toolMaoqDecision, { subagentProvider: 'fresh', analysisMode })
  return { ctx, engine: ctx.workflowEngine as StubEngine, snapshots, parent: { id: SessionId('commander'), options: {} } as unknown as Agent }
}

function workflowValue(features: StrategicFeatureRecord, badRef = false) {
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
      selectedSpecialists: ['market_regime'],
    },
    risk: { approved: true, verdict: 'approve', reasons: ['引用闭合'], evidenceRefs: [refs[0]!], hardLimits: ['禁止实盘'] },
    tokenUsage: { calls: [], total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, unavailableCalls: 0 },
  }
}

describe('maoq_analyze_strategy', () => {
  it('uses only synthesis plus independent risk review in quick mode', async () => {
    const { ctx, engine, snapshots, parent } = await setup('quick')
    const pending = ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('strategy-quick'),
      name: 'maoq_analyze_strategy',
      arguments: {
        objective: '快速判断市场状态。',
        snapshotHash: snapshots[2]!.identity.contentHash,
        historySnapshotHashes: snapshots.slice(0, 2).map(item => item.identity.contentHash),
        decisionTime: '2026-08-28T16:00:00+08:00',
        maximumAgeHours: 24,
        specialists: ['market_regime'],
      },
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
    expect(result.value).toMatchObject({ analysisMode: 'quick', agentsStarted: 2 })
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
