import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import {
  tacticDefinitions,
  type ActiveTacticId,
  type TacticDefinition,
  type TacticEligibilityRecord,
  type TacticEligibilityResult,
} from '@deepseek-ai/dsh-market-tactic-eligibility'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { deriveTacticRoutingContext } from './context.ts'
import {
  findTacticScorecardCell,
  tacticConditionalMetrics,
} from './scorecard.ts'
import {
  TACTIC_ROUTER_VERSION,
  type ExecutionQualityBand,
  type RejectedTacticRoute,
  type TacticConditionalMetrics,
  type TacticRouteCandidate,
  type TacticRouteRejectionReason,
  type TacticRouteScoreComponents,
  type TacticRoutingRecord,
  type TacticScorecardRecord,
} from './types.ts'

/** Fixed v1 evidence thresholds; changes require a new router version. */
export const TACTIC_ROUTER_POLICY = deepFreeze({
  minimumMaturedSamples: 8,
  fullConfidenceSamples: 32,
  minimumFillRate: 0.5,
})

const DEFINITIONS = tacticDefinitions()
const DEFINITION_BY_ID = new Map(DEFINITIONS.map(definition => [definition.tacticId, definition]))
const ZERO_COMPONENTS: TacticRouteScoreComponents = deepFreeze({
  stateFit: 0,
  conditionalExpectancy: 0,
  contextAlignment: 0,
  recentEffectiveness: 0,
  executionAndCost: 0,
  drawdownPenalty: 0,
  crowdingPenalty: 0,
  transitionPenalty: 0,
  uncertaintyPenalty: 0,
})

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function components(metrics: TacticConditionalMetrics, context: TacticRoutingRecord['context']): TacticRouteScoreComponents {
  return {
    stateFit: 0.15,
    conditionalExpectancy: rounded(clamp(metrics.expectancyLowerBound * 5, -0.5, 0.5)),
    contextAlignment: 0.1,
    recentEffectiveness: rounded(clamp(metrics.recentEffectiveness * 2, -0.2, 0.2)),
    executionAndCost: rounded(clamp((metrics.fillRate - 0.5) * 0.1 + metrics.doubledCostExpectancy * 2, -0.2, 0.2)),
    drawdownPenalty: rounded(metrics.maximumDrawdown * 0.5),
    crowdingPenalty: context.crowdingBand === 'high' ? 0.08 : context.crowdingBand === 'medium' ? 0.03 : 0,
    transitionPenalty: context.volatilityBand === 'high' ? 0.06 : 0,
    uncertaintyPenalty: rounded(Math.max(0, TACTIC_ROUTER_POLICY.fullConfidenceSamples - metrics.sampleCount)
      / TACTIC_ROUTER_POLICY.fullConfidenceSamples * 0.15),
  }
}

function totalScore(value: TacticRouteScoreComponents): number {
  return rounded(value.stateFit
    + value.conditionalExpectancy
    + value.contextAlignment
    + value.recentEffectiveness
    + value.executionAndCost
    - value.drawdownPenalty
    - value.crowdingPenalty
    - value.transitionPenalty
    - value.uncertaintyPenalty)
}

function scope(definition: TacticDefinition): TacticRouteCandidate['scope'] {
  if (definition.tacticId === 'defensive_no_trade') return 'defense'
  if (definition.promotionStatus === 'research') return 'research'
  if (definition.promotionStatus === 'paper') return 'watch'
  return 'paper'
}

function defensiveCandidate(eligibility: TacticEligibilityResult, snapshotHash: string): TacticRouteCandidate {
  const definition = DEFINITION_BY_ID.get('defensive_no_trade') as TacticDefinition
  return {
    tacticId: definition.tacticId,
    tacticVersion: definition.tacticVersion,
    promotionStatus: definition.promotionStatus,
    eligibilityStatus: eligibility.status,
    scope: 'defense',
    routeScore: 0,
    scoreComponents: ZERO_COMPONENTS,
    metrics: null,
    maximumPaperPositionPct: 0,
    evidenceRefs: [`snapshot:${snapshotHash}#tactic-eligibility/defensive_no_trade`],
  }
}

function routeIdentity(record: Omit<TacticRoutingRecord, 'routeId'>): string {
  return contentHash(record)
}

function reject(
  definition: TacticDefinition & { readonly tacticId: ActiveTacticId },
  reasons: readonly TacticRouteRejectionReason[],
  routeScore: number | null,
): RejectedTacticRoute {
  return {
    tacticId: definition.tacticId,
    tacticVersion: definition.tacticVersion,
    reasons,
    routeScore,
  }
}

/**
 * Produce a deterministic top-three slate from current eligibility and one bounded scorecard.
 * @param features - Current deterministic strategic facts.
 * @param eligibility - P0 catalog-bound eligibility for the same snapshot.
 * @param scorecard - Immutable aggregate whose cutoff does not exceed the decision cutoff.
 * @param executionQualityBand - Current execution condition from already available evidence.
 * @returns Frozen route, defensive fallback, score decomposition, and every rejection.
 */
