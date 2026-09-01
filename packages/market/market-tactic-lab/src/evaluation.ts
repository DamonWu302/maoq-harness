import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  DEFAULT_A_SHARE_EXECUTION_POLICY,
  simulateNextOpenExecution,
} from './execution.ts'
import {
  generateResearchTacticSignal,
  type ResearchTacticId,
  type ResearchTacticSignal,
} from './signals.ts'
import type {
  DailyExecutionFill,
  DailyExecutionOrder,
  DailyExecutionPolicy,
  DailyExecutionResult,
  DailyExecutionSession,
  DailyHistoryFeatureRecord,
} from './types.ts'

/** Current deterministic tactic-evaluation implementation. */
export const TACTIC_EVALUATION_ENGINE_VERSION = 'maoq-tactic-walk-forward-v1' as const

/** Predeclared portfolio construction for one tactic. */
export interface ResearchTacticBacktestConfig {
  readonly tacticId: ResearchTacticId
  readonly maximumPositions: number
  readonly targetPositionFraction: number
  readonly holdingSessions: number
  readonly foldSessions: number
}

/** Initial fixed configurations; changing one creates a new research trial. */
export const DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS: Readonly<Record<ResearchTacticId, ResearchTacticBacktestConfig>> = deepFreeze({
  regime_signed_breakout_pullback: {
    tacticId: 'regime_signed_breakout_pullback',
    maximumPositions: 5,
    targetPositionFraction: 0.18,
    holdingSessions: 20,
    foldSessions: 126,
  },
  openable_emotion_leader: {
    tacticId: 'openable_emotion_leader',
    maximumPositions: 5,
    targetPositionFraction: 0.15,
    holdingSessions: 3,
    foldSessions: 126,
  },
  industry_relative_exhaustion_repair: {
    tacticId: 'industry_relative_exhaustion_repair',
    maximumPositions: 5,
    targetPositionFraction: 0.18,
    holdingSessions: 5,
    foldSessions: 126,
  },
})

/** One marked portfolio observation after that session's fills and close. */
export interface ResearchEquityPoint {
  readonly tradingDate: string
  readonly equity: number
  readonly dailyReturn: number
  readonly grossExposure: number
}

/** One fixed chronological evaluation fold; parameters are never selected on it. */
export interface ResearchWalkForwardFold {
  readonly startDate: string
  readonly endDate: string
  readonly observations: number
  readonly totalReturn: number
  readonly annualizedSharpe: number
  readonly maximumDrawdown: number
}

/** Reproducible performance statistics for one fixed tactic trial. */
export interface ResearchTacticMetrics {
  readonly observations: number
  readonly totalReturn: number
  readonly annualizedReturn: number
  readonly annualizedSharpe: number
  readonly maximumDrawdown: number
  readonly turnover: number
  readonly fillRate: number
  readonly positiveFoldRatio: number
}

/** Full auditable result. It never promotes while required DSR/PBO evidence is absent. */
export interface ResearchTacticEvaluation {
  readonly engineVersion: typeof TACTIC_EVALUATION_ENGINE_VERSION
  readonly config: ResearchTacticBacktestConfig
  readonly policy: DailyExecutionPolicy
  readonly signals: readonly ResearchTacticSignal[]
  readonly orders: readonly DailyExecutionOrder[]
  readonly execution: DailyExecutionResult
  readonly equityCurve: readonly ResearchEquityPoint[]
  readonly folds: readonly ResearchWalkForwardFold[]
  readonly metrics: ResearchTacticMetrics
  readonly doubledCostMetrics: ResearchTacticMetrics
  readonly promotionDecision: 'research'
  readonly promotionBlockers: readonly string[]
}

interface PlannedPosition {
  readonly symbol: string
  readonly quantity: number
  readonly exitSignalIndex: number
  readonly sequence: number
}

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function validateConfig(config: ResearchTacticBacktestConfig): void {
  if (!Number.isSafeInteger(config.maximumPositions) || config.maximumPositions < 1) {
    throw new Error('maximumPositions must be a positive safe integer')
  }
  if (!Number.isFinite(config.targetPositionFraction) || config.targetPositionFraction <= 0
    || config.targetPositionFraction > 1 / config.maximumPositions) {
    throw new Error('targetPositionFraction must be positive and fit maximumPositions')
  }
  if (!Number.isSafeInteger(config.holdingSessions) || config.holdingSessions < 1) {
    throw new Error('holdingSessions must be a positive safe integer')
  }
  if (!Number.isSafeInteger(config.foldSessions) || config.foldSessions < 2) {
    throw new Error('foldSessions must be an integer of at least two')
  }
}

