import { describe, expect, it } from 'vitest'
import { ACTIVE_TACTIC_IDS } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  evaluateDynamicBenchmarks,
  type DailyBenchmarkReturn,
  type DynamicReplayReturnSeries,
  type DynamicReplayReturnSeriesSet,
} from '../src/index.ts'

function observation(index: number, dailyReturn: number): DailyBenchmarkReturn {
  const tradingDate = `2026-01-0${String(index + 1)}`
  return {
    benchmarkId: '000001.SH',
    name: 'SSE Composite',
    kind: 'market_index',
    tradingDate,
    dailyReturn,
    provenance: {
      source: {
        adapter: 'benchmark-fixture',
        dataset: 'index',
        version: 'v1',
        retrievedAt: `${tradingDate}T19:00:00+08:00`,
        recordId: `${tradingDate}:000001.SH`,
      },
      transforms: [],
    },
  }
}

function track(returns: readonly number[], active: readonly boolean[] = returns.map(() => true)): DynamicReplayReturnSeries {
  return { returns, active }
}

function tracks(series: DynamicReplayReturnSeries): DynamicReplayReturnSeriesSet {
  return {
    fixed: Object.fromEntries(ACTIVE_TACTIC_IDS.map(tacticId => [tacticId, series])) as DynamicReplayReturnSeriesSet['fixed'],
    equalAllocation: series,
    defensiveNoTrade: track(series.returns.map(() => 0), series.returns.map(() => false)),
    deterministicRoute: series,
    commanderProposed: series,
    commanderFinal: series,
  }
}

function dates(observations: number): string[] {
  return Array.from({ length: observations + 1 }, (_value, index) => `2026-01-0${String(index + 1)}`)
}

describe('dynamic benchmark attribution', () => {
  it('reports excess, capture, cash effects, and market-regime attribution', () => {
    const result = evaluateDynamicBenchmarks({
      '000001.SH': [0, 0.01, -0.01, 0.02, -0.02].map((value, index) => observation(index, value)),
    }, tracks(track([0.02, -0.005, 0, 0], [true, true, false, false])), [
      'risk_on_trend',
      'risk_on_trend',
      'risk_contraction',
      'risk_contraction',
    ], dates(4))['000001.SH']!

    expect(result.performance).toMatchObject({ observations: 4, totalReturn: -0.00049996 })
    expect(result).toMatchObject({ startDate: '2026-01-02', endDate: '2026-01-05' })
    expect(result.comparisons.deterministicRoute).toMatchObject({
      upsideCapture: 0.66225166,
      downsideCapture: 0.16778523,
      cashOpportunityCost: 0,
      cashAvoidedLoss: 0.0004,
    })
    expect(result.comparisons.deterministicRoute.byMarketRegime).toEqual({
      risk_contraction: {
        observations: 2,
        activeSessions: 0,
        strategyTotalReturn: 0,
        benchmarkTotalReturn: -0.0004,
        excessTotalReturn: 0.00040016,
      },
      risk_on_trend: {
        observations: 2,
        activeSessions: 2,
        strategyTotalReturn: 0.0149,
        benchmarkTotalReturn: -0.0001,
        excessTotalReturn: 0.0150015,
      },
    })
  })

  it('uses null capture for absent directions and handles zero-variance comparisons', () => {
    const result = evaluateDynamicBenchmarks({
      flat: [0, 0, 0].map((value, index) => ({ ...observation(index, value), benchmarkId: 'flat' })),
    }, tracks(track([0, 0])), ['unavailable', 'unavailable'], dates(2)).flat!
    expect(result.comparisons.deterministicRoute).toMatchObject({
      informationRatio: 0,
      beta: 0,
      upsideCapture: null,
      downsideCapture: null,
    })
  })

  it('handles one comparable observation and sorts multiple benchmark identities', () => {
    const result = evaluateDynamicBenchmarks({
      zeta: [0, 0.01].map((value, index) => ({ ...observation(index, value), benchmarkId: 'zeta' })),
      alpha: [0, -0.01].map((value, index) => ({ ...observation(index, value), benchmarkId: 'alpha' })),
    }, tracks(track([0])), ['rotation'], dates(1))
    expect(Object.keys(result)).toEqual(['alpha', 'zeta'])
    expect(result.zeta?.performance.annualizedSharpe).toBe(0)
    expect(result.zeta?.comparisons.deterministicRoute.beta).toBe(0)
  })

  it('rejects missing or misaligned benchmarks, tracks, and regimes', () => {
    const series = track([0.01, -0.01])
    expect(() => evaluateDynamicBenchmarks({}, tracks(series), ['risk_on_trend', 'risk_contraction'], dates(2)))
      .toThrow(/at least one benchmark/)
    expect(() => evaluateDynamicBenchmarks({
      '000001.SH': [0, 0.01].map((value, index) => observation(index, value)),
    }, tracks(series), ['risk_on_trend', 'risk_contraction'], dates(2))).toThrow(/not aligned to the replay/)
    expect(() => evaluateDynamicBenchmarks({
      '000001.SH': [0, 0.01, -0.01].map((value, index) => ({
        ...observation(index, value),
        benchmarkId: index === 1 ? 'wrong' : '000001.SH',
      })),
    }, tracks(series), ['risk_on_trend', 'risk_contraction'], dates(2))).toThrow(/not aligned to the replay/)
    expect(() => evaluateDynamicBenchmarks({
      '000001.SH': [0, 0.01, -0.01].map((value, index) => observation(index, value)),
    }, { ...tracks(series), commanderFinal: track([0.01]) }, ['risk_on_trend', 'risk_contraction'], dates(2)))
      .toThrow(/aligned replay tracks/)
    expect(() => evaluateDynamicBenchmarks({
      '000001.SH': [0, 0.01, -0.01].map((value, index) => observation(index, value)),
    }, tracks(series), ['risk_on_trend'], dates(2))).toThrow(/aligned replay regimes/)
    expect(() => evaluateDynamicBenchmarks({
      '000001.SH': [0, 0.01, -0.01].map((value, index) => observation(index, value)),
    }, tracks(series), ['risk_on_trend', 'risk_contraction'], dates(1))).toThrow(/aligned replay regimes and dates/)
  })
})
