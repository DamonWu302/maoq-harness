import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import {
  tacticDefinitions,
  isTacticId,
  type ActiveTacticId,
  type TacticDefinition,
  type TacticEligibilityRecord,
  type TacticEligibilityResult,
} from '@deepseek-ai/dsh-market-tactic-eligibility'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { deriveTacticRoutingContext } from './context.ts'
import {
  selectTacticScorecardEvidence,
} from './scorecard.ts'
import {
  TACTIC_ROUTER_VERSION,
  type ExecutionQualityBand,
  type RejectedTacticRoute,
  type TacticConditionalMetrics,
  type TacticAdvisoryCandidate,
  type TacticRouteCandidate,
  type TacticRouteRejectionReason,
  type TacticRouteScoreComponents,
  type TacticEvidenceScope,
  type TacticRoutingRecord,
  type TacticScorecardRecord,
} from './types.ts'

/** Fixed v3 evidence thresholds; changes require a new router version. */
export const TACTIC_ROUTER_POLICY = deepFreeze({
  minimumMaturedSamples: 8,
  fullConfidenceSamples: 32,
  minimumFillRate: 0.5,
})

const DEFINITIONS = tacticDefinitions()
const DEFINITION_BY_ID = new Map(DEFINITIONS.map(definition => [definition.tacticId, definition]))
const ROUTE_SCOPE_BY_PROMOTION = deepFreeze({
  research: 'research',
  paper: 'watch',
  eligible: 'paper',
} as const)
const POSITION_AUTHORITY_BY_PROMOTION = deepFreeze({ research: 0, paper: 0, eligible: 1 } as const)
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

function components(
  metrics: TacticConditionalMetrics,
  context: TacticRoutingRecord['context'],
  evidenceScope: TacticEvidenceScope,
  stateFit: number,
): TacticRouteScoreComponents {
  return {
    stateFit,
    conditionalExpectancy: rounded(clamp(metrics.expectancyLowerBound * 5, -0.5, 0.5)),
    contextAlignment: evidenceScope === 'exact_context' ? 0.1 : evidenceScope === 'regime_emotion' ? 0.06 : 0.03,
    recentEffectiveness: rounded(clamp(metrics.recentEffectiveness * 2, -0.2, 0.2)),
    executionAndCost: rounded(clamp((metrics.fillRate - 0.5) * 0.1 + metrics.doubledCostExpectancy * 2, -0.2, 0.2)),
    drawdownPenalty: rounded(metrics.maximumDrawdown * 0.5),
    crowdingPenalty: context.crowdingBand === 'high' ? 0.08 : context.crowdingBand === 'medium' ? 0.03 : 0,
    transitionPenalty: context.volatilityBand === 'high' ? 0.06 : 0,
    uncertaintyPenalty: rounded(Math.max(0, TACTIC_ROUTER_POLICY.fullConfidenceSamples - metrics.sampleCount)
      / TACTIC_ROUTER_POLICY.fullConfidenceSamples * 0.15),
  }
}

function stateFit(definition: TacticDefinition, context: TacticRoutingRecord['context']): number {
  const market = definition.eligibleMarketRegimes.includes(context.marketRegime)
  const emotion = definition.eligibleEmotionCycles.includes(context.emotionCycle)
  if (market && emotion) return 0.15
  if (market) return 0.08
  if (emotion) return 0.04
  return 0
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

function scope(definition: TacticDefinition & { readonly tacticId: ActiveTacticId }): TacticRouteCandidate['scope'] {
  return ROUTE_SCOPE_BY_PROMOTION[definition.promotionStatus]
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
    evidenceScope: null,
    scoreComponents: ZERO_COMPONENTS,
    metrics: null,
    maximumPaperPositionPct: 0,
    evidenceRefs: [`snapshot:${snapshotHash}#tactic-eligibility/defensive_no_trade`],
  }
}