function sortedInputs(
  features: readonly DailyHistoryFeatureRecord[],
  sessions: readonly DailyExecutionSession[],
): { features: readonly DailyHistoryFeatureRecord[]; sessions: readonly DailyExecutionSession[] } {
  const sortedFeatures = [...features].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
  const sortedSessions = [...sessions].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
  if (sortedFeatures.length === 0) throw new Error('at least one feature record is required')
  for (let index = 1; index < sortedFeatures.length; index += 1) {
    if (sortedFeatures[index - 1]?.tradingDate === sortedFeatures[index]?.tradingDate) {
      throw new Error(`duplicate feature date ${String(sortedFeatures[index]?.tradingDate)}`)
    }
  }
  return { features: sortedFeatures, sessions: sortedSessions }
}

function rawCloseByDate(sessions: readonly DailyExecutionSession[]): ReadonlyMap<string, ReadonlyMap<string, number>> {
  return new Map(sessions.map(session => [
    session.tradingDate,
    new Map(session.bars.map(bar => [bar.symbol, bar.close])),
  ]))
}

function buildOrders(
  signals: readonly ResearchTacticSignal[],
  sessions: readonly DailyExecutionSession[],
  config: ResearchTacticBacktestConfig,
  policy: DailyExecutionPolicy,
): DailyExecutionOrder[] {
  const closeByDate = rawCloseByDate(sessions)
  const planned = new Map<string, PlannedPosition>()
  const orders: DailyExecutionOrder[] = []
  let sequence = 0
  for (let index = 0; index < signals.length; index += 1) {
    const item = signals[index] as ResearchTacticSignal
    const exits = [...planned.values()].filter(position => position.exitSignalIndex === index)
    for (const position of exits) {
      orders.push({
        orderId: `${config.tacticId}:sell:${String(position.sequence)}`,
        symbol: position.symbol,
        signalDate: item.tradingDate,
        side: 'sell',
        quantity: position.quantity,
      })
      planned.delete(position.symbol)
    }
    const available = config.maximumPositions - planned.size
    if (available <= 0) continue
    for (const selected of item.candidates.slice(0, available)) {
      if (planned.has(selected.symbol)) continue
      const close = closeByDate.get(item.tradingDate)?.get(selected.symbol)
      if (close === undefined || !Number.isFinite(close) || close <= 0) continue
      const quantity = Math.floor(policy.initialCash * config.targetPositionFraction / close / policy.lotSize) * policy.lotSize
      if (quantity < policy.lotSize) continue
      sequence += 1
      orders.push({
        orderId: `${config.tacticId}:buy:${String(sequence)}`,
        symbol: selected.symbol,
        signalDate: item.tradingDate,
        side: 'buy',
        quantity,
      })
      planned.set(selected.symbol, {
        symbol: selected.symbol,
        quantity,
        exitSignalIndex: index + config.holdingSessions,
        sequence,
      })
    }
  }
  return orders
}

function equityCurve(
  sessions: readonly DailyExecutionSession[],
  execution: DailyExecutionResult,
): readonly ResearchEquityPoint[] {
  const ordered = [...sessions].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
  const fillsByDate = new Map<string, DailyExecutionFill[]>()
  for (const fill of execution.fills) fillsByDate.set(fill.fillDate, [...fillsByDate.get(fill.fillDate) ?? [], fill])
  const quantities = new Map<string, number>()
  const closes = new Map<string, number>()
  const points: ResearchEquityPoint[] = []
  let cash = execution.policy.initialCash
  let previousEquity = cash
  for (const session of ordered) {
    for (const fill of fillsByDate.get(session.tradingDate) ?? []) {
      quantities.set(fill.symbol, (quantities.get(fill.symbol) ?? 0) + (fill.side === 'buy' ? fill.quantity : -fill.quantity))
      cash = fill.cashAfter
    }
    for (const bar of session.bars) closes.set(bar.symbol, bar.close)
    const marketValue = [...quantities].reduce((sum, [symbol, quantity]) => sum + quantity * (closes.get(symbol) as number), 0)
    const equity = rounded(cash + marketValue)
    points.push({
      tradingDate: session.tradingDate,
      equity,
      dailyReturn: points.length === 0 ? 0 : rounded(equity / previousEquity - 1),
      grossExposure: rounded(marketValue / equity),
    })
    previousEquity = equity
  }
  return points
}

function maximumDrawdown(points: readonly ResearchEquityPoint[]): number {
  let peak = 0
  let drawdown = 0
  for (const point of points) {
    peak = Math.max(peak, point.equity)
    drawdown = Math.max(drawdown, 1 - point.equity / peak)
  }
  return rounded(drawdown)
}

function sharpe(returns: readonly number[]): number {
  if (returns.length < 2) return 0
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
  return variance <= 0 ? 0 : rounded(mean / Math.sqrt(variance) * Math.sqrt(252))
}

