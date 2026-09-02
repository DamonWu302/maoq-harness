import type { MarketRegime } from '@deepseek-ai/dsh-market-strategic-state'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import type { DailyBenchmarkReturn } from './types.ts'
import type { ResearchTacticId } from './signals.ts'

/** Daily net returns and participation flags for one replay track. */
export interface DynamicReplayReturnSeries {
  readonly returns: readonly number[]
  readonly active: readonly boolean[]
}

/** Replay tracks compared against every aligned benchmark. */
export interface DynamicReplayReturnSeriesSet {
  readonly fixed: Readonly<Record<ResearchTacticId, DynamicReplayReturnSeries>>
  readonly equalAllocation: DynamicReplayReturnSeries
  readonly defensiveNoTrade: DynamicReplayReturnSeries
  readonly deterministicRoute: DynamicReplayReturnSeries
  readonly commanderProposed: DynamicReplayReturnSeries
  readonly commanderFinal: DynamicReplayReturnSeries
}

/** Standalone benchmark performance over the exact comparable sessions. */
export interface DynamicBenchmarkPerformance {
  readonly observations: number
  readonly finalEquity: number
  readonly totalReturn: number
  readonly annualizedReturn: number
  readonly annualizedSharpe: number
  readonly maximumDrawdown: number
}

/** One strategy's geometric and risk-relative result against a benchmark. */
export interface DynamicBenchmarkComparison {
  readonly excessTotalReturn: number
  readonly annualizedExcessReturn: number
  readonly informationRatio: number
  readonly beta: number
  readonly upsideCapture: number | null
  readonly downsideCapture: number | null
  readonly cashOpportunityCost: number
  readonly cashAvoidedLoss: number
  readonly byMarketRegime: Readonly<Record<string, {
    readonly observations: number
    readonly activeSessions: number
    readonly strategyTotalReturn: number
    readonly benchmarkTotalReturn: number
    readonly excessTotalReturn: number
  }>>
}

/** All replay-track comparisons against one named market benchmark. */
export interface DynamicBenchmarkEvaluation {
  readonly benchmarkId: string
  readonly name: string
  readonly kind: DailyBenchmarkReturn['kind']
  readonly startDate: string
  readonly endDate: string
  readonly performance: DynamicBenchmarkPerformance
  readonly comparisons: {
    readonly fixed: Readonly<Record<ResearchTacticId, DynamicBenchmarkComparison>>
    readonly equalAllocation: DynamicBenchmarkComparison
    readonly defensiveNoTrade: DynamicBenchmarkComparison
    readonly deterministicRoute: DynamicBenchmarkComparison
    readonly commanderProposed: DynamicBenchmarkComparison
    readonly commanderFinal: DynamicBenchmarkComparison
  }
}

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function compound(returns: readonly number[]): number {
  return returns.reduce((equity, value) => equity * (1 + value), 1)
}

function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) return 0
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}

function performance(returns: readonly number[]): DynamicBenchmarkPerformance {
  let equity = 1
  let peak = 1
  let drawdown = 0
  for (const value of returns) {
    equity *= 1 + value
    peak = Math.max(peak, equity)
    drawdown = Math.max(drawdown, 1 - equity / peak)
  }
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = sampleVariance(returns)
  return {
    observations: returns.length,
    finalEquity: rounded(equity),
    totalReturn: rounded(equity - 1),
    annualizedReturn: rounded(equity ** (252 / returns.length) - 1),
    annualizedSharpe: variance === 0 ? 0 : rounded(average / Math.sqrt(variance) * Math.sqrt(252)),
    maximumDrawdown: rounded(drawdown),
  }
}

function capture(strategy: readonly number[], benchmark: readonly number[], direction: 'up' | 'down'): number | null {
  const selected = benchmark.map((value, index) => ({ value, index }))
    .filter(item => direction === 'up' ? item.value > 0 : item.value < 0)
  if (selected.length === 0) return null
  const benchmarkReturn = compound(selected.map(item => item.value)) - 1
  const strategyReturn = compound(selected.map(item => strategy[item.index] as number)) - 1
  return rounded(strategyReturn / benchmarkReturn)
}

