import type { MarketSnapshot, StockDailyBar } from '@deepseek-ai/dsh-market-snapshot'

/** Current daily-history feature schema. */
export const TACTIC_LAB_FEATURE_SCHEMA_VERSION = 1 as const
/** Current feature implementation identity. */
export const TACTIC_LAB_FEATURE_ENGINE_VERSION = 'maoq-daily-history-v1' as const
/** Current execution result schema. */
export const TACTIC_LAB_EXECUTION_SCHEMA_VERSION = 1 as const
/** Current execution implementation identity. */
export const TACTIC_LAB_EXECUTION_ENGINE_VERSION = 'maoq-a-share-next-open-v1' as const
/** Current content-addressed history-chunk schema. */
export const TACTIC_LAB_HISTORY_CHUNK_SCHEMA_VERSION = 1 as const

/** Deterministic daily measurements for one stock at one immutable cutoff. */
export interface DailyStockResearchFeatures {
  readonly symbol: string
  readonly tradingDate: string
  readonly historySessions: number
  readonly sectorId: string | null
  readonly adjustedReturn1: number | null
  readonly adjustedReturn5: number | null
  readonly adjustedReturn20: number | null
  readonly adjustedReturn60: number | null
  readonly distanceFromHigh20: number | null
  readonly distanceFromHigh252: number | null
  readonly sectorRelativeReturn5: number | null
  readonly sectorRelativeReturn20: number | null
  readonly turnoverMean5: number | null
  readonly turnoverMean20: number | null
  readonly turnover5To20Ratio: number | null
  readonly amountMean20: number | null
  readonly consecutiveLimitUpSessions: number
  readonly limitUpSessions20: number
  readonly tradingStatus: StockDailyBar['tradingStatus']
  readonly limitStatus: StockDailyBar['limitStatus']
  readonly listingDays: number
  readonly evidenceRefs: readonly string[]
}

/** Replay-stable feature universe for the newest supplied immutable snapshot. */
export interface DailyHistoryFeatureRecord {
  readonly schemaVersion: typeof TACTIC_LAB_FEATURE_SCHEMA_VERSION
  readonly engineVersion: typeof TACTIC_LAB_FEATURE_ENGINE_VERSION
  readonly currentSnapshotHash: string
  readonly inputSnapshotHashes: readonly string[]
  readonly tradingDate: string
  readonly sessions: number
  readonly stocks: readonly DailyStockResearchFeatures[]
}

/** Explicit next-session order authored after one daily close. */
export interface DailyExecutionOrder {
  readonly orderId: string
  readonly symbol: string
  readonly signalDate: string
  readonly side: 'buy' | 'sell'
  readonly quantity: number
}

/** Raw unadjusted daily bar and exact price limits used only for executable paper fills. */
export interface DailyExecutionBar {
  readonly symbol: string
  readonly tradingDate: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly upLimit: number
  readonly downLimit: number
  readonly tradingStatus: StockDailyBar['tradingStatus']
}

/** One market session of raw execution facts. */
export interface DailyExecutionSession {
  readonly tradingDate: string
  readonly contentHash: string
  readonly bars: readonly DailyExecutionBar[]
}

/** Predeclared A-share execution and cost policy. */
export interface DailyExecutionPolicy {
  readonly initialCash: number
  readonly lotSize: number
  readonly commissionBps: number
  readonly minimumCommission: number
  readonly stampDutySellBps: number
  readonly transferFeeBps: number
  readonly slippageBps: number
}

/** Stable reason why one submitted next-session order did not fill. */
export type DailyExecutionRejectionReason =
  | 'duplicate_order_id'
  | 'invalid_order'
  | 'unknown_signal_session'
  | 'no_next_session'
  | 'missing_bar'
  | 'not_trading'
  | 'open_limit_up'
  | 'open_limit_down'
  | 'insufficient_cash'
  | 'insufficient_position'
  | 't_plus_one'

/** One deterministic next-open fill including explicit costs. */
export interface DailyExecutionFill {
  readonly orderId: string
  readonly symbol: string
  readonly side: DailyExecutionOrder['side']
  readonly signalDate: string
  readonly fillDate: string
  readonly quantity: number
  readonly price: number
  readonly notional: number
  readonly commission: number
  readonly stampDuty: number
  readonly transferFee: number
  readonly totalFees: number
  readonly cashAfter: number
}

/** Auditable rejected order. */
export interface DailyExecutionRejection {
  readonly orderId: string
  readonly symbol: string
  readonly signalDate: string
  readonly reason: DailyExecutionRejectionReason
}

/** Final marked position after replaying every submitted order. */
export interface DailyExecutionPosition {
  readonly symbol: string
  readonly quantity: number
  readonly marketValue: number
}

/** Deterministic execution replay result. */
export interface DailyExecutionResult {
  readonly schemaVersion: typeof TACTIC_LAB_EXECUTION_SCHEMA_VERSION
  readonly engineVersion: typeof TACTIC_LAB_EXECUTION_ENGINE_VERSION
  readonly policy: DailyExecutionPolicy
  readonly sessionDates: readonly string[]
  readonly inputSessionHashes: readonly string[]
  readonly fills: readonly DailyExecutionFill[]
  readonly rejections: readonly DailyExecutionRejection[]
  readonly finalCash: number
  readonly positions: readonly DailyExecutionPosition[]
  readonly finalEquity: number
}

/** Immutable snapshot input accepted by the feature engine. */
export type DailyHistorySnapshot = Pick<MarketSnapshot, 'identity' | 'stocks' | 'sectors'>

/** Bounded provider-neutral request for complete daily research sessions. */
export interface TacticLabHistoryRequest {
  readonly startDate: string
  readonly endDate: string
  readonly chunkSessions: number
  readonly minimumStocks: number
}

/** Unhashed complete session chunk returned by one history adapter. */
export interface TacticLabHistoryChunkDraft {
  readonly adapterVersion: string
  readonly sourceVersions: readonly string[]
  readonly featureSessions: readonly DailyHistorySnapshot[]
  readonly executionSessions: readonly DailyExecutionSession[]
}

/** Immutable, content-addressed history chunk used by streaming evaluators. */
export interface TacticLabHistoryChunk extends TacticLabHistoryChunkDraft {
  readonly schemaVersion: typeof TACTIC_LAB_HISTORY_CHUNK_SCHEMA_VERSION
  readonly startDate: string
  readonly endDate: string
  readonly contentHash: string
}

/** Streaming history source; callers never need the full multi-year universe in memory. */
export interface TacticLabHistoryAdapter {
  readonly name: string
  load(request: TacticLabHistoryRequest): AsyncIterable<TacticLabHistoryChunk>
}
