import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import type { ResearchTacticEvaluation, ResearchEquityPoint } from './evaluation.ts'
import type { ResearchTacticId, ResearchTacticSignal } from './signals.ts'

/** Versioned statistical audit used by the P3 registered-tactic suite. */
export const TACTIC_PROMOTION_AUDIT_VERSION = 'maoq-tactic-promotion-audit-v1' as const

export interface DeflatedSharpeEvidence {
  readonly observations: number
  readonly attemptedTrials: number
  readonly observedAnnualizedSharpe: number
  readonly expectedMaximumAnnualizedSharpe: number
  readonly skewness: number
  readonly kurtosis: number
  readonly probability: number | null
  readonly passed: boolean
}

export interface BacktestOverfittingEvidence {
  readonly tactics: number
  readonly folds: number
  readonly symmetricSplits: number
  readonly probability: number | null
  readonly passed: boolean
}

export type ResearchMarketState = 'emotion-attack' | 'trend-attack' | 'breadth-repair' | 'defensive'

export interface MarketStateProfitConcentration {
  readonly positiveProfit: number
  readonly profitByState: Readonly<Record<ResearchMarketState, number>>
  readonly largestState: ResearchMarketState | null
  readonly largestShare: number | null
  readonly passed: boolean
}

export interface CapacityEvidence {
  readonly buyFills: number
  readonly missingAmountFills: number
  readonly maximumParticipation: number | null
  readonly p95Participation: number | null
  readonly limit: number
  readonly passed: boolean
}

export interface TacticPromotionStatistics {
  readonly deflatedSharpe: DeflatedSharpeEvidence
  readonly marketStateProfitConcentration: MarketStateProfitConcentration
  readonly capacity: CapacityEvidence
  readonly blockers: readonly string[]
}

export interface ResearchTacticSuiteAudit {
  readonly version: typeof TACTIC_PROMOTION_AUDIT_VERSION
  readonly attemptedTrials: number
  readonly tacticIds: readonly ResearchTacticId[]
  readonly backtestOverfitting: BacktestOverfittingEvidence
  readonly tactics: Readonly<Partial<Record<ResearchTacticId, TacticPromotionStatistics>>>
}

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