function comparison(
  series: DynamicReplayReturnSeries,
  benchmark: readonly number[],
  regimes: readonly (MarketRegime | 'unavailable')[],
): DynamicBenchmarkComparison {
  const strategyEquity = compound(series.returns)
  const benchmarkEquity = compound(benchmark)
  const excess = series.returns.map((value, index) => value - (benchmark[index] as number))
  const excessVariance = sampleVariance(excess)
  const excessMean = excess.reduce((sum, value) => sum + value, 0) / excess.length
  const strategyMean = series.returns.reduce((sum, value) => sum + value, 0) / series.returns.length
  const benchmarkMean = benchmark.reduce((sum, value) => sum + value, 0) / benchmark.length
  const benchmarkVariance = sampleVariance(benchmark)
  const covariance = benchmark.length < 2 ? 0 : benchmark.reduce((sum, value, index) => (
    sum + (value - benchmarkMean) * ((series.returns[index] as number)
      - strategyMean)
  ), 0) / (benchmark.length - 1)
  const cashBenchmarkReturn = compound(benchmark.filter((_value, index) => series.active[index] === false)) - 1
  const labels = [...new Set(regimes)].sort()
  const byMarketRegime = Object.fromEntries(labels.map((label) => {
    const indices = regimes.map((value, index) => value === label ? index : -1).filter(index => index >= 0)
    const strategyReturn = compound(indices.map(index => series.returns[index] as number)) - 1
    const benchmarkReturn = compound(indices.map(index => benchmark[index] as number)) - 1
    return [label, {
      observations: indices.length,
      activeSessions: indices.filter(index => series.active[index] === true).length,
      strategyTotalReturn: rounded(strategyReturn),
      benchmarkTotalReturn: rounded(benchmarkReturn),
      excessTotalReturn: rounded((1 + strategyReturn) / (1 + benchmarkReturn) - 1),
    }]
  }))
  return {
    excessTotalReturn: rounded(strategyEquity / benchmarkEquity - 1),
    annualizedExcessReturn: rounded((strategyEquity / benchmarkEquity) ** (252 / benchmark.length) - 1),
    informationRatio: excessVariance === 0 ? 0 : rounded(excessMean / Math.sqrt(excessVariance) * Math.sqrt(252)),
    beta: benchmarkVariance === 0 ? 0 : rounded(covariance / benchmarkVariance),
    upsideCapture: capture(series.returns, benchmark, 'up'),
    downsideCapture: capture(series.returns, benchmark, 'down'),
    cashOpportunityCost: rounded(Math.max(0, cashBenchmarkReturn)),
    cashAvoidedLoss: rounded(Math.max(0, -cashBenchmarkReturn)),
    byMarketRegime,
  }
}

/**
 * Compare every replay track with complete, date-aligned market benchmarks.
 * @param benchmarkSeries - Benchmark observations including the initial alignment session.
 * @param tracks - Net strategy returns and active-session flags for later sessions.
 * @param regimes - Decision-date market regimes aligned to the strategy returns.
 * @param tradingDates - Exact replay session dates including the initial alignment session.
 * @returns Immutable benchmark performance and relative attribution keyed by benchmark ID.
 */
export function evaluateDynamicBenchmarks(
  benchmarkSeries: Readonly<Record<string, readonly DailyBenchmarkReturn[]>>,
  tracks: DynamicReplayReturnSeriesSet,
  regimes: readonly (MarketRegime | 'unavailable')[],
  tradingDates: readonly string[],
): Readonly<Record<string, DynamicBenchmarkEvaluation>> {
  const observations = tracks.deterministicRoute.returns.length
  if (observations < 1 || regimes.length !== observations || tradingDates.length !== observations + 1) {
    throw new Error('benchmark attribution requires aligned replay regimes and dates')
  }
  const allTracks = [
    ...Object.values(tracks.fixed),
    tracks.equalAllocation,
    tracks.defensiveNoTrade,
    tracks.deterministicRoute,
    tracks.commanderProposed,
    tracks.commanderFinal,
  ]
  if (allTracks.some(series => series.returns.length !== observations || series.active.length !== observations)) {
    throw new Error('benchmark attribution requires aligned replay tracks')
  }
  const evaluations = Object.entries(benchmarkSeries).sort(([left], [right]) => left.localeCompare(right)).map(([benchmarkId, series]) => {
    const first = series[0]
    if (first === undefined || series.length !== observations + 1 || series.some((item, index) => (
      item.benchmarkId !== benchmarkId
      || item.name !== first.name
      || item.kind !== first.kind
      || item.tradingDate !== tradingDates[index]
    ))) {
      throw new Error(`benchmark ${benchmarkId} is not aligned to the replay`)
    }
    const last = series.at(-1) as DailyBenchmarkReturn
    const returns = series.slice(1).map(item => item.dailyReturn)
    return [benchmarkId, {
      benchmarkId,
      name: first.name,
      kind: first.kind,
      startDate: (series[1] as DailyBenchmarkReturn).tradingDate,
      endDate: last.tradingDate,
      performance: performance(returns),
      comparisons: {
        fixed: Object.fromEntries(Object.entries(tracks.fixed).map(([tacticId, track]) => [
          tacticId,
          comparison(track, returns, regimes),
        ])) as Readonly<Record<ResearchTacticId, DynamicBenchmarkComparison>>,
        equalAllocation: comparison(tracks.equalAllocation, returns, regimes),
        defensiveNoTrade: comparison(tracks.defensiveNoTrade, returns, regimes),
        deterministicRoute: comparison(tracks.deterministicRoute, returns, regimes),
        commanderProposed: comparison(tracks.commanderProposed, returns, regimes),
        commanderFinal: comparison(tracks.commanderFinal, returns, regimes),
      },
    } satisfies DynamicBenchmarkEvaluation] as const
  })
  if (evaluations.length === 0) throw new Error('benchmark attribution requires at least one benchmark')
  return deepFreeze(Object.fromEntries(evaluations))
}