function routeIdentity(record: Omit<TacticRoutingRecord, 'routeId'>): string {
  return contentHash(record)
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function validCandidate(value: unknown): value is TacticRouteCandidate {
  const record = recordOf(value)
  const evidenceRefs = record['evidenceRefs']
  return isTacticId(record['tacticId'])
    && typeof record['tacticVersion'] === 'string'
    && typeof record['routeScore'] === 'number'
    && Number.isFinite(record['routeScore'])
    && typeof record['maximumPaperPositionPct'] === 'number'
    && Number.isFinite(record['maximumPaperPositionPct'])
    && record['maximumPaperPositionPct'] >= 0
    && record['maximumPaperPositionPct'] <= 100
    && (record['tacticId'] === 'defensive_no_trade'
      ? record['evidenceScope'] === null
      : ['exact_context', 'regime_emotion', 'market_regime'].includes(record['evidenceScope'] as string))
    && Array.isArray(evidenceRefs)
    && evidenceRefs.every(ref => typeof ref === 'string' && ref.length > 0)
}

function validAdvisoryCandidate(value: unknown): value is TacticAdvisoryCandidate {
  const record = recordOf(value)
  return isTacticId(record['tacticId'])
    && typeof record['tacticVersion'] === 'string'
    && typeof record['family'] === 'string'
    && typeof record['contextFit'] === 'boolean'
    && ['top_three', 'qualified_outside_top_three', 'rejected', 'defense'].includes(record['quantDisposition'] as string)
    && (record['routeScore'] === null || (typeof record['routeScore'] === 'number' && Number.isFinite(record['routeScore'])))
    && ['eligible', 'watch_only', 'research_only'].includes(record['eligibilityStatus'] as string)
    && ['research', 'paper', 'eligible'].includes(record['promotionStatus'] as string)
    && ['eligibleSectorIds', 'quantReasons', 'entryPolicy', 'exitPolicy', 'invalidationPolicy', 'executionRequirements', 'evidenceRefs']
      .every(field => Array.isArray(record[field]) && (record[field] as unknown[]).every(item => typeof item === 'string'))
}

/**
 * Verify a serialized deterministic route before it crosses into the model-facing commander.
 * @param value - Untrusted parsed route value.
 * @returns The exact route when its identity and critical bounded fields are valid.
 */
export function verifyTacticRoutingRecord(value: unknown): TacticRoutingRecord {
  const record = recordOf(value)
  const routeId = record['routeId']
  const slate = record['slate']
  const defense = record['defensiveFallback']
  const advisoryUniverse = record['advisoryUniverse']
  if (record['routerVersion'] !== TACTIC_ROUTER_VERSION
    || typeof routeId !== 'string'
    || !/^[a-f0-9]{64}$/u.test(routeId)
    || typeof record['tradingDate'] !== 'string'
    || typeof record['cutoffTime'] !== 'string'
    || !Number.isFinite(Date.parse(record['cutoffTime']))
    || typeof record['currentSnapshotHash'] !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record['currentSnapshotHash'])
    || typeof record['scorecardId'] !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record['scorecardId'])
    || !Array.isArray(slate)
    || slate.length < 1
    || slate.length > 3
    || !slate.every(validCandidate)
    || new Set(slate.map(item => item.tacticId)).size !== slate.length
    || !validCandidate(defense)
    || defense.tacticId !== 'defensive_no_trade'
    || !Array.isArray(advisoryUniverse)
    || advisoryUniverse.length < 1
    || advisoryUniverse.length > DEFINITIONS.length
    || !advisoryUniverse.every(validAdvisoryCandidate)
    || new Set(advisoryUniverse.map(item => item.tacticId)).size !== advisoryUniverse.length
    || !advisoryUniverse.some(item => item.tacticId === 'defensive_no_trade' && item.quantDisposition === 'defense')
    || !slate.every(item => advisoryUniverse.some(advisory => advisory.tacticId === item.tacticId))
    || typeof record['cashFloorPct'] !== 'number'
    || !Number.isFinite(record['cashFloorPct'])
    || record['cashFloorPct'] < 0
    || record['cashFloorPct'] > 100) {
    throw new TypeError('invalid deterministic tactic routing record')
  }
  const { routeId: _routeId, ...body } = value as TacticRoutingRecord
  if (routeIdentity(body) !== routeId) throw new Error('deterministic tactic routing record identity mismatch')
  return value as TacticRoutingRecord
}