function moments(values: readonly number[]): { skewness: number; kurtosis: number } {
  if (values.length < 3) return { skewness: 0, kurtosis: 3 }
  const average = mean(values)
  const second = mean(values.map(value => (value - average) ** 2))
  if (second <= 0) return { skewness: 0, kurtosis: 3 }
  const scale = Math.sqrt(second)
  return {
    skewness: mean(values.map(value => ((value - average) / scale) ** 3)),
    kurtosis: mean(values.map(value => ((value - average) / scale) ** 4)),
  }
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

// Peter J. Acklam's inverse-normal approximation, sufficient for deterministic audit statistics.
function inverseNormal(probability: number): number {
  if (!(probability > 0 && probability < 1)) throw new RangeError('normal probability must be between zero and one')
  const [a0, a1, a2, a3, a4, a5] = [-39.69683028665376, 220.9460984245205,
    -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const [b0, b1, b2, b3, b4] = [-54.47609879822406, 161.5858368580409,
    -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const [c0, c1, c2, c3, c4, c5] = [-0.007784894002430293, -0.3223964580411365,
    -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const [d0, d1, d2, d3] = [0.007784695709041462, 0.3224671290700398,
    2.445134137142996, 3.754408661907416]
  const low = 0.02425
  const high = 1 - low
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability))
    return (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5)
      / ((((d0 * q + d1) * q + d2) * q + d3) * q + 1)
  }
  if (probability <= high) {
    const q = probability - 0.5
    const r = q * q
    return (((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * q
      / (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1)
  }
  const q = Math.sqrt(-2 * Math.log(1 - probability))
  return -(((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5)
    / ((((d0 * q + d1) * q + d2) * q + d3) * q + 1)
}

function expectedMaximumSharpe(sharpes: readonly number[], attemptedTrials: number): number {
  const dispersion = standardDeviation(sharpes)
  if (attemptedTrials <= 1 || dispersion <= 0) return 0
  const gamma = 0.5772156649015329
  return dispersion * ((1 - gamma) * inverseNormal(1 - 1 / attemptedTrials)
    + gamma * inverseNormal(1 - 1 / (attemptedTrials * Math.E)))
}

function deflatedSharpe(
  evaluation: ResearchTacticEvaluation,
  expectedMaximumAnnualizedSharpe: number,
  attemptedTrials: number,
): DeflatedSharpeEvidence {
  const returns = evaluation.equityCurve.slice(1).map(point => point.dailyReturn)
  const observedAnnualizedSharpe = evaluation.metrics.annualizedSharpe
  const distribution = moments(returns)
  let probability: number | null = null
  if (returns.length >= 30) {
    const observed = observedAnnualizedSharpe / Math.sqrt(252)
    const benchmark = expectedMaximumAnnualizedSharpe / Math.sqrt(252)
    const denominator = Math.sqrt(Math.max(Number.EPSILON,
      1 - distribution.skewness * observed + (distribution.kurtosis - 1) * observed ** 2 / 4))
    probability = rounded(normalCdf((observed - benchmark) * Math.sqrt(returns.length - 1) / denominator))
  }
  return {
    observations: returns.length,
    attemptedTrials,
    observedAnnualizedSharpe,
    expectedMaximumAnnualizedSharpe: rounded(expectedMaximumAnnualizedSharpe),
    skewness: rounded(distribution.skewness),
    kurtosis: rounded(distribution.kurtosis),
    probability,
    passed: probability !== null && probability >= 0.95,
  }
}

function combinations(length: number, selected: number): number[][] {
  const result: number[][] = []
  const visit = (start: number, values: number[]): void => {
    if (values.length === selected) {
      if (values.includes(0)) result.push(values)
      return
    }
    for (let index = start; index <= length - (selected - values.length); index += 1) {
      visit(index + 1, [...values, index])
    }
  }
  visit(0, [])
  return result
}

function probabilityOfBacktestOverfitting(
  evaluations: readonly ResearchTacticEvaluation[],
): BacktestOverfittingEvidence {
  const completeFolds = evaluations.map(evaluation => evaluation.folds.filter(
    fold => fold.observations === evaluation.config.foldSessions + 1,
  ))
  const usableFolds = Math.min(...completeFolds.map(folds => folds.length))
  const folds = usableFolds % 2 === 0 ? usableFolds : usableFolds - 1
  if (evaluations.length < 2 || folds < 4) {
    return { tactics: evaluations.length, folds, symmetricSplits: 0, probability: null, passed: false }
  }
  const splits = combinations(folds, folds / 2)
  const foldReturn = (evaluation: number, fold: number): number => {
    const item = completeFolds[evaluation]?.[fold]
    if (item === undefined) throw new Error(`missing fold ${String(fold)}`)
    return item.totalReturn
  }
  let overfit = 0
  for (const training of splits) {
    const trainingSet = new Set(training)
    const testing = Array.from({ length: folds }, (_, index) => index).filter(index => !trainingSet.has(index))
    const inSample = evaluations.map((evaluation, index) => ({
      index,
      score: mean(training.map(fold => foldReturn(index, fold))),
      tacticId: evaluation.config.tacticId,
    })).sort((left, right) => right.score - left.score || left.tacticId.localeCompare(right.tacticId))
    const winner = inSample[0]
    if (winner === undefined) throw new Error('PBO in-sample ranking is empty')
    const selected = winner.index
    const outOfSample = evaluations.map((evaluation, index) => ({
      index,
      score: mean(testing.map(fold => foldReturn(index, fold))),
      tacticId: evaluation.config.tacticId,
    })).sort((left, right) => left.score - right.score || left.tacticId.localeCompare(right.tacticId))
    const rank = outOfSample.findIndex(item => item.index === selected) + 1
    const percentile = rank / (evaluations.length + 1)
    if (Math.log(percentile / (1 - percentile)) <= 0) overfit += 1
  }
  const probability = rounded(overfit / splits.length)
  return {
    tactics: evaluations.length,
    folds,
    symmetricSplits: splits.length,
    probability,
    passed: probability < 0.2,
  }
}

function stateOf(signal: ResearchTacticSignal): ResearchMarketState {
  if (signal.currentLimitUpRatio >= 0.002 && signal.currentLimitUpRatio <= 0.025 && signal.marketBreadth1 >= 0.45) {
    return 'emotion-attack'
  }
  if (signal.marketBreadth20 >= 0.55 && signal.marketBreadth1 >= 0.48) return 'trend-attack'
  if (signal.marketBreadth1 >= 0.5 && signal.marketBreadth20 < 0.55) return 'breadth-repair'
  return 'defensive'
}

function marketStateProfitConcentration(evaluation: ResearchTacticEvaluation): MarketStateProfitConcentration {
  const signalByDate = new Map(evaluation.signals.map(signal => [signal.tradingDate, signal]))
  const profitByState: Record<ResearchMarketState, number> = {
    'emotion-attack': 0,
    'trend-attack': 0,
    'breadth-repair': 0,
    defensive: 0,
  }
  for (let index = 1; index < evaluation.equityCurve.length; index += 1) {
    const previous = evaluation.equityCurve[index - 1] as ResearchEquityPoint
    const current = evaluation.equityCurve[index] as ResearchEquityPoint
    const profit = current.equity - previous.equity
    const signal = signalByDate.get(previous.tradingDate)
    if (profit > 0 && signal !== undefined) profitByState[stateOf(signal)] += profit
  }
  const positiveProfit = Object.values(profitByState).reduce((sum, value) => sum + value, 0)
  const ordered = (Object.entries(profitByState) as [ResearchMarketState, number][])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  const largest = ordered[0]
  const largestState = positiveProfit > 0 && largest !== undefined ? largest[0] : null
  const largestShare = positiveProfit > 0 && largest !== undefined ? rounded(largest[1] / positiveProfit) : null
  const roundedProfitByState = Object.fromEntries(
    Object.entries(profitByState).map(([key, value]) => [key, rounded(value)]),
  ) as Record<ResearchMarketState, number>
  return {
    positiveProfit: rounded(positiveProfit),
    profitByState: roundedProfitByState,
    largestState,
    largestShare,
    passed: largestShare !== null && largestShare <= 0.5,
  }
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] as number
}

function capacityEvidence(evaluation: ResearchTacticEvaluation): CapacityEvidence {
  const amountByCandidate = new Map(evaluation.signals.flatMap(signal => signal.candidates.map(item => [
    `${signal.tradingDate}:${item.symbol}`,
    item.amountMean20,
  ] as const)))
  const ratios: number[] = []
  let missing = 0
  const buys = evaluation.execution.fills.filter(fill => fill.side === 'buy')
  for (const fill of buys) {
    const amount = amountByCandidate.get(`${fill.signalDate}:${fill.symbol}`)
    if (amount === undefined || amount <= 0) missing += 1
    else ratios.push(fill.notional / amount)
  }
  const limit = 0.01
  const maximum = ratios.length > 0 ? Math.max(...ratios) : null
  return {
    buyFills: buys.length,
    missingAmountFills: missing,
    maximumParticipation: maximum === null ? null : rounded(maximum),
    p95Participation: ratios.length === 0 ? null : rounded(percentile95(ratios)),
    limit,
    passed: buys.length > 0 && missing === 0 && maximum !== null && maximum <= limit,
  }
}

/**
 * Audit all pre-registered tactics together so multiple-testing evidence is not fabricated from one curve.
 * The caller must include every attempted fixed trial, including rejected trials.
 */
export function auditResearchTacticSuite(
  input: readonly ResearchTacticEvaluation[],
  attemptedTrials: number = input.length,
): ResearchTacticSuiteAudit {
  if (!Number.isSafeInteger(attemptedTrials) || attemptedTrials < input.length || attemptedTrials < 2) {
    throw new TypeError('attemptedTrials must include every supplied tactic and be at least two')
  }
  const evaluations = [...input].sort((left, right) => left.config.tacticId.localeCompare(right.config.tacticId))
  if (new Set(evaluations.map(item => item.config.tacticId)).size !== evaluations.length) {
    throw new Error('tactic suite contains duplicate tactic ids')
  }
  const expectedMaximum = expectedMaximumSharpe(
    evaluations.map(item => item.metrics.annualizedSharpe),
    attemptedTrials,
  )
  const pbo = probabilityOfBacktestOverfitting(evaluations)
  const tactics = Object.fromEntries(evaluations.map((evaluation) => {
    const dsr = deflatedSharpe(evaluation, expectedMaximum, attemptedTrials)
    const concentration = marketStateProfitConcentration(evaluation)
    const capacity = capacityEvidence(evaluation)
    return [evaluation.config.tacticId, {
      deflatedSharpe: dsr,
      marketStateProfitConcentration: concentration,
      capacity,
      blockers: [
        ...dsr.passed ? [] : ['deflated_sharpe_probability_below_95_percent'],
        ...pbo.passed ? [] : ['backtest_overfitting_probability_not_below_20_percent'],
        ...concentration.passed ? [] : ['single_market_state_profit_above_50_percent'],
        ...capacity.passed ? [] : ['capacity_above_one_percent_or_missing'],
        'sealed_holdout_not_supplied',
      ],
    }]
  })) as Partial<Record<ResearchTacticId, TacticPromotionStatistics>>
  return deepFreeze({
    version: TACTIC_PROMOTION_AUDIT_VERSION,
    attemptedTrials,
    tacticIds: evaluations.map(item => item.config.tacticId),
    backtestOverfitting: pbo,
    tactics,
  })
}
