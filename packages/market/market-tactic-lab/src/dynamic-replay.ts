import {
  ACTIVE_TACTIC_IDS,
  evaluateTacticEligibility,
  type ActiveTacticId,
  type TacticId,
} from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  advanceTacticScorecard,
  attributeMaturedTacticOutcome,
  createEmptyTacticScorecard,
  routeEligibleTactics,
  selectTacticTransition,
  tacticConditionalMetrics,
  verifyTacticCommanderDecisionRecord,
  type ExecutionQualityBand,
  type MaturedTacticOutcome,
  type TacticEvidenceScope,
  type TacticCommanderDecisionRecord,
  type TacticRoutingRecord,
  type TacticScorecardRecord,
  type TacticTransitionReason,
  type TacticTransitionState,
} from '@deepseek-ai/dsh-market-tactic-routing'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  evaluateDynamicBenchmarks,
  type DynamicBenchmarkEvaluation,
  type DynamicReplayReturnSeries,
} from './benchmark.ts'
import type {
  ResearchEquityPoint,
  ResearchTacticEvaluation,
  ResearchTacticSuiteHistoryEvaluation,
} from './evaluation.ts'
import type { ResearchTacticId } from './signals.ts'

/** Current prequential route, attribution, and switching-cost policy. */
export const DYNAMIC_TACTIC_REPLAY_VERSION = 'maoq-dynamic-tactic-replay-v4' as const

/** Predeclared historical comparison policy; changing it creates a new replay version. */
export const DYNAMIC_TACTIC_REPLAY_POLICY = deepFreeze({ switchingCostBps: 5 })

/** One daily routed choice with optional model-assisted proposal and final veto result. */
export interface DynamicTacticReplayDay {
  readonly tradingDate: string
  readonly routeId: string
  readonly scorecardId: string
  readonly routedTacticId: TacticId
  readonly transitionId: string
  readonly transitionReason: TacticTransitionReason
  readonly heldRoutableSessions: number
  readonly deterministicTacticId: TacticId
  readonly deterministicEvidenceScope: TacticEvidenceScope | null
  readonly commanderDecisionId: string | null
  readonly proposedTacticId: TacticId
  readonly finalTacticId: TacticId
}

/** Comparable net return track after the replay policy's switching costs. */
export interface DynamicTacticReplayTrack {
  readonly observations: number
  readonly finalEquity: number
  readonly totalReturn: number
  readonly annualizedReturn: number
  readonly annualizedSharpe: number
  readonly maximumDrawdown: number
  readonly activeSessions: number
  readonly switches: number
  readonly switchingCostPaid: number
}

/** Full cutoff-correct replay with fixed, equal-allocation, abstention, route, and commander tracks. */
export interface DynamicTacticReplayEvaluation {
  readonly replayVersion: typeof DYNAMIC_TACTIC_REPLAY_VERSION
  readonly switchingCostBps: number
  readonly sessions: number
  readonly routableSessions: number
  readonly unroutableSessions: number
  readonly commanderDecisions: number
  readonly commanderCoverage: number
  readonly routes: readonly TacticRoutingRecord[]
  readonly days: readonly DynamicTacticReplayDay[]
  readonly tracks: {
    readonly fixed: Readonly<Record<ResearchTacticId, DynamicTacticReplayTrack>>
    readonly equalAllocation: DynamicTacticReplayTrack
    readonly defensiveNoTrade: DynamicTacticReplayTrack
    readonly statelessRoute: DynamicTacticReplayTrack
    readonly deterministicRoute: DynamicTacticReplayTrack
    readonly commanderProposed: DynamicTacticReplayTrack
    readonly commanderFinal: DynamicTacticReplayTrack
  }
  readonly benchmarks: Readonly<Record<string, DynamicBenchmarkEvaluation>>
}

interface TrackCalculation {
  readonly summary: DynamicTacticReplayTrack
  readonly series: DynamicReplayReturnSeries
}

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function executionQuality(scorecard: TacticScorecardRecord): ExecutionQualityBand {
  if (scorecard.cells.length === 0) return 'unknown'
  const fillRate = scorecard.cells.reduce((sum, cell) => sum + tacticConditionalMetrics(cell).fillRate, 0)
    / scorecard.cells.length
  if (fillRate < 0.5) return 'weak'
  if (fillRate >= 0.8) return 'strong'
  return 'normal'
}

function maximumDrawdown(curve: readonly ResearchEquityPoint[], start: number, end: number): number {
  let peak = (curve[start] as ResearchEquityPoint).equity
  let drawdown = 0
  for (let index = start; index <= end; index += 1) {
    const equity = curve[index]?.equity
    if (equity === undefined) throw new Error('tactic replay equity curve is incomplete')
    peak = Math.max(peak, equity)
    drawdown = Math.max(drawdown, 1 - equity / peak)
  }
  return rounded(drawdown)
}

