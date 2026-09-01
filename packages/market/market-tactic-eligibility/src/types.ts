import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'

/** Current deterministic tactic eligibility schema. */
export const TACTIC_ELIGIBILITY_SCHEMA_VERSION = 1 as const
/** Current registry and gate implementation identity. */
export const TACTIC_ELIGIBILITY_ENGINE_VERSION = 'maoq-tactic-eligibility-v1' as const

/** Stable IDs for the initial P3 tactic registry. */
export type TacticId =
  | 'regime_signed_breakout_pullback'
  | 'openable_emotion_leader'
  | 'industry_relative_exhaustion_repair'
  | 'defensive_no_trade'

/** Source-controlled promotion stage, independent of current market fit. */
export type TacticPromotionStatus = 'research' | 'paper' | 'eligible'
/** Current deterministic eligibility outcome after promotion and context gates. */
export type TacticEligibilityStatus = 'eligible' | 'watch_only' | 'research_only' | 'ineligible'

/** Host-owned static tactic definition; model prose cannot modify these constraints. */
export interface TacticDefinition {
  readonly tacticId: TacticId
  readonly family: 'trend' | 'emotion' | 'reversal' | 'defense'
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
  readonly passed: boolean
  readonly actual: string
  readonly expected: string
  readonly evidenceRefs: readonly string[]
}

/** Context fit and promotion status kept separate so research cannot become tradable by accident. */
export interface TacticEligibilityResult {
  readonly tacticId: TacticId
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
