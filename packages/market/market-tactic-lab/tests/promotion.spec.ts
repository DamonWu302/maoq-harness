import { describe, expect, it } from 'vitest'
import {
  auditResearchTacticSuite,
  DEFAULT_A_SHARE_EXECUTION_POLICY,
  TACTIC_EVALUATION_ENGINE_VERSION,
  type ResearchTacticEvaluation,
  type ResearchTacticId,
  type ResearchTacticSignal,
} from '../src/index.ts'

const TACTICS = [
  'regime_signed_breakout_pullback',
  'openable_emotion_leader',
  'industry_relative_exhaustion_repair',
] as const satisfies readonly ResearchTacticId[]

function dateAt(index: number): string {
  return new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10)
}

function stateSignal(tacticId: ResearchTacticId, index: number): ResearchTacticSignal {
  const states = [
    { breadth1: 0.5, breadth20: 0.4, limitUp: 0.01 },
    { breadth1: 0.6, breadth20: 0.6, limitUp: 0 },
    { breadth1: 0.52, breadth20: 0.5, limitUp: 0 },
    { breadth1: 0.4, breadth20: 0.4, limitUp: 0 },
  ] as const
  const state = states[index % states.length]!
  return {
    tacticId,
    tacticVersion: `${tacticId}-v1`,
    tradingDate: dateAt(index),
    featureHash: (index + 1).toString(16).padStart(64, '0'),
    gatePassed: true,
    gateReason: 'fixture',
    marketBreadth1: state.breadth1,
    marketBreadth20: state.breadth20,
    currentLimitUpRatio: state.limitUp,
    candidates: [{
      symbol: 'TARGET',
      score: 1,
      amountMean20: 100_000_000,
      evidenceRefs: [`fixture:${String(index)}`],
    }],
  }
}

function evaluation(tacticId: ResearchTacticId, tacticIndex: number): ResearchTacticEvaluation {
  const equityCurve = Array.from({ length: 65 }, (_, index) => ({
    tradingDate: dateAt(index),
    equity: 1_000_000 + index * (1_000 + tacticIndex * 100),
    dailyReturn: index === 0 ? 0 : 0.001 + tacticIndex * 0.0001 + (index % 3 - 1) * 0.0002,
    grossExposure: 0.2,
  }))
  const foldReturns = tacticIndex === 0
    ? [0.08, 0.01, 0.07, -0.01]
    : tacticIndex === 1 ? [0.02, 0.06, -0.01, 0.05] : [-0.01, 0.03, 0.08, 0.02]
  const metrics = {
    observations: equityCurve.length,
    totalReturn: 0.064,
    annualizedReturn: 0.25,
    annualizedSharpe: 1.1 + tacticIndex * 0.15,
    maximumDrawdown: 0.1,
    turnover: 2,
    fillRate: 1,
    positiveFoldRatio: 0.75,
  }
  return {
    engineVersion: TACTIC_EVALUATION_ENGINE_VERSION,
    config: {
      tacticId,
      maximumPositions: 5,
      targetPositionFraction: 0.15,
      holdingSessions: 5,
      entryIntervalSessions: 1,
      foldSessions: 16,
    },
    policy: DEFAULT_A_SHARE_EXECUTION_POLICY,
    signals: Array.from({ length: 64 }, (_, index) => stateSignal(tacticId, index)),
    orders: [],
    execution: {
      schemaVersion: 1,
      engineVersion: 'maoq-a-share-next-open-v1',
      policy: DEFAULT_A_SHARE_EXECUTION_POLICY,
      sessionDates: equityCurve.map(item => item.tradingDate),
      inputSessionHashes: [],
      fills: [{
        orderId: `${tacticId}:buy:1`,
        symbol: 'TARGET',
        side: 'buy',
        signalDate: dateAt(0),
        fillDate: dateAt(1),
        quantity: 10_000,
        price: 10,
        notional: 100_000,
        commission: 5,
        stampDuty: 0,
        transferFee: 1,
        totalFees: 6,
        cashAfter: 899_994,
      }],
      rejections: [],
      finalCash: 899_994,
      positions: [],
      finalEquity: equityCurve.at(-1)!.equity,
    },
    equityCurve,
    doubledCostEquityCurve: equityCurve,
    folds: foldReturns.map((totalReturn, index) => ({
      startDate: dateAt(index * 16),
      endDate: dateAt((index + 1) * 16),
      observations: 17,
      totalReturn,
      annualizedSharpe: totalReturn * 10,
      maximumDrawdown: totalReturn < 0 ? -totalReturn : 0,
    })),
    metrics,
    doubledCostMetrics: { ...metrics, totalReturn: 0.05 },
    promotionDecision: 'research',
    promotionBlockers: [],
  }
}

describe('P3 registered-tactic promotion statistics', () => {
  it('computes DSR, PBO, state concentration, and point-in-time capacity together', () => {
    const audit = auditResearchTacticSuite(TACTICS.map(evaluation), 3)
    expect(audit.tacticIds).toEqual([...TACTICS].sort())
    expect(audit.backtestOverfitting).toMatchObject({ tactics: 3, folds: 4, symmetricSplits: 3 })
    expect(audit.backtestOverfitting.probability).toBeTypeOf('number')
    for (const tacticId of TACTICS) {
      const item = audit.tactics[tacticId]!
      expect(item.deflatedSharpe).toMatchObject({ observations: 64, attemptedTrials: 3 })
      expect(item.deflatedSharpe.probability).toBeTypeOf('number')
      expect(item.marketStateProfitConcentration.largestShare).toBeLessThanOrEqual(0.5)
      expect(item.capacity).toMatchObject({
        buyFills: 1,
        missingAmountFills: 0,
        maximumParticipation: 0.001,
        passed: true,
      })
      expect(item.blockers).toContain('sealed_holdout_not_supplied')
    }
    expect(Object.isFrozen(audit)).toBe(true)
  })

  it('fails closed when folds, observations, fills, or attempted-trial accounting are insufficient', () => {
    const short = evaluation(TACTICS[0], 0)
    const incomplete = {
      ...short,
      signals: short.signals.slice(0, 2),
      equityCurve: short.equityCurve.slice(0, 3),
      folds: short.folds.slice(0, 1),
      execution: { ...short.execution, fills: [] },
    }
    const audit = auditResearchTacticSuite([
      incomplete,
      { ...incomplete, config: { ...incomplete.config, tacticId: TACTICS[1] } },
    ], 2)
    expect(audit.backtestOverfitting).toMatchObject({ probability: null, passed: false })
    expect(audit.tactics[TACTICS[0]]!.deflatedSharpe).toMatchObject({ probability: null, passed: false })
    expect(audit.tactics[TACTICS[0]]!.capacity.passed).toBe(false)
    expect(() => auditResearchTacticSuite([short, evaluation(TACTICS[1], 1)], 1)).toThrow(/attemptedTrials/)
    expect(() => auditResearchTacticSuite([short, short], 2)).toThrow(/duplicate tactic/)
  })
})
