import { describe, expect, it } from 'vitest'
import {
  DEFAULT_A_SHARE_EXECUTION_POLICY,
  evaluateResearchTactic,
  TACTIC_EVALUATION_ENGINE_VERSION,
  type DailyExecutionBar,
  type DailyExecutionSession,
  type DailyHistoryFeatureRecord,
  type DailyStockResearchFeatures,
  type ResearchTacticBacktestConfig,
} from '../src/index.ts'

function dateAt(index: number): string {
  return new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
}

function stock(symbol: string, date: string, overrides: Partial<DailyStockResearchFeatures> = {}): DailyStockResearchFeatures {
  const hash = (Number(date.slice(-2)) + 1).toString(16).padStart(64, '0')
  return {
    symbol,
    tradingDate: date,
    historySessions: 252,
    sectorId: 'sector-a',
    adjustedReturn1: 0.01,
    adjustedReturn5: 0.05,
    adjustedReturn20: 0.12,
    adjustedReturn60: 0.2,
    distanceFromHigh20: -0.02,
    distanceFromHigh252: -0.1,
    sectorRelativeReturn5: 0.02,
    sectorRelativeReturn20: 0.05,
    turnoverMean5: 0.03,
    turnoverMean20: 0.025,
    turnover5To20Ratio: 1.2,
    amountMean20: 200_000_000,
    consecutiveLimitUpSessions: 0,
    limitUpSessions20: 0,
    tradingStatus: 'trading',
    limitStatus: 'none',
    listingDays: 1_000,
    evidenceRefs: [`snapshot:${hash}#stocks/${symbol}`],
    ...overrides,
  }
}

function feature(index: number, targets: readonly string[] = ['TARGET']): DailyHistoryFeatureRecord {
  const date = dateAt(index)
  const hash = (index + 1).toString(16).padStart(64, '0')
  const backgrounds = Array.from({ length: 9 }, (_, item) => stock(`B${String(item).padStart(2, '0')}`, date, {
    adjustedReturn1: item < 4 ? 0.01 : -0.01,
    adjustedReturn20: item < 5 ? 0.02 : -0.02,
    amountMean20: 1,
  }))
  return {
    schemaVersion: 1,
    engineVersion: 'maoq-daily-history-v1',
    currentSnapshotHash: hash,
    inputSnapshotHashes: [hash],
    tradingDate: date,
    sessions: 252 + index,
    stocks: [...targets.map(symbol => stock(symbol, date)), ...backgrounds],
  }
}

function bar(index: number, symbol: string, overrides: Partial<DailyExecutionBar> = {}): DailyExecutionBar {
  const tradingDate = dateAt(index)
  const close = overrides.close ?? 10 + index * 0.2
  const open = overrides.open ?? close
  return {
    symbol,
    tradingDate,
    open,
    high: overrides.high ?? Math.max(open, close) * 1.02,
    low: overrides.low ?? Math.min(open, close) * 0.98,
    close,
    upLimit: 100,
    downLimit: 1,
    tradingStatus: 'trading',
    ...overrides,
  }
}

function session(index: number, targets: readonly string[] = ['TARGET'], overrides: Partial<DailyExecutionBar> = {}): DailyExecutionSession {
  return {
    tradingDate: dateAt(index),
    contentHash: (index + 100).toString(16).padStart(64, '0'),
    bars: targets.map(symbol => bar(index, symbol, overrides)),
  }
}

function config(overrides: Partial<ResearchTacticBacktestConfig> = {}): ResearchTacticBacktestConfig {
  return {
    tacticId: 'regime_signed_breakout_pullback',
    maximumPositions: 1,
    targetPositionFraction: 0.2,
    holdingSessions: 2,
    foldSessions: 3,
    ...overrides,
  }
}

