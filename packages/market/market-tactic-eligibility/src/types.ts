import type {
  EmotionCycle,
  MarketRegime,
  StrategicFeatureRecord,
} from '@deepseek-ai/dsh-market-strategic-state'

/** Current deterministic tactic eligibility schema. */
export const TACTIC_ELIGIBILITY_SCHEMA_VERSION = 2 as const
/** Current registry and gate implementation identity. */
export const TACTIC_ELIGIBILITY_ENGINE_VERSION = 'maoq-tactic-eligibility-v4' as const

/** Stable IDs for every implemented tactic and the defensive fallback. */
export type TacticId =
  | 'regime_signed_breakout_pullback'
  | 'platform_consolidation_second_advance'
  | 'ah52_resistance_path'
  | 'openable_emotion_leader'
  | 'first_divergence_core_repair'
  | 'first_limit_delayed_price_discovery'
  | 'industry_relative_exhaustion_repair'
  | 'correlation_cluster_sector_rotation'
  | 'sector_residual_strength'
  | 'low_volatility_sector_leader'
  | 'defensive_no_trade'

/** Implemented stock-selection tactic IDs, excluding the no-order fallback. */
export type ActiveTacticId = Exclude<TacticId, 'defensive_no_trade'>

/** Source-controlled promotion stage, independent of current market fit. */
export type TacticPromotionStatus = 'research' | 'paper' | 'eligible'
/** Current deterministic eligibility outcome after promotion and context gates. */
export type TacticEligibilityStatus = 'eligible' | 'watch_only' | 'research_only' | 'ineligible'
/** Whether a failed gate blocks execution or only lowers preferred-state fit. */
export type TacticGateKind = 'hard' | 'state_fit'
/** Catalog-owned tactic family used to audit market-regime coverage. */
export type TacticFamily = 'trend' | 'emotion' | 'reversal' | 'rotation' | 'relative_strength' | 'low_volatility' | 'defense'

/** Host-owned static tactic definition; model prose cannot modify these constraints. */
export interface TacticDefinition {
  readonly tacticId: TacticId
  readonly tacticVersion: string
  readonly family: TacticFamily
  readonly eligibleMarketRegimes: readonly MarketRegime[]
  readonly eligibleEmotionCycles: readonly EmotionCycle[]
  readonly promotionStatus: TacticPromotionStatus
  readonly evidenceGrade: 'A' | 'B' | 'control'
  readonly requiredHistorySessions: number
  readonly maximumHoldingSessions: number
  readonly maximumPaperPositionPct: number
  readonly entryPolicy: readonly string[]
  readonly exitPolicy: readonly string[]
  readonly invalidationPolicy: readonly string[]
  readonly executionRequirements: readonly string[]
}

/** One deterministic, auditable gate evaluated from P2 strategic facts. */
export interface TacticGateResult {
  readonly gateId: string
  readonly kind: TacticGateKind
  readonly passed: boolean
  readonly actual: string
  readonly expected: string
  readonly evidenceRefs: readonly string[]
}

/** Context fit and promotion status kept separate so research cannot become tradable by accident. */
export interface TacticEligibilityResult {
  readonly tacticId: TacticId
  readonly tacticVersion: string
  readonly promotionStatus: TacticPromotionStatus
  readonly status: TacticEligibilityStatus
  readonly contextFit: boolean
  readonly eligibleSectorIds: readonly string[]
  readonly reasonCodes: readonly string[]
  readonly gates: readonly TacticGateResult[]
  readonly evidenceRefs: readonly string[]
}

/** Replay-stable P3 output consumed before any P4 stock ranking. */
export interface TacticEligibilityRecord {
  readonly schemaVersion: typeof TACTIC_ELIGIBILITY_SCHEMA_VERSION
  readonly engineVersion: typeof TACTIC_ELIGIBILITY_ENGINE_VERSION
  readonly strategicEngineVersion: StrategicFeatureRecord['engineVersion']
  readonly currentSnapshotHash: string
  readonly tradingDate: string
  readonly tactics: readonly TacticEligibilityResult[]
  readonly eligibleTacticIds: readonly TacticId[]
  readonly researchCandidateIds: readonly TacticId[]
}
