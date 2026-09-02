import type {
  EmotionCycle,
  MarketRegime,
  StrategicFeatureRecord,
} from '@deepseek-ai/dsh-market-strategic-state'
import type {
  TacticEligibilityStatus,
  TacticId,
  TacticPromotionStatus,
} from '@deepseek-ai/dsh-market-tactic-eligibility'

/** Current immutable matured-outcome format. */
export const TACTIC_OUTCOME_SCHEMA_VERSION = 1 as const
/** Current incremental conditional-scorecard format. */
export const TACTIC_SCORECARD_SCHEMA_VERSION = 1 as const
/** Current fixed transforms, thresholds, and route-score identity. */
export const TACTIC_ROUTER_VERSION = 'maoq-deterministic-tactic-router-v1' as const
/** Current context bucketing identity. */
export const TACTIC_CONTEXT_VERSION = 'maoq-tactic-context-v1' as const
/** Current host-owned bounded commander decision format. */
export const TACTIC_COMMANDER_SCHEMA_VERSION = 1 as const
/** Current commander scope, validation, and final-veto policy. */
export const TACTIC_COMMANDER_POLICY_VERSION = 'maoq-bounded-tactic-commander-v1' as const

/** Bounded top-sector participation condition. */
export type SectorStructureBand = 'broad' | 'balanced' | 'narrow'
/** Bounded market and emotion volatility proxy. */
export type VolatilityBand = 'low' | 'normal' | 'high'
/** Bounded top-sector crowding condition. */
export type CrowdingBand = 'low' | 'medium' | 'high'
/** Recent execution-quality condition supplied by deterministic execution evidence. */
export type ExecutionQualityBand = 'unknown' | 'weak' | 'normal' | 'strong'

/** Exact bounded context used to index comparable matured outcomes. */
export interface TacticRoutingContext {
  readonly contextVersion: typeof TACTIC_CONTEXT_VERSION
  readonly marketRegime: MarketRegime
  readonly emotionCycle: EmotionCycle
  readonly sectorStructure: SectorStructureBand
  readonly volatilityBand: VolatilityBand
  readonly crowdingBand: CrowdingBand
  readonly executionQualityBand: ExecutionQualityBand
}

/** Validated facts for one completed tactic observation before content addressing. */
export interface MaturedTacticOutcomeInput {
  readonly tacticId: Exclude<TacticId, 'defensive_no_trade'>
  readonly tacticVersion: string
  readonly decisionDate: string
  readonly maturityDate: string
  readonly availableAt: string
  readonly context: TacticRoutingContext
  readonly netReturn: number
  readonly doubledCostNetReturn: number
  readonly maximumDrawdown: number
  readonly fillRate: number
  readonly sourceHashes: readonly string[]
}

/** Completed result attributed to its original strategic facts and current catalog version. */
export interface MaturedTacticAttributionInput {
  readonly tacticId: Exclude<TacticId, 'defensive_no_trade'>
  readonly decisionFeatures: StrategicFeatureRecord
  readonly executionQualityBand: ExecutionQualityBand
  readonly maturityDate: string
  readonly availableAt: string
  readonly netReturn: number
  readonly doubledCostNetReturn: number
  readonly maximumDrawdown: number
  readonly fillRate: number
  readonly sourceHashes: readonly string[]
}

/** Immutable content-addressed result that may enter a scorecard at `availableAt`. */
export interface MaturedTacticOutcome extends MaturedTacticOutcomeInput {
  readonly schemaVersion: typeof TACTIC_OUTCOME_SCHEMA_VERSION
  readonly outcomeId: string
}

/** Incremental sufficient statistics for one exact tactic-version and context cell. */
export interface TacticScorecardCell {
  readonly tacticId: Exclude<TacticId, 'defensive_no_trade'>
  readonly tacticVersion: string
  readonly context: TacticRoutingContext
  readonly sampleCount: number
  readonly netReturnSum: number
  readonly netReturnSquaredSum: number
  readonly positiveCount: number
  readonly positiveReturnSum: number
  readonly negativeReturnAbsSum: number
  readonly maximumDrawdown: number
  readonly fillRateSum: number
  readonly doubledCostReturnSum: number
  readonly recentEffectiveness: number
  readonly lastAvailableAt: string
}

/** Derived metrics exposed to the router without rescanning outcomes. */
export interface TacticConditionalMetrics {
  readonly sampleCount: number
  readonly netExpectancy: number
  readonly expectancyLowerBound: number
  readonly winRate: number
  readonly payoffRatio: number | null
  readonly maximumDrawdown: number
  readonly fillRate: number
  readonly doubledCostExpectancy: number
  readonly recentEffectiveness: number
  readonly lastAvailableAt: string
}

