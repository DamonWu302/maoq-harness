import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import {
  DEFAULT_A_SHARE_EXECUTION_POLICY,
  simulateNextOpenExecution,
} from './execution.ts'
import {
  generateResearchTacticSignal,
  type ResearchTacticId,
  type ResearchTacticSignal,
} from './signals.ts'
import { DailyHistoryFeatureStream } from './stream.ts'
import { verifyTacticLabHistoryChunk } from './chunk.ts'
import type {
  DailyExecutionFill,
  DailyExecutionOrder,
  DailyExecutionPolicy,
  DailyExecutionResult,
  DailyExecutionSession,
  DailyHistoryFeatureRecord,
  TacticLabHistoryAdapter,
  TacticLabHistoryRequest,
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

/** Streaming production-history evaluation with complete source identities. */
export interface ResearchTacticHistoryEvaluation extends ResearchTacticEvaluation {
  readonly historyAdapter: string
  readonly historyChunkHashes: readonly string[]
  readonly sourceExecutionHashes: readonly string[]
}

interface PlannedPosition {
  readonly symbol: string
  readonly quantity: number
  readonly exitSignalIndex: number
  readonly sequence: number
}

interface PlannerStep {
  readonly orders: readonly DailyExecutionOrder[]
  readonly relevantSymbols: ReadonlySet<string>
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

class ResearchOrderPlanner {
  private readonly planned = new Map<string, PlannedPosition>()
  private carrySymbols = new Set<string>()
  private index = 0
  private sequence = 0

  constructor(
    private readonly config: ResearchTacticBacktestConfig,
    private readonly policy: DailyExecutionPolicy,
  ) {}

  push(item: ResearchTacticSignal, session: DailyExecutionSession): PlannerStep {
    const orders: DailyExecutionOrder[] = []
    const relevantSymbols = new Set([...this.planned.keys(), ...this.carrySymbols])
    this.carrySymbols = new Set()
    const exits = [...this.planned.values()].filter(position => position.exitSignalIndex === this.index)
    for (const position of exits) {
      orders.push({
        orderId: `${this.config.tacticId}:sell:${String(position.sequence)}`,
        symbol: position.symbol,
        signalDate: item.tradingDate,
        side: 'sell',
        quantity: position.quantity,
      })
      relevantSymbols.add(position.symbol)
      this.carrySymbols.add(position.symbol)
      this.planned.delete(position.symbol)
    }
    const available = this.config.maximumPositions - this.planned.size
    if (available > 0) {
      const closeBySymbol = new Map(session.bars.map(bar => [bar.symbol, bar.close]))
      for (const selected of item.candidates.slice(0, available)) {
        if (this.planned.has(selected.symbol)) continue
        const close = closeBySymbol.get(selected.symbol)
        if (close === undefined || !Number.isFinite(close) || close <= 0) continue
        const lots = Math.floor(this.policy.initialCash * this.config.targetPositionFraction / close / this.policy.lotSize)
        const quantity = lots * this.policy.lotSize
        if (quantity < this.policy.lotSize) continue
        this.sequence += 1
        orders.push({
          orderId: `${this.config.tacticId}:buy:${String(this.sequence)}`,
          symbol: selected.symbol,
          signalDate: item.tradingDate,
          side: 'buy',
          quantity,
        })
        relevantSymbols.add(selected.symbol)
        this.planned.set(selected.symbol, {
          symbol: selected.symbol,
          quantity,
          exitSignalIndex: this.index + this.config.holdingSessions,
          sequence: this.sequence,
        })
      }
    }
    this.index += 1
    return { orders, relevantSymbols }
  }
}

function buildOrders(
  signals: readonly ResearchTacticSignal[],
  sessions: readonly DailyExecutionSession[],
  config: ResearchTacticBacktestConfig,
  policy: DailyExecutionPolicy,
): DailyExecutionOrder[] {
  const sessionByDate = new Map(sessions.map(session => [session.tradingDate, session]))
  const planner = new ResearchOrderPlanner(config, policy)
  return signals.flatMap(item => planner.push(item, sessionByDate.get(item.tradingDate) ?? {
    tradingDate: item.tradingDate,
    contentHash: '0'.repeat(64),
    bars: [],
  }).orders)
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

function evaluationResult(
  signals: readonly ResearchTacticSignal[],
  orders: readonly DailyExecutionOrder[],
  sessions: readonly DailyExecutionSession[],
  config: ResearchTacticBacktestConfig,
  policy: DailyExecutionPolicy,
): ResearchTacticEvaluation {
  const execution = simulateNextOpenExecution(sessions, orders, policy)
  const curve = equityCurve(sessions, execution)
  const folds = foldMetrics(curve, config.foldSessions)
  const baseMetrics = metrics(curve, execution, folds)
  const stressedExecution = simulateNextOpenExecution(sessions, orders, doubledCosts(policy))
  const stressedCurve = equityCurve(sessions, stressedExecution)
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
  return evaluationResult(signals, orders, input.sessions, config, policy)
}

/**
 * Stream one production history source into a memory-bounded tactic evaluation.
 * @param adapter - Registered provider of verified paired feature/execution chunks.
 * @param request - Inclusive quality-gated history range and chunk bounds.
 * @param config - Predeclared tactic portfolio construction and fold boundaries.
 * @param policy - Shared A-share next-open execution and cost policy.
 * @returns Evaluation plus every full source chunk and execution-session identity.
 */
export async function evaluateResearchTacticHistory(
  adapter: TacticLabHistoryAdapter,
  request: TacticLabHistoryRequest,
  config: ResearchTacticBacktestConfig,
  policy: DailyExecutionPolicy = DEFAULT_A_SHARE_EXECUTION_POLICY,
): Promise<ResearchTacticHistoryEvaluation> {
  validateConfig(config)
  const featureStream = new DailyHistoryFeatureStream()
  const planner = new ResearchOrderPlanner(config, policy)
  const signals: ResearchTacticSignal[] = []
  const orders: DailyExecutionOrder[] = []
  const sessions: DailyExecutionSession[] = []
  const historyChunkHashes: string[] = []
  const sourceExecutionHashes: string[] = []
  for await (const chunk of adapter.load(request)) {
    verifyTacticLabHistoryChunk(chunk)
    historyChunkHashes.push(chunk.contentHash)
    for (let index = 0; index < chunk.featureSessions.length; index += 1) {
      const featureSession = chunk.featureSessions[index] as NonNullable<typeof chunk.featureSessions[number]>
      const executionSession = chunk.executionSessions[index] as NonNullable<typeof chunk.executionSessions[number]>
      const record = featureStream.push(featureSession)
      const signal = generateResearchTacticSignal(config.tacticId, record)
      const step = planner.push(signal, executionSession)
      const bars = executionSession.bars.filter(bar => step.relevantSymbols.has(bar.symbol))
      signals.push(signal)
      orders.push(...step.orders)
      sourceExecutionHashes.push(executionSession.contentHash)
      sessions.push({
        tradingDate: executionSession.tradingDate,
        contentHash: contentHash({ sourceExecutionHash: executionSession.contentHash, bars }),
        bars,
      })
    }
  }
  if (sessions.length < 2) throw new Error('history evaluation requires at least two complete sessions')
  const result = evaluationResult(signals, orders, sessions, config, policy)
  return deepFreeze({
    ...result,
    historyAdapter: adapter.name,
    historyChunkHashes,
    sourceExecutionHashes,
  })
}