function reject(
  definition: TacticDefinition & { readonly tacticId: ActiveTacticId },
  reasons: readonly TacticRouteRejectionReason[],
  routeScore: number | null,
  evidenceScope: TacticEvidenceScope | null,
): RejectedTacticRoute {
  return {
    tacticId: definition.tacticId,
    tacticVersion: definition.tacticVersion,
    reasons,
    routeScore,
    evidenceScope,
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
      rejected.push(reject(definition, ['context_ineligible'], null, null))
      continue
    }
    if (gate.tacticVersion !== definition.tacticVersion) {
      rejected.push(reject(definition, ['catalog_version_mismatch'], null, null))
      continue
    }
    const evidence = selectTacticScorecardEvidence(
      scorecard,
      definition.tacticId,
      definition.tacticVersion,
      context,
      TACTIC_ROUTER_POLICY.minimumMaturedSamples,
    )
    if (evidence === undefined) {
      rejected.push(reject(definition, ['missing_conditional_record'], null, null))
      continue
    }
    const metrics = evidence.metrics
    const scoreComponents = components(metrics, context, evidence.scope, stateFit(definition, context))
    const routeScore = totalScore(scoreComponents)
    const reasons: TacticRouteRejectionReason[] = [
      ...metrics.sampleCount < TACTIC_ROUTER_POLICY.minimumMaturedSamples ? ['insufficient_matured_sample' as const] : [],
      ...metrics.expectancyLowerBound <= 0 ? ['nonpositive_expectancy_lower_bound' as const] : [],
      ...metrics.doubledCostExpectancy <= 0 ? ['nonpositive_doubled_cost_expectancy' as const] : [],
      ...metrics.fillRate < TACTIC_ROUTER_POLICY.minimumFillRate ? ['fill_rate_below_half' as const] : [],
      ...routeScore <= 0 ? ['nonpositive_route_score' as const] : [],
    ]
    if (reasons.length > 0) {
      rejected.push(reject(definition, reasons, routeScore, evidence.scope))
      continue
    }
    qualified.push({
      tacticId: definition.tacticId,
      tacticVersion: definition.tacticVersion,
      promotionStatus: definition.promotionStatus,
      eligibilityStatus: gate.status,
      scope: scope(definition),
      routeScore,
      evidenceScope: evidence.scope,
      scoreComponents,
      metrics,
      maximumPaperPositionPct: definition.maximumPaperPositionPct
        * POSITION_AUTHORITY_BY_PROMOTION[definition.promotionStatus],
      evidenceRefs: [
        `scorecard:${scorecard.scorecardId}#evidence/${definition.tacticId}/${evidence.scope}`,
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
      evidenceScope: item.evidenceScope,
    })
  }
  rejected.sort((left, right) => left.tacticId.localeCompare(right.tacticId))
  const slateById = new Map(slate.map(item => [item.tacticId, item]))
  const rejectedById = new Map(rejected.map(item => [item.tacticId, item]))
  const advisoryUniverse: TacticAdvisoryCandidate[] = DEFINITIONS.flatMap((definition) => {
    const gate = eligibilityById.get(definition.tacticId)
    if (gate === undefined || gate.status === 'ineligible') return []
    const routed = slateById.get(definition.tacticId)
    const rejectedRoute = rejectedById.get(definition.tacticId as ActiveTacticId)
    const quantDisposition = definition.tacticId === 'defensive_no_trade'
      ? 'defense' as const
      : routed !== undefined
        ? 'top_three' as const
        : rejectedRoute?.reasons.includes('outside_top_three') === true
          ? 'qualified_outside_top_three' as const
          : 'rejected' as const
    return [{
      tacticId: definition.tacticId,
      tacticVersion: definition.tacticVersion,
      family: definition.family,
      promotionStatus: definition.promotionStatus,
      eligibilityStatus: gate.status,
      contextFit: gate.contextFit,
      eligibleSectorIds: gate.eligibleSectorIds,
      quantDisposition,
      quantReasons: rejectedRoute?.reasons ?? [],
      routeScore: routed?.routeScore ?? rejectedRoute?.routeScore ?? null,
      entryPolicy: definition.entryPolicy,
      exitPolicy: definition.exitPolicy,
      invalidationPolicy: definition.invalidationPolicy,
      executionRequirements: definition.executionRequirements,
      evidenceRefs: [...new Set([
        ...gate.evidenceRefs,
        ...routed?.evidenceRefs ?? [],
        `snapshot:${features.currentSnapshotHash}#tactic-eligibility/${definition.tacticId}`,
      ])].sort(),
    }]
  })
  const body: Omit<TacticRoutingRecord, 'routeId'> = {
    routerVersion: TACTIC_ROUTER_VERSION,
    tradingDate: features.tradingDate,
    cutoffTime: features.cutoffTime,
    currentSnapshotHash: features.currentSnapshotHash,
    eligibilityEngineVersion: eligibility.engineVersion,
    scorecardId: scorecard.scorecardId,
    context,
    slate,
    advisoryUniverse,
    defensiveFallback: defense,
    rejected,
    cashFloorPct: rounded(Math.max(0, 100 - slate.reduce((sum, item) => sum + item.maximumPaperPositionPct, 0))),
  }
  return deepFreeze({ ...body, routeId: routeIdentity(body) })
}