export function routeEligibleTactics(
  features: StrategicFeatureRecord,
  eligibility: TacticEligibilityRecord,
  scorecard: TacticScorecardRecord,
  executionQualityBand: ExecutionQualityBand = 'unknown',
): TacticRoutingRecord {
  if (eligibility.currentSnapshotHash !== features.currentSnapshotHash
    || eligibility.tradingDate !== features.tradingDate) {
    throw new Error('tactic routing requires eligibility for the current strategic snapshot')
  }
  if (Date.parse(scorecard.cutoffTime) > Date.parse(features.cutoffTime)) {
    throw new Error('tactic routing scorecard cutoff exceeds the strategic decision cutoff')
  }
  const eligibilityById = new Map(eligibility.tactics.map(item => [item.tacticId, item]))
  const defensiveEligibility = eligibilityById.get('defensive_no_trade')
  if (defensiveEligibility?.status !== 'eligible') {
    throw new Error('tactic routing requires an eligible defensive fallback')
  }
  const context = deriveTacticRoutingContext(features, executionQualityBand)
  const qualified: TacticRouteCandidate[] = []
  const rejected: RejectedTacticRoute[] = []
  for (const item of DEFINITIONS) {
    if (item.tacticId === 'defensive_no_trade') continue
    const definition = item as TacticDefinition & { readonly tacticId: ActiveTacticId }
    const gate = eligibilityById.get(definition.tacticId)
    if (gate === undefined || gate.status === 'ineligible') {
      rejected.push(reject(definition, ['context_ineligible'], null))
      continue
    }
    if (gate.tacticVersion !== definition.tacticVersion) {
      rejected.push(reject(definition, ['catalog_version_mismatch'], null))
      continue
    }
    const cell = findTacticScorecardCell(scorecard, definition.tacticId, definition.tacticVersion, context)
    if (cell === undefined) {
      rejected.push(reject(definition, ['missing_conditional_record'], null))
      continue
    }
    const metrics = tacticConditionalMetrics(cell)
    const scoreComponents = components(metrics, context)
    const routeScore = totalScore(scoreComponents)
    const reasons: TacticRouteRejectionReason[] = [
      ...metrics.sampleCount < TACTIC_ROUTER_POLICY.minimumMaturedSamples ? ['insufficient_matured_sample' as const] : [],
      ...metrics.expectancyLowerBound <= 0 ? ['nonpositive_expectancy_lower_bound' as const] : [],
      ...metrics.doubledCostExpectancy <= 0 ? ['nonpositive_doubled_cost_expectancy' as const] : [],
      ...metrics.fillRate < TACTIC_ROUTER_POLICY.minimumFillRate ? ['fill_rate_below_half' as const] : [],
      ...routeScore <= 0 ? ['nonpositive_route_score' as const] : [],
    ]
    if (reasons.length > 0) {
      rejected.push(reject(definition, reasons, routeScore))
      continue
    }
    qualified.push({
      tacticId: definition.tacticId,
      tacticVersion: definition.tacticVersion,
      promotionStatus: definition.promotionStatus,
      eligibilityStatus: gate.status,
      scope: scope(definition),
      routeScore,
      scoreComponents,
      metrics,
      maximumPaperPositionPct: definition.promotionStatus === 'eligible'
        ? definition.maximumPaperPositionPct
        : 0,
      evidenceRefs: [
        `scorecard:${scorecard.scorecardId}#cells/${definition.tacticId}`,
        `snapshot:${features.currentSnapshotHash}#tactic-eligibility/${definition.tacticId}`,
      ],
    })
  }
  qualified.sort((left, right) => right.routeScore - left.routeScore || left.tacticId.localeCompare(right.tacticId))
  const defense = defensiveCandidate(defensiveEligibility, features.currentSnapshotHash)
  const ranked = [...qualified, defense]
  const slate = ranked.slice(0, 3)
  for (const item of qualified.slice(3)) {
    rejected.push({
      tacticId: item.tacticId as ActiveTacticId,
      tacticVersion: item.tacticVersion,
      reasons: ['outside_top_three'],
      routeScore: item.routeScore,
    })
  }
  rejected.sort((left, right) => left.tacticId.localeCompare(right.tacticId))
  const body: Omit<TacticRoutingRecord, 'routeId'> = {
    routerVersion: TACTIC_ROUTER_VERSION,
    tradingDate: features.tradingDate,
    cutoffTime: features.cutoffTime,
    currentSnapshotHash: features.currentSnapshotHash,
    eligibilityEngineVersion: eligibility.engineVersion,
    scorecardId: scorecard.scorecardId,
    context,
    slate,
    defensiveFallback: defense,
    rejected,
    cashFloorPct: rounded(Math.max(0, 100 - slate.reduce((sum, item) => sum + item.maximumPaperPositionPct, 0))),
  }
  return deepFreeze({ ...body, routeId: routeIdentity(body) })
}