/** One immutable aggregate generation derived only from newly available outcomes. */
export interface TacticScorecardRecord {
  readonly schemaVersion: typeof TACTIC_SCORECARD_SCHEMA_VERSION
  readonly scorecardId: string
  readonly previousScorecardId: string | null
  readonly cutoffTime: string
  readonly appliedOutcomeIds: readonly string[]
  readonly cells: readonly TacticScorecardCell[]
}

/** Explicit reasons that remove an active tactic from the routed slate. */
export type TacticRouteRejectionReason =
  | 'context_ineligible'
  | 'catalog_version_mismatch'
  | 'missing_conditional_record'
  | 'insufficient_matured_sample'
  | 'nonpositive_expectancy_lower_bound'
  | 'nonpositive_doubled_cost_expectancy'
  | 'fill_rate_below_half'
  | 'nonpositive_route_score'
  | 'outside_top_three'

/** Fixed score decomposition for one qualified active tactic. */
export interface TacticRouteScoreComponents {
  readonly stateFit: number
  readonly conditionalExpectancy: number
  readonly contextAlignment: number
  readonly recentEffectiveness: number
  readonly executionAndCost: number
  readonly drawdownPenalty: number
  readonly crowdingPenalty: number
  readonly transitionPenalty: number
  readonly uncertaintyPenalty: number
}

/** One active or defensive route candidate in deterministic order. */
export interface TacticRouteCandidate {
  readonly tacticId: TacticId
  readonly tacticVersion: string
  readonly promotionStatus: TacticPromotionStatus
  readonly eligibilityStatus: TacticEligibilityStatus
  readonly scope: 'research' | 'watch' | 'paper' | 'defense'
  readonly routeScore: number
  readonly scoreComponents: TacticRouteScoreComponents
  readonly metrics: TacticConditionalMetrics | null
  readonly maximumPaperPositionPct: number
  readonly evidenceRefs: readonly string[]
}

/** Active tactic excluded before or after deterministic ranking. */
export interface RejectedTacticRoute {
  readonly tacticId: Exclude<TacticId, 'defensive_no_trade'>
  readonly tacticVersion: string
  readonly reasons: readonly TacticRouteRejectionReason[]
  readonly routeScore: number | null
}

/** Replayable deterministic top-three tactic slate for one strategic cutoff. */
export interface TacticRoutingRecord {
  readonly routerVersion: typeof TACTIC_ROUTER_VERSION
  readonly routeId: string
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly currentSnapshotHash: string
  readonly eligibilityEngineVersion: string
  readonly scorecardId: string
  readonly context: TacticRoutingContext
  readonly slate: readonly TacticRouteCandidate[]
  readonly defensiveFallback: TacticRouteCandidate
  readonly rejected: readonly RejectedTacticRoute[]
  readonly cashFloorPct: number
}

/** Model proposal constrained to one exact deterministic route. */
export interface TacticCommanderProposalInput {
  readonly routeId: string
  readonly primaryTacticId: TacticId
  readonly secondaryTacticId: TacticId | null
  readonly thesis: string
  readonly evidenceRefs: readonly string[]
  readonly counterEvidenceRefs: readonly string[]
  readonly confidence: number
  readonly invalidationConditions: readonly string[]
}

/** Independent review of the exact route and proposal. */
export interface TacticCommanderRiskInput {
  readonly routeId: string
  readonly approved: boolean
  readonly verdict: 'approve' | 'veto'
  readonly reasons: readonly string[]
  readonly hardLimits: readonly string[]
  readonly invalidationConditions: readonly string[]
}

/** Host-derived scope that a model cannot promote through prose. */
export type TacticCommanderScope = 'defense' | 'research' | 'watch' | 'paper'

/** Replayable P2 decision after route membership, promotion, and veto validation. */
export interface TacticCommanderDecisionRecord {
  readonly schemaVersion: typeof TACTIC_COMMANDER_SCHEMA_VERSION
  readonly policyVersion: typeof TACTIC_COMMANDER_POLICY_VERSION
  readonly decisionId: string
  readonly routeId: string
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly status: 'approved' | 'vetoed'
  readonly scope: TacticCommanderScope
  readonly proposal: TacticCommanderProposalInput
  readonly risk: TacticCommanderRiskInput
  readonly finalPrimaryTacticId: TacticId
  readonly finalSecondaryTacticId: TacticId | null
  readonly maximumPaperPositionPct: number
  readonly cashFloorPct: number
}
