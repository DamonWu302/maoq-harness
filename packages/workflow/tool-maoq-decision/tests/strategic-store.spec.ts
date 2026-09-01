import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  StrategicDecisionStore,
  STRATEGIC_WORKFLOW_VERSION,
  evaluateStrategicStateFreshness,
  strategicDecisionId,
  summarizeStrategicDecision,
  type StrategicDecisionInput,
  type StrategicDecisionResult,
} from '../src/strategic-store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function input(hash: string, decisionTime: string): StrategicDecisionInput {
  return {
    objective: '判断市场主要矛盾与阻力最小方向。',
    snapshotHash: hash,
    historySnapshotHashes: ['1'.repeat(64), '2'.repeat(64)],
    decisionTime,
    maximumAgeHours: 24,
    specialists: ['market_regime', 'sector_battlefield'],
    analysisMode: 'quick',
    subagentProvider: 'codex',
    providerSettingsFingerprint: 'unavailable',
    featureEngineVersion: 'maoq-strategic-v1',
    workflowVersion: STRATEGIC_WORKFLOW_VERSION,
  }
}

function result(runId: string): StrategicDecisionResult {
  return {
    runId,
    agentsStarted: 2,
    analysisMode: 'quick',
    status: 'approved',
    actionable: true,
    features: {},
    reports: [],
    interpretation: {
      principalContradiction: '增量资金与高位拥挤的矛盾',
      leastResistanceBattlefield: '基础化工',
      eligiblePosture: 'probe',
    },
    risk: { verdict: 'approve' },
    tokenUsage: { total: { totalTokens: 100 } },
  }
}

describe('StrategicDecisionStore', () => {
  it('persists exact-input mirrors across store instances and keeps the first completed result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-decision-store-'))
    roots.push(root)
    const firstInput = input('a'.repeat(64), '2026-08-28T16:00:00+08:00')
    const first = await new StrategicDecisionStore(root).put(
      firstInput,
      result('run-first'),
      '2026-08-28',
      '2026-08-28T15:30:00+08:00',
    )
    expect(first.decisionId).toBe(strategicDecisionId(firstInput))

    const reloaded = await new StrategicDecisionStore(root).getByInput(firstInput)
    expect(reloaded).toMatchObject({ decisionId: first.decisionId, result: { runId: 'run-first' } })
    const repeated = await new StrategicDecisionStore(root).put(
      firstInput,
      result('run-repeated'),
      '2026-08-28',
      '2026-08-28T15:30:00+08:00',
    )
    expect(repeated.result.runId).toBe('run-first')
  })

  it('lists newest trading states first and enforces the scan bound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-decision-history-'))
    roots.push(root)
    const store = new StrategicDecisionStore(root)
    await store.put(
      input('a'.repeat(64), '2026-08-28T16:00:00+08:00'),
      result('run-old'),
      '2026-08-28',
      '2026-08-28T15:30:00+08:00',
    )
    const newest = await store.put(
      input('b'.repeat(64), '2026-08-29T16:00:00+08:00'),
      result('run-new'),
      '2026-08-29',
      '2026-08-29T15:30:00+08:00',
    )
    expect((await store.latest(10))?.decisionId).toBe(newest.decisionId)
    expect((await store.list(10, 10)).map(record => record.tradingDate)).toEqual(['2026-08-29', '2026-08-28'])
    expect(summarizeStrategicDecision(newest)).toMatchObject({
      principalContradiction: '增量资金与高位拥挤的矛盾',
      leastResistanceBattlefield: '基础化工',
      riskVerdict: 'approve',
    })
    await expect(store.list(10, 1)).rejects.toThrow(/scan bound/)
  })

  it('fails current use closed when time, snapshot, engine, mode, or provider changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-decision-freshness-'))
    roots.push(root)
    const record = await new StrategicDecisionStore(root).put(
      input('a'.repeat(64), '2026-08-28T16:00:00+08:00'),
      result('run-freshness'),
      '2026-08-28',
      '2026-08-28T15:30:00+08:00',
    )
    expect(evaluateStrategicStateFreshness(record, {
      evaluatedAt: '2026-08-29T15:30:00+08:00',
      currentSnapshotVerified: true,
      currentSnapshotHash: 'a'.repeat(64),
      featureEngineVersion: 'maoq-strategic-v1',
      workflowVersion: STRATEGIC_WORKFLOW_VERSION,
      analysisMode: 'quick',
      subagentProvider: 'codex',
      providerSettingsFingerprint: 'unavailable',
    })).toMatchObject({ status: 'fresh', currentUseAllowed: true, reasons: [] })
    expect(evaluateStrategicStateFreshness(record, {
      evaluatedAt: '2026-08-29T15:30:00.001+08:00',
      currentSnapshotVerified: true,
      currentSnapshotHash: 'b'.repeat(64),
      featureEngineVersion: 'maoq-strategic-v2',
      workflowVersion: 'maoq-strategic-workflow-v2',
      analysisMode: 'deep',
      subagentProvider: 'external',
      providerSettingsFingerprint: 'changed',
    })).toMatchObject({
      status: 'stale',
      currentUseAllowed: false,
      reasons: [
        'maximum_age_exceeded',
        'snapshot_changed',
        'feature_engine_changed',
        'workflow_changed',
        'analysis_mode_changed',
        'provider_route_changed',
        'provider_settings_changed',
      ],
    })
  })

  it('fails current use closed when the snapshot catalog cannot be verified', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-decision-unverified-'))
    roots.push(root)
    const record = await new StrategicDecisionStore(root).put(
      input('a'.repeat(64), '2026-08-28T16:00:00+08:00'),
      result('run-unverified'),
      '2026-08-28',
      '2026-08-28T15:30:00+08:00',
    )
    expect(evaluateStrategicStateFreshness(record, {
      evaluatedAt: '2026-08-28T16:00:00+08:00',
      currentSnapshotVerified: false,
      featureEngineVersion: 'maoq-strategic-v1',
      workflowVersion: STRATEGIC_WORKFLOW_VERSION,
      analysisMode: 'quick',
      subagentProvider: 'codex',
      providerSettingsFingerprint: 'unavailable',
    })).toMatchObject({
      status: 'stale',
      currentUseAllowed: false,
      reasons: ['current_snapshot_unverified'],
    })
  })
})