function foldMetrics(points: readonly ResearchEquityPoint[], foldSessions: number): readonly ResearchWalkForwardFold[] {
  const folds: ResearchWalkForwardFold[] = []
  for (let offset = 0; offset < points.length - 1; offset += foldSessions) {
    const slice = points.slice(offset, Math.min(offset + foldSessions + 1, points.length))
    const first = slice[0] as ResearchEquityPoint
    const last = slice.at(-1) as ResearchEquityPoint
    folds.push({
      startDate: first.tradingDate,
      endDate: last.tradingDate,
      observations: slice.length,
      totalReturn: rounded(last.equity / first.equity - 1),
      annualizedSharpe: sharpe(slice.slice(1).map(point => point.dailyReturn)),
      maximumDrawdown: maximumDrawdown(slice),
    })
  }
  return folds
}

function metrics(
  points: readonly ResearchEquityPoint[],
  execution: DailyExecutionResult,
  folds: readonly ResearchWalkForwardFold[],
): ResearchTacticMetrics {
  const first = points[0] as ResearchEquityPoint
  const last = points.at(-1) as ResearchEquityPoint
  const periods = points.length - 1
  const totalReturn = last.equity / first.equity - 1
  const averageEquity = points.reduce((sum, point) => sum + point.equity, 0) / points.length
  const submitted = execution.fills.length + execution.rejections.length
  return {
    observations: points.length,
    totalReturn: rounded(totalReturn),
    annualizedReturn: rounded((1 + totalReturn) ** (252 / periods) - 1),
    annualizedSharpe: sharpe(points.slice(1).map(point => point.dailyReturn)),
    maximumDrawdown: maximumDrawdown(points),
    turnover: rounded(execution.fills.reduce((sum, fill) => sum + fill.notional, 0) / averageEquity),
    fillRate: submitted === 0 ? 0 : rounded(execution.fills.length / submitted),
    positiveFoldRatio: rounded(folds.filter(fold => fold.totalReturn > 0).length / folds.length),
  }
}

function doubledCosts(policy: DailyExecutionPolicy): DailyExecutionPolicy {
  return {
    ...policy,
    commissionBps: policy.commissionBps * 2,
    minimumCommission: policy.minimumCommission * 2,
    stampDutySellBps: policy.stampDutySellBps * 2,
    transferFeeBps: policy.transferFeeBps * 2,
    slippageBps: policy.slippageBps * 2,
  }
}

function promotionBlockers(base: ResearchTacticMetrics, stressed: ResearchTacticMetrics): readonly string[] {
  return [
    ...base.annualizedSharpe < 1 ? ['net_out_of_sample_sharpe_below_1'] : [],
    ...stressed.totalReturn <= 0 ? ['doubled_cost_expectation_not_positive'] : [],
    ...base.positiveFoldRatio < 0.7 ? ['positive_fold_ratio_below_70_percent'] : [],
    ...base.maximumDrawdown > 0.25 ? ['maximum_drawdown_above_25_percent'] : [],
    'deflated_sharpe_not_computed',
    'backtest_overfitting_probability_not_computed',
    'market_regime_profit_concentration_not_computed',
  ]
}

/**
 * Evaluate one fixed tactic without tuning on its chronological folds.
 * @param featureInput - Immutable post-close feature records used only on or after their dates.
 * @param sessionInput - Raw executable sessions used for sizing, fills, costs, and marks.
 * @param config - Predeclared portfolio construction and fold boundaries.
 * @param policy - Shared A-share next-open execution and cost policy.
 * @returns Frozen signals, execution audit, equity, folds, metrics, and promotion blockers.
 */
export function evaluateResearchTactic(
  featureInput: readonly DailyHistoryFeatureRecord[],
  sessionInput: readonly DailyExecutionSession[],
  config: ResearchTacticBacktestConfig,
  policy: DailyExecutionPolicy = DEFAULT_A_SHARE_EXECUTION_POLICY,
): ResearchTacticEvaluation {
  validateConfig(config)
  const input = sortedInputs(featureInput, sessionInput)
  const signals = input.features.map(record => generateResearchTacticSignal(config.tacticId, record))
  const orders = buildOrders(signals, input.sessions, config, policy)
  const execution = simulateNextOpenExecution(input.sessions, orders, policy)
  const curve = equityCurve(input.sessions, execution)
  const folds = foldMetrics(curve, config.foldSessions)
  const baseMetrics = metrics(curve, execution, folds)
  const stressedExecution = simulateNextOpenExecution(input.sessions, orders, doubledCosts(policy))
  const stressedCurve = equityCurve(input.sessions, stressedExecution)
  const stressedFolds = foldMetrics(stressedCurve, config.foldSessions)
  const stressedMetrics = metrics(stressedCurve, stressedExecution, stressedFolds)
  return deepFreeze({
    engineVersion: TACTIC_EVALUATION_ENGINE_VERSION,
    config: { ...config },
    policy: { ...policy },
    signals,
    orders,
    execution,
    equityCurve: curve,
    folds,
    metrics: baseMetrics,
    doubledCostMetrics: stressedMetrics,
    promotionDecision: 'research',
    promotionBlockers: promotionBlockers(baseMetrics, stressedMetrics),
  })
}