describe('P3 tactic walk-forward evaluation', () => {
  it('builds next-open round trips, chronological folds, and doubled-cost evidence', () => {
    const features = Array.from({ length: 6 }, (_, index) => feature(index)).reverse()
    const sessions = Array.from({ length: 7 }, (_, index) => session(index)).reverse()
    const result = evaluateResearchTactic(features, sessions, config())
    expect(result.engineVersion).toBe(TACTIC_EVALUATION_ENGINE_VERSION)
    expect(result.orders.map(order => order.side)).toEqual(['buy', 'sell', 'buy', 'sell', 'buy'])
    expect(result.execution.fills).toHaveLength(5)
    expect(result.equityCurve.map(point => point.tradingDate)).toEqual(
      Array.from({ length: 7 }, (_, index) => dateAt(index)),
    )
    expect(result.metrics.totalReturn).toBeGreaterThan(0)
    expect(result.doubledCostMetrics.totalReturn).toBeLessThan(result.metrics.totalReturn)
    expect(result.folds).toHaveLength(2)
    expect(result.promotionDecision).toBe('research')
    expect(result.promotionBlockers).toEqual(expect.arrayContaining([
      'deflated_sharpe_not_computed',
      'backtest_overfitting_probability_not_computed',
      'market_regime_profit_concentration_not_computed',
    ]))
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('keeps execution failures and empty portfolios visible', () => {
    const features = Array.from({ length: 4 }, (_, index) => feature(index))
    const sessions = Array.from({ length: 5 }, (_, index) => session(index, ['TARGET'], {
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      upLimit: 10,
    }))
    const result = evaluateResearchTactic(features, sessions, config({ holdingSessions: 1 }))
    expect(result.execution.fills).toEqual([])
    expect(result.execution.rejections.map(item => item.reason)).toContain('open_limit_up')
    expect(result.metrics).toMatchObject({ totalReturn: 0, annualizedSharpe: 0, turnover: 0, fillRate: 0 })
    expect(result.promotionBlockers).toEqual(expect.arrayContaining([
      'net_out_of_sample_sharpe_below_1',
      'doubled_cost_expectation_not_positive',
      'positive_fold_ratio_below_70_percent',
    ]))
  })

  it('does not fabricate orders without a usable close or board lot', () => {
    const missing = evaluateResearchTactic([feature(0)], [session(0, []), session(1, [])], config())
    expect(missing.orders).toEqual([])
    expect(missing.metrics.observations).toBe(2)

    const expensive = [session(0, ['TARGET'], { close: 9_000_000, open: 9_000_000, high: 9_000_000, low: 9_000_000, upLimit: 10_000_000 }),
      session(1, ['TARGET'], { close: 9_000_000, open: 9_000_000, high: 9_000_000, low: 9_000_000, upLimit: 10_000_000 })]
    expect(evaluateResearchTactic([feature(0)], expensive, config()).orders).toEqual([])
  })

  it('does not overlap repeated signals for an already planned symbol', () => {
    const result = evaluateResearchTactic(
      Array.from({ length: 3 }, (_, index) => feature(index)),
      Array.from({ length: 4 }, (_, index) => session(index)),
      config({ maximumPositions: 2, targetPositionFraction: 0.4, holdingSessions: 3 }),
    )
    expect(result.orders.filter(order => order.side === 'buy')).toHaveLength(1)
  })

  it('reports material drawdown as a promotion blocker', () => {
    const sessions = [
      session(0, ['TARGET'], { open: 10, close: 10 }),
      session(1, ['TARGET'], { open: 10, close: 10 }),
      session(2, ['TARGET'], { open: 5, high: 5, low: 5, close: 5 }),
      session(3, ['TARGET'], { open: 5, high: 5, low: 5, close: 5 }),
    ]
    const result = evaluateResearchTactic(
      [feature(0), feature(1), feature(2)],
      sessions,
      config({ targetPositionFraction: 0.9, holdingSessions: 2 }),
      { ...DEFAULT_A_SHARE_EXECUTION_POLICY, slippageBps: 0 },
    )
    expect(result.metrics.maximumDrawdown).toBeGreaterThan(0.25)
    expect(result.promotionBlockers).toContain('maximum_drawdown_above_25_percent')
  })

  it('rejects invalid portfolio trials and duplicate feature dates', () => {
    const invalid = [
      config({ maximumPositions: 0 }),
      config({ maximumPositions: 1.5 }),
      config({ targetPositionFraction: 0 }),
      config({ targetPositionFraction: Number.NaN }),
      config({ maximumPositions: 2, targetPositionFraction: 0.6 }),
      config({ holdingSessions: 0 }),
      config({ holdingSessions: 1.5 }),
      config({ foldSessions: 1 }),
      config({ foldSessions: 2.5 }),
    ]
    for (const item of invalid) {
      expect(() => evaluateResearchTactic([feature(0)], [session(0), session(1)], item)).toThrow()
    }
    expect(() => evaluateResearchTactic([], [session(0), session(1)], config())).toThrow(/feature record/)
    expect(() => evaluateResearchTactic([feature(0), feature(0)], [session(0), session(1)], config())).toThrow(/duplicate feature/)
  })
})
