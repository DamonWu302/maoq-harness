/** Immutable point-in-time market snapshot data types. */

/** Current persisted snapshot schema version. */
export const MARKET_SNAPSHOT_SCHEMA_VERSION = 1 as const

/** Source lineage attached to every acquired market record. */
export interface MarketSource {
  readonly adapter: string
  readonly dataset: string
  readonly version: string
  readonly retrievedAt: string
  readonly recordId: string
}

/** A named deterministic transformation applied after acquisition. */
export interface MarketProvenance {
  readonly source: MarketSource
  readonly transforms: readonly string[]
}

/** One adjusted daily stock bar with explicit trading constraints. */
export interface StockDailyBar {
  readonly symbol: string
  readonly tradingDate: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
  readonly amount: number
  readonly turnoverRate: number
  readonly adjustmentFactor: number
  readonly tradingStatus: 'trading' | 'suspended' | 'delisting'
  readonly limitStatus: 'none' | 'limit-up' | 'limit-down'
  readonly listingDays: number
  readonly qualityFlags: readonly string[]
  readonly provenance: MarketProvenance
}

/** Point-in-time sector membership. */
export interface SectorMember {
  readonly symbol: string
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
}

/** Daily sector facts and membership effective at the snapshot date. */
export interface SectorDailySnapshot {
  readonly sectorId: string
  readonly name: string
  readonly tradingDate: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly amount: number
  readonly advancingRatio: number
  readonly limitUpCount: number
  readonly dispersion: number
  readonly leaders: readonly string[]
  readonly members: readonly SectorMember[]
  readonly provenance: MarketProvenance
}

/** Daily all-market facts used by later strategic-state engines. */
export interface MarketBreadth {
  readonly majorIndices: readonly {
    readonly symbol: string
    readonly close: number
    /** Close-to-previous-close return as a decimal ratio (`0.01` means 1%). */
    readonly changePct: number
  }[]
  readonly totalAmount: number
  readonly advancing: number
  readonly declining: number
  readonly unchanged: number
  readonly limitUp: number
  readonly limitDown: number
  readonly brokenLimit: number
  readonly provenance: MarketProvenance
}

/** Observable short-line emotion facts without a model interpretation. */
export interface EmotionFacts {
  readonly consecutiveBoardCounts: readonly {
    readonly boards: number
    readonly count: number
  }[]
  readonly promotionRate: number
  readonly brokenLimitRate: number
  readonly lossEffectRate: number
  readonly provenance: MarketProvenance
}

/** Policy or news evidence eligible at the decision cutoff. */
export interface NewsEvidence {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly publisher: string
  readonly publishedAt: string
  readonly fetchedAt: string
  readonly eventAt: string
  readonly affectedSectors: readonly string[]
  readonly confidence: number
  readonly provenance: MarketProvenance
}

/** Versions and cutoff that give one snapshot its point-in-time meaning. */
export interface MarketSnapshotIdentityInput {
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly calendarVersion: string
  readonly adjustmentVersion: string
  readonly sectorClassificationVersion: string
  readonly sourceVersions: readonly string[]
}

/** Persisted identity, including the SHA-256 of canonical snapshot content. */
export interface MarketSnapshotIdentity extends MarketSnapshotIdentityInput {
  readonly contentHash: string
}

/** Provider-neutral input returned by a market-data adapter. */
export interface MarketSnapshotDraft {
  readonly identity: MarketSnapshotIdentityInput
  readonly stocks: readonly StockDailyBar[]
  readonly sectors: readonly SectorDailySnapshot[]
  readonly breadth: MarketBreadth
  readonly emotion: EmotionFacts
  readonly news: readonly NewsEvidence[]
}

/** Immutable, validated and content-addressed daily market input. */
export interface MarketSnapshot {
  readonly schemaVersion: typeof MARKET_SNAPSHOT_SCHEMA_VERSION
  readonly identity: MarketSnapshotIdentity
  readonly quality: {
    readonly status: 'complete'
    readonly warnings: readonly string[]
  }
  readonly stocks: readonly StockDailyBar[]
  readonly sectors: readonly SectorDailySnapshot[]
  readonly breadth: MarketBreadth
  readonly emotion: EmotionFacts
  readonly news: readonly NewsEvidence[]
}

/** Bounded request for exact identities from the newest audited source sessions. */
export interface MarketSnapshotDiscoveryRequest {
  readonly beforeOrOn: string
  readonly cutoffTime: string
  readonly limit: number
}

/** Lightweight, exact reference returned by catalog and generation operations. */
export interface MarketSnapshotSummary {
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly contentHash: string
  readonly stocks: number
  readonly sectors: number
  readonly indices: number
  readonly news: number
  readonly warnings: readonly string[]
}

/** Adapter that converts one vendor or staged source into provider-neutral facts. */
export interface MarketSnapshotAdapter {
  readonly name: string
  load(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshotDraft>
  discoverRecent?(request: MarketSnapshotDiscoveryRequest): Promise<readonly MarketSnapshotIdentityInput[]>
}