function fillRate(evaluation: ResearchTacticEvaluation, startDate: string, maturityDate: string): number {
  const orders = evaluation.orders.filter(order => order.signalDate >= startDate && order.signalDate < maturityDate)
  if (orders.length === 0) return 0
  const ids = new Set(orders.map(order => order.orderId))
  const fills = evaluation.execution.fills.filter(fill => ids.has(fill.orderId)).length
  return rounded(fills / orders.length)
}

function outcome(
  suite: ResearchTacticSuiteHistoryEvaluation,
  tacticId: ActiveTacticId,
  decisionIndex: number,
  executionQualityBand: ExecutionQualityBand,
): MaturedTacticOutcome | undefined {
  const evaluation = suite.evaluations[tacticId]
  const maturityIndex = decisionIndex + evaluation.config.holdingSessions
  const decision = suite.strategicFeatures[decisionIndex]
  const maturity = suite.strategicFeatures[maturityIndex]
  const start = evaluation.equityCurve[decisionIndex]
  const end = evaluation.equityCurve[maturityIndex]
  const stressedStart = evaluation.doubledCostEquityCurve[decisionIndex]
  const stressedEnd = evaluation.doubledCostEquityCurve[maturityIndex]
  if (decision === undefined || maturity === undefined || start === undefined || end === undefined
    || stressedStart === undefined || stressedEnd === undefined) return undefined
  if (start.equity <= 0 || stressedStart.equity <= 0) throw new Error('tactic replay requires positive equity')
  const sourceHashes = [...new Set([
    decision.currentSnapshotHash,
    maturity.currentSnapshotHash,
    suite.sourceExecutionHashes[decisionIndex],
    suite.sourceExecutionHashes[maturityIndex],
  ].filter((value): value is string => value !== undefined))]
  return attributeMaturedTacticOutcome({
    tacticId,
    decisionFeatures: decision,
    executionQualityBand,
    maturityDate: maturity.tradingDate,
    availableAt: maturity.cutoffTime,
    netReturn: rounded(end.equity / start.equity - 1),
    doubledCostNetReturn: rounded(stressedEnd.equity / stressedStart.equity - 1),
    maximumDrawdown: maximumDrawdown(evaluation.equityCurve, decisionIndex, maturityIndex),
    fillRate: fillRate(evaluation, decision.tradingDate, maturity.tradingDate),
    sourceHashes,
  })
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function track(
  returns: readonly number[],
  selections: readonly TacticId[],
  switchingCostBps: number,
): TrackCalculation {
  let equity = 1
  let peak = 1
  let drawdown = 0
  let previous: TacticId = 'defensive_no_trade'
  let switches = 0
  let switchingCostPaid = 0
  let activeSessions = 0
  const netReturns = returns.map((raw, index) => {
    const selected = selections[index] as TacticId
    const switched = selected !== previous
    const cost = switched ? switchingCostBps / 10_000 : 0
    if (switched) switches += 1
    if (selected !== 'defensive_no_trade') activeSessions += 1
    switchingCostPaid += cost
    previous = selected
    const net = Math.max(-0.999999, raw - cost)
    equity *= 1 + net
    peak = Math.max(peak, equity)
    drawdown = Math.max(drawdown, 1 - equity / peak)
    return net
  })
  const average = mean(netReturns)
  const variance = netReturns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (netReturns.length - 1)
  return deepFreeze({
    summary: {
      observations: netReturns.length,
      finalEquity: rounded(equity),
      totalReturn: rounded(equity - 1),
      annualizedReturn: rounded(equity ** (252 / netReturns.length) - 1),
      annualizedSharpe: variance === 0 ? 0 : rounded(average / Math.sqrt(variance) * Math.sqrt(252)),
      maximumDrawdown: rounded(drawdown),
      activeSessions,
      switches,
      switchingCostPaid: rounded(switchingCostPaid),
    },
    series: {
      returns: netReturns,
      active: selections.map(selection => selection !== 'defensive_no_trade'),
    },
  })
}

function alignedReturn(
  suite: ResearchTacticSuiteHistoryEvaluation,
  tacticId: TacticId,
  index: number,
): number {
  return tacticId === 'defensive_no_trade'
    ? 0
    : (suite.evaluations[tacticId].equityCurve[index] as ResearchEquityPoint).dailyReturn
}

function trackFromDecisionMap(
  suite: ResearchTacticSuiteHistoryEvaluation,
  selectedByDate: ReadonlyMap<string, TacticId>,
  switchingCostBps: number,
): TrackCalculation {
  const dates = suite.strategicFeatures.map(features => features.tradingDate)
  const selections: TacticId[] = []
  const returns: number[] = []
  for (let index = 1; index < dates.length; index += 1) {
    const selection = selectedByDate.get(dates[index - 1] as string) ?? 'defensive_no_trade'
    selections.push(selection)
    returns.push(alignedReturn(suite, selection, index))
  }
  return track(returns, selections, switchingCostBps)
}

/**
 * Replay daily conditional scorecards and routed tactic choices without future-visible outcomes.
 * @param suite - One-read fixed-tactic history with aligned strategic features and stressed curves.
 * @param commanderDecisions - Optional recorded P2 decisions; absent routes remain defense in model tracks.
 * @param switchingCostBps - Predeclared cost charged whenever a track changes tactic.
 * @returns Immutable routes, daily choices, coverage, and comparable performance attribution.
 */
export function evaluateDynamicTacticReplay(
  suite: ResearchTacticSuiteHistoryEvaluation,
  commanderDecisions: readonly TacticCommanderDecisionRecord[] = [],
  switchingCostBps: number = DYNAMIC_TACTIC_REPLAY_POLICY.switchingCostBps,
): DynamicTacticReplayEvaluation {
  if (!Number.isFinite(switchingCostBps) || switchingCostBps < 0 || switchingCostBps > 100) {
    throw new TypeError('switchingCostBps must be between zero and 100')
  }
  const sessions = suite.strategicFeatures.length
  if (sessions < 3 || suite.sourceExecutionHashes.length !== sessions) {
    throw new Error('dynamic tactic replay requires aligned strategic and execution sessions')
  }
  for (const tacticId of ACTIVE_TACTIC_IDS) {
    const evaluation = suite.evaluations[tacticId]
    if (evaluation.equityCurve.length !== sessions || evaluation.doubledCostEquityCurve.length !== sessions) {
      throw new Error(`dynamic tactic replay curve mismatch for ${tacticId}`)
    }
  }
  const decisionByRoute = new Map<string, TacticCommanderDecisionRecord>()
  for (const decision of commanderDecisions) {
    if (decisionByRoute.has(decision.routeId)) throw new Error(`duplicate commander decision for route ${decision.routeId}`)
    decisionByRoute.set(decision.routeId, decision)
  }
  const first = suite.strategicFeatures[0] as NonNullable<typeof suite.strategicFeatures[number]>
  let scorecard = createEmptyTacticScorecard(`${first.tradingDate}T00:00:00+08:00`)
  const pending = new Map<string, MaturedTacticOutcome[]>()
  const routes: TacticRoutingRecord[] = []
  const days: DynamicTacticReplayDay[] = []
  const routedByDate = new Map<string, TacticId>()
  const deterministicByDate = new Map<string, TacticId>()
  const proposedByDate = new Map<string, TacticId>()
  const finalByDate = new Map<string, TacticId>()
  let transitionState: TacticTransitionState = {
    tacticId: 'defensive_no_trade',
    heldRoutableSessions: 0,
  }
  let usedCommanderDecisions = 0
  for (let index = 0; index < sessions; index += 1) {
    const features = suite.strategicFeatures[index] as NonNullable<typeof suite.strategicFeatures[number]>
    scorecard = advanceTacticScorecard(scorecard, pending.get(features.tradingDate) ?? [], features.cutoffTime)
    if (!features.eligibleForInterpretation) {
      transitionState = { tacticId: 'defensive_no_trade', heldRoutableSessions: 0 }
      continue
    }
    if (features.sectorBattlefields.status !== 'ready'
      || (features.sectorBattlefields.value[0]?.compositeScore ?? 0) <= 0) {
      transitionState = { tacticId: 'defensive_no_trade', heldRoutableSessions: 0 }
      continue
    }
    const quality = executionQuality(scorecard)
    const route = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard, quality)
    routes.push(route)
    const routed = (route.slate[0] as NonNullable<typeof route.slate[number]>).tacticId
    const transition = selectTacticTransition(route, transitionState)
    transitionState = {
      tacticId: transition.selectedTacticId,
      heldRoutableSessions: transition.heldRoutableSessions,
    }
    const deterministic = transition.selectedTacticId
    const deterministicEvidenceScope = deterministic === 'defensive_no_trade'
      ? null
      : route.slate.find(item => item.tacticId === deterministic)?.evidenceScope ?? null
    const recorded = decisionByRoute.get(route.routeId)
    const commander = recorded === undefined ? undefined : verifyTacticCommanderDecisionRecord(recorded, route)
    if (commander !== undefined) usedCommanderDecisions += 1
    const proposed = commander?.proposal.primaryTacticId ?? 'defensive_no_trade'
    const final = commander?.finalPrimaryTacticId ?? 'defensive_no_trade'
    routedByDate.set(features.tradingDate, routed)
    deterministicByDate.set(features.tradingDate, deterministic)
    proposedByDate.set(features.tradingDate, proposed)
    finalByDate.set(features.tradingDate, final)
    days.push({
      tradingDate: features.tradingDate,
      routeId: route.routeId,
      scorecardId: route.scorecardId,
      routedTacticId: routed,
      transitionId: transition.transitionId,
      transitionReason: transition.reason,
      heldRoutableSessions: transition.heldRoutableSessions,
      deterministicTacticId: deterministic,
      deterministicEvidenceScope,
      commanderDecisionId: commander?.decisionId ?? null,
      proposedTacticId: proposed,
      finalTacticId: final,
    })
    for (const tacticId of ACTIVE_TACTIC_IDS) {
      const matured = outcome(suite, tacticId, index, quality)
      if (matured === undefined) continue
      pending.set(matured.maturityDate, [...pending.get(matured.maturityDate) ?? [], matured])
    }
  }
  const fixedCalculations = Object.fromEntries(ACTIVE_TACTIC_IDS.map((tacticId) => {
    const returns = suite.evaluations[tacticId].equityCurve.slice(1).map(point => point.dailyReturn)
    return [tacticId, track(returns, returns.map(() => tacticId), 0)]
  })) as Record<ResearchTacticId, TrackCalculation>
  const equalReturns = suite.strategicFeatures.slice(1).map((_features, offset) => (
    mean(ACTIVE_TACTIC_IDS.map(tacticId => (
      suite.evaluations[tacticId].equityCurve[offset + 1] as ResearchEquityPoint
    ).dailyReturn))
  ))
  const defensiveSelections = equalReturns.map(() => 'defensive_no_trade' as const)
  const equalSelections = equalReturns.map(() => ACTIVE_TACTIC_IDS[0] as ActiveTacticId)
  const equalAllocation = track(equalReturns, equalSelections, 0)
  const defensiveNoTrade = track(equalReturns.map(() => 0), defensiveSelections, 0)
  const statelessRoute = trackFromDecisionMap(suite, routedByDate, switchingCostBps)
  const deterministicRoute = trackFromDecisionMap(suite, deterministicByDate, switchingCostBps)
  const commanderProposed = trackFromDecisionMap(suite, proposedByDate, switchingCostBps)
  const commanderFinal = trackFromDecisionMap(suite, finalByDate, switchingCostBps)
  const benchmarks = evaluateDynamicBenchmarks(suite.benchmarks, {
    fixed: Object.fromEntries(Object.entries(fixedCalculations).map(([tacticId, calculation]) => [
      tacticId,
      calculation.series,
    ])) as Record<ResearchTacticId, DynamicReplayReturnSeries>,
    equalAllocation: equalAllocation.series,
    defensiveNoTrade: defensiveNoTrade.series,
    statelessRoute: statelessRoute.series,
    deterministicRoute: deterministicRoute.series,
    commanderProposed: commanderProposed.series,
    commanderFinal: commanderFinal.series,
  }, suite.strategicFeatures.slice(0, -1).map(features => (
    features.marketRegime.status === 'ready' ? features.marketRegime.value.label : 'unavailable'
  )), suite.strategicFeatures.map(features => features.tradingDate))
  const result: DynamicTacticReplayEvaluation = {
    replayVersion: DYNAMIC_TACTIC_REPLAY_VERSION,
    switchingCostBps,
    sessions,
    routableSessions: routes.length,
    unroutableSessions: sessions - routes.length,
    commanderDecisions: usedCommanderDecisions,
    commanderCoverage: routes.length === 0 ? 0 : rounded(usedCommanderDecisions / routes.length),
    routes,
    days,
    tracks: {
      fixed: Object.fromEntries(Object.entries(fixedCalculations).map(([tacticId, calculation]) => [
        tacticId,
        calculation.summary,
      ])) as Record<ResearchTacticId, DynamicTacticReplayTrack>,
      equalAllocation: equalAllocation.summary,
      defensiveNoTrade: defensiveNoTrade.summary,
      statelessRoute: statelessRoute.summary,
      deterministicRoute: deterministicRoute.summary,
      commanderProposed: commanderProposed.summary,
      commanderFinal: commanderFinal.summary,
    },
    benchmarks,
  }
  return deepFreeze(result)
}
