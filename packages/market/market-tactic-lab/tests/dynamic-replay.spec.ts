import { describe, expect, it } from 'vitest'
import { ACTIVE_TACTIC_IDS } from '@deepseek-ai/dsh-market-tactic-eligibility'
import { STRATEGIC_ENGINE_VERSION, type StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { createTacticCommanderDecision } from '@deepseek-ai/dsh-market-tactic-routing'
import {
  DYNAMIC_TACTIC_REPLAY_VERSION,
  evaluateDynamicTacticReplay,
  TACTIC_EVALUATION_ENGINE_VERSION,
  type ResearchTacticEvaluation,
  type ResearchTacticSuiteHistoryEvaluation,
} from '../src/index.ts'

function dateAt(index: number): string {
  return new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
}

function hashAt(index: number, offset: number): string {
  return (index + offset).toString(16).padStart(64, '0')
}

function strategic(index: number): StrategicFeatureRecord {
  const tradingDate = dateAt(index)
  const currentSnapshotHash = hashAt(index, 1)
  return {
    schemaVersion: 1,
    engineVersion: STRATEGIC_ENGINE_VERSION,
    inputSnapshotHashes: [currentSnapshotHash],
    currentSnapshotHash,
    tradingDate,
    cutoffTime: `${tradingDate}T19:00:00+08:00`,
    evidence: [],
    marketRegime: {
      status: 'ready',
      value: {
        label: 'risk_on_trend',
        advanceRatio: 0.65,
        meanIndexChangePct: 0.01,
        limitBalance: 0.5,
        brokenLimitPressure: 0.1,
        lossEffectRate: 0.05,
      },
      evidenceRefs: [`snapshot:${currentSnapshotHash}#market`],
    },
    emotionCycle: {
      status: 'ready',
      value: {
        label: 'startup',
        boardHeight: 2,
        promotionRate: 0.4,
        brokenLimitRate: 0.1,
        lossEffectRate: 0.05,
        advanceRatio: 0.65,
      },
      evidenceRefs: [`snapshot:${currentSnapshotHash}#emotion`],
    },
    sectorBattlefields: {
      status: 'ready',
      value: [{
        sectorId: 'sector-a',
        name: 'Sector A',
        strength: 0.8,
        persistence: 0.8,
        capacity: 0.7,
        catalystSupport: 0,
        internalBreadth: 0.7,
        leaderQuality: 0.7,
        crowding: 0.2,
        resistance: 0.2,
        compositeScore: 0.6,
        evidenceRefs: [`snapshot:${currentSnapshotHash}#sector-a`],
      }],
      evidenceRefs: [`snapshot:${currentSnapshotHash}#sector-a`],
    },
    eligibleForInterpretation: true,
  }
}

function evaluation(tacticId: typeof ACTIVE_TACTIC_IDS[number], sessions: number): ResearchTacticEvaluation {
  const equityCurve = Array.from({ length: sessions }, (_, index) => ({
    tradingDate: dateAt(index),
    equity: 1_000_000 * 1.01 ** index,
    dailyReturn: index === 0 ? 0 : 0.01,
    grossExposure: 0.5,
  }))
  const doubledCostEquityCurve = Array.from({ length: sessions }, (_, index) => ({
    tradingDate: dateAt(index),
    equity: 1_000_000 * 1.008 ** index,
    dailyReturn: index === 0 ? 0 : 0.008,
    grossExposure: 0.5,
  }))
  const orders = Array.from({ length: sessions - 1 }, (_, index) => ({
    orderId: `${tacticId}:${String(index)}`,
    symbol: 'TARGET',
    signalDate: dateAt(index),
    side: 'buy' as const,
    quantity: 100,
  }))
  return {
    engineVersion: TACTIC_EVALUATION_ENGINE_VERSION,
    config: {
      tacticId,
      maximumPositions: 1,
      targetPositionFraction: 0.1,
      holdingSessions: 1,
      entryIntervalSessions: 1,
      foldSessions: 5,
    },
    orders,
    equityCurve,
    doubledCostEquityCurve,
    execution: {
      fills: orders.map(order => ({ orderId: order.orderId })),
      rejections: [],
    },
  } as unknown as ResearchTacticEvaluation
}

function suite(sessions = 20): ResearchTacticSuiteHistoryEvaluation {
  return {
    engineVersion: TACTIC_EVALUATION_ENGINE_VERSION,
    historyAdapter: 'dynamic-fixture',
    historyChunkHashes: [hashAt(0, 500)],
    sourceExecutionHashes: Array.from({ length: sessions }, (_, index) => hashAt(index, 100)),
    strategicFeatures: Array.from({ length: sessions }, (_, index) => strategic(index)),
    benchmarks: {
      '000001.SH': Array.from({ length: sessions }, (_, index) => ({
        benchmarkId: '000001.SH',
        name: 'SSE Composite',
        kind: 'market_index' as const,
        tradingDate: dateAt(index),
        dailyReturn: index === 0 ? 0 : index % 2 === 0 ? 0.004 : -0.002,
        provenance: {
          source: {
            adapter: 'dynamic-fixture',
            dataset: 'index',
            version: 'v1',
            retrievedAt: `${dateAt(index)}T19:00:00+08:00`,
            recordId: `${dateAt(index)}:000001.SH`,
          },
          transforms: ['return=fixture'],
        },
      })),
    },
    evaluations: Object.fromEntries(ACTIVE_TACTIC_IDS.map(tacticId => [
      tacticId,
      evaluation(tacticId, sessions),
    ])) as ResearchTacticSuiteHistoryEvaluation['evaluations'],
    promotionAudit: {},
  } as unknown as ResearchTacticSuiteHistoryEvaluation
}

type MutableReplaySuite = Omit<ResearchTacticSuiteHistoryEvaluation,
  'sourceExecutionHashes' | 'strategicFeatures' | 'benchmarks' | 'evaluations'> & {
    sourceExecutionHashes: string[]
    strategicFeatures: StrategicFeatureRecord[]
    benchmarks: Record<string, ResearchTacticSuiteHistoryEvaluation['benchmarks'][string]>
    evaluations: Record<typeof ACTIVE_TACTIC_IDS[number], ResearchTacticEvaluation>
  }

function mutableSuite(sessions = 20): MutableReplaySuite {
  return structuredClone(suite(sessions)) as MutableReplaySuite
}

function defensiveDecision(input: ResearchTacticSuiteHistoryEvaluation) {
  const deterministic = evaluateDynamicTacticReplay(input)
  const route = deterministic.routes.find(item => item.slate.some(candidate => candidate.tacticId !== 'defensive_no_trade'))!
  return createTacticCommanderDecision(route, {
    routeId: route.routeId,
    primaryTacticId: 'defensive_no_trade',
    secondaryTacticId: null,
    thesis: 'The qualified tactics do not yet justify attack after resistance is considered.',
    evidenceRefs: route.defensiveFallback.evidenceRefs,
    counterEvidenceRefs: route.slate.flatMap(item => item.evidenceRefs),
    confidence: 0.6,
    invalidationConditions: ['One routed tactic gains a materially stronger evidence margin.'],
  }, {
    routeId: route.routeId,
    approved: true,
    verdict: 'approve',
    reasons: ['Defense remains within the host-owned fallback.'],
    hardLimits: ['No order may be created.'],
    invalidationConditions: ['A new route requires a new review.'],
  })
}

describe('dynamic tactic prequential replay', () => {
  it('activates only after eight same-context outcomes mature and accepts recorded commander coverage', () => {
    const input = suite()
    const deterministic = evaluateDynamicTacticReplay(input)
    expect(deterministic.replayVersion).toBe(DYNAMIC_TACTIC_REPLAY_VERSION)
    expect(deterministic.days.slice(0, 9).every(day => day.deterministicTacticId === 'defensive_no_trade')).toBe(true)
    expect(deterministic.tracks.deterministicRoute.activeSessions).toBeGreaterThan(0)
    expect(deterministic.benchmarks['000001.SH']).toMatchObject({
      benchmarkId: '000001.SH',
      performance: { observations: 19 },
      comparisons: {
        defensiveNoTrade: {
          beta: 0,
        },
      },
    })
    expect(deterministic.benchmarks['000001.SH']?.comparisons.deterministicRoute.byMarketRegime)
      .toHaveProperty('risk_on_trend')
    const decision = defensiveDecision(input)
    const route = deterministic.routes.find(item => item.routeId === decision.routeId)!
    const assisted = evaluateDynamicTacticReplay(input, [decision])
    expect(assisted).toMatchObject({ commanderDecisions: 1 })
    expect(assisted.commanderCoverage).toBeGreaterThan(0)
    expect(assisted.days.find(day => day.routeId === route.routeId)).toMatchObject({
      commanderDecisionId: decision.decisionId,
      finalTacticId: 'defensive_no_trade',
    })
  })

  it('rejects invalid policy values and misaligned replay inputs', () => {
    const input = mutableSuite()
    for (const cost of [Number.NaN, -1, 101]) {
      expect(() => evaluateDynamicTacticReplay(input, [], cost)).toThrow(/switchingCostBps/)
    }
    expect(() => evaluateDynamicTacticReplay(mutableSuite(2))).toThrow(/aligned strategic/)
    input.sourceExecutionHashes.pop()
    expect(() => evaluateDynamicTacticReplay(input)).toThrow(/aligned strategic/)
    const curveMismatch = mutableSuite()
    const tacticId = ACTIVE_TACTIC_IDS[0]!
    const current = curveMismatch.evaluations[tacticId]
    curveMismatch.evaluations[tacticId] = {
      ...current,
      doubledCostEquityCurve: current.doubledCostEquityCurve.slice(1),
    }
    expect(() => evaluateDynamicTacticReplay(curveMismatch)).toThrow(/curve mismatch/)

    const benchmarkMismatch = mutableSuite()
    benchmarkMismatch.benchmarks['000001.SH'] = benchmarkMismatch.benchmarks['000001.SH']!.slice(1)
    expect(() => evaluateDynamicTacticReplay(benchmarkMismatch)).toThrow(/not aligned to the replay/)
  })

  it('rejects duplicate recorded decisions for one route', () => {
    const input = suite()
    const decision = defensiveDecision(input)
    expect(() => evaluateDynamicTacticReplay(input, [decision, decision])).toThrow(/duplicate commander/)
  })

  it('surfaces invalid equity and incomplete intermediate curves', () => {
    const zero = mutableSuite()
    for (const tacticId of ACTIVE_TACTIC_IDS) {
      const current = zero.evaluations[tacticId]
      const equityCurve = [...current.equityCurve]
      equityCurve[0] = { ...equityCurve[0]!, equity: 0 }
      zero.evaluations[tacticId] = { ...current, equityCurve }
    }
    expect(() => evaluateDynamicTacticReplay(zero)).toThrow(/positive equity/)

    const sparse = mutableSuite()
    for (const tacticId of ACTIVE_TACTIC_IDS) {
      const current = sparse.evaluations[tacticId]
      const equityCurve = [...current.equityCurve]
      const doubledCostEquityCurve = [...current.doubledCostEquityCurve]
      equityCurve.splice(1, 1, undefined as unknown as ResearchTacticEvaluation['equityCurve'][number])
      doubledCostEquityCurve.splice(
        1,
        1,
        undefined as unknown as ResearchTacticEvaluation['doubledCostEquityCurve'][number],
      )
      sparse.evaluations[tacticId] = {
        ...current,
        config: { ...current.config, holdingSessions: 2 },
        equityCurve,
        doubledCostEquityCurve,
      }
    }
    expect(() => evaluateDynamicTacticReplay(sparse)).toThrow(/equity curve is incomplete/)
  })

  it('records normal execution quality and zero coverage when all strategic days abstain', () => {
    const normal = mutableSuite()
    for (const tacticId of ACTIVE_TACTIC_IDS) {
      const current = normal.evaluations[tacticId]
      normal.evaluations[tacticId] = {
        ...current,
        config: { ...current.config, holdingSessions: 2 },
        execution: { ...current.execution, fills: current.execution.fills.filter((_fill, index) => index % 2 === 0) },
      }
    }
    expect(evaluateDynamicTacticReplay(normal).routes.some(route => route.context.executionQualityBand === 'normal')).toBe(true)

    const unavailable = mutableSuite()
    unavailable.strategicFeatures = unavailable.strategicFeatures.map(features => ({
      ...features,
      eligibleForInterpretation: false,
    }))
    expect(evaluateDynamicTacticReplay(unavailable)).toMatchObject({
      routableSessions: 0,
      commanderDecisions: 0,
      commanderCoverage: 0,
    })
  })

  it('fails closed for a nonpositive battlefield', () => {
    const noBattlefield = mutableSuite()
    noBattlefield.strategicFeatures = noBattlefield.strategicFeatures.map(features => ({
      ...features,
      sectorBattlefields: {
        ...features.sectorBattlefields,
        value: features.sectorBattlefields.status === 'ready'
          ? features.sectorBattlefields.value.map(item => ({ ...item, compositeScore: 0 }))
          : [],
      },
    }))
    expect(evaluateDynamicTacticReplay(noBattlefield).routableSessions).toBe(0)

    const emptyBattlefield = mutableSuite()
    emptyBattlefield.strategicFeatures = emptyBattlefield.strategicFeatures.map(features => ({
      ...features,
      sectorBattlefields: { status: 'ready', value: [], evidenceRefs: [] },
    }))
    expect(evaluateDynamicTacticReplay(emptyBattlefield).routableSessions).toBe(0)
  })
})
