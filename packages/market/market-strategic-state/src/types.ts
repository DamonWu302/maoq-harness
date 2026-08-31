/** Stable contracts for deterministic MAOQ strategic-state analysis. */

/** Current deterministic strategic feature schema. */
export const STRATEGIC_FEATURE_SCHEMA_VERSION = 1 as const

/** Current deterministic calculator version. Threshold changes require a new version. */
export const STRATEGIC_ENGINE_VERSION = 'maoq-strategic-v1' as const

/** Market-wide strategic condition inferred only from normalized observations. */
export type MarketRegime = 'risk_on_trend' | 'rotation' | 'high_volatility_divergence' | 'risk_contraction' | 'repair'

/** Short-line sentiment phase inferred only from normalized observations. */
export type EmotionCycle = 'startup' | 'acceleration' | 'climax' | 'divergence' | 'ebb' | 'repair'

/** A concrete field copied from an immutable snapshot and addressable by later interpretation. */
export interface StrategicEvidence {
  readonly ref: string
  readonly snapshotHash: string
  readonly path: string
  readonly value: string | number | boolean | null
}

/** Independently unavailable deterministic component. */
export interface UnavailableStrategicComponent {
  readonly status: 'unavailable'
  readonly reasonCodes: readonly string[]
  readonly evidenceRefs: readonly string[]
}

/** Independently ready deterministic component. */
export interface ReadyStrategicComponent<T> {
  readonly status: 'ready'
  readonly value: T
  readonly evidenceRefs: readonly string[]
}

/** A component that cannot silently substitute missing facts. */
export type StrategicComponent<T> = ReadyStrategicComponent<T> | UnavailableStrategicComponent

/** Deterministic market-wide state and its directly computed metrics. */
export interface MarketRegimeFeature {
  readonly label: MarketRegime
  readonly advanceRatio: number
  readonly meanIndexChangePct: number
  readonly limitBalance: number
  readonly brokenLimitPressure: number
  readonly lossEffectRate: number
}

/** Deterministic short-line cycle and its directly computed metrics. */
export interface EmotionCycleFeature {
  readonly label: EmotionCycle
  readonly boardHeight: number
  readonly promotionRate: number
  readonly brokenLimitRate: number
  readonly lossEffectRate: number
  readonly advanceRatio: number
}

/** Deterministic dimensions used to compare sector battlefields without ranking stocks. */
export interface SectorBattlefieldFeature {
  readonly sectorId: string
  readonly name: string
  readonly strength: number
  readonly persistence: number
  readonly capacity: number
  readonly catalystSupport: number
  readonly internalBreadth: number
  readonly leaderQuality: number
  readonly crowding: number
  readonly resistance: number
  readonly compositeScore: number
  readonly evidenceRefs: readonly string[]
}

/** Deterministic feature record for one current snapshot and its explicit history. */
export interface StrategicFeatureRecord {
  readonly schemaVersion: typeof STRATEGIC_FEATURE_SCHEMA_VERSION
  readonly engineVersion: typeof STRATEGIC_ENGINE_VERSION
  readonly inputSnapshotHashes: readonly string[]
  readonly currentSnapshotHash: string
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly evidence: readonly StrategicEvidence[]
  readonly marketRegime: StrategicComponent<MarketRegimeFeature>
  readonly emotionCycle: StrategicComponent<EmotionCycleFeature>
  readonly sectorBattlefields: StrategicComponent<readonly SectorBattlefieldFeature[]>
  readonly eligibleForInterpretation: boolean
}

/** Strategic posture that remains analysis or paper scope and never authorizes an order. */
export type StrategicPosture = 'no_trade' | 'risk_off' | 'watch' | 'probe' | 'paper_position'

/** Maoist method identifier chosen from the host-owned attribution catalog. */
export type MaoMethodId =
  | 'investigation_before_conclusion'
  | 'seek_truth_from_facts'
  | 'principal_contradiction'
  | 'concrete_analysis'
  | 'practice_test'
  | 'concentrate_advantage'
  | 'initiative_flexibility_planning'

/** Model-authored application of one allowlisted method to cited market evidence. */
export interface MaoMethodApplication {
  readonly methodId: MaoMethodId
  readonly application: string
  readonly evidenceRefs: readonly string[]
  readonly limitation: string
}

/** Host-enriched Maoist method attribution; `principle` is a paraphrase, not a quotation. */
export interface ResolvedMaoMethodApplication extends MaoMethodApplication {
  readonly sourceTitle: string
  readonly sourceUrl: string
  readonly principle: string
  readonly attributionKind: 'paraphrase'
}

/** Model interpretation kept separate from deterministic feature computation. */
export interface StrategicInterpretationDraft {
  readonly principalContradiction: string
  readonly leastResistanceBattlefield: string
  readonly supportingEvidenceRefs: readonly string[]
  readonly counterEvidenceRefs: readonly string[]
  readonly transitionConditions: readonly string[]
  readonly confidence: number
  readonly eligiblePosture: StrategicPosture
  readonly maoMethodApplications: readonly MaoMethodApplication[]
}

/** Final replayable record after host validation and attribution enrichment. */
export interface StrategicStateRecord {
  readonly features: StrategicFeatureRecord
  readonly interpretation: Omit<StrategicInterpretationDraft, 'maoMethodApplications'> & {
    readonly maoMethodApplications: readonly ResolvedMaoMethodApplication[]
  }
  readonly actionable: boolean
}
