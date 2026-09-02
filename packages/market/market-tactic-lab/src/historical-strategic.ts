import {
  buildMarketSnapshot,
  contentHash,
  type MarketProvenance,
  type MarketSnapshot,
} from '@deepseek-ai/dsh-market-snapshot'
import {
  computeStrategicFeatures,
  STRATEGIC_ENGINE_VERSION,
  type StrategicFeatureRecord,
} from '@deepseek-ai/dsh-market-strategic-state'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import type {
  DailyExecutionSession,
  DailyHistoryFeatureRecord,
  DailyHistorySnapshot,
} from './types.ts'

/** Current facts-to-strategic-state reconstruction used only by historical research. */
export const HISTORICAL_STRATEGIC_PROXY_VERSION = 'maoq-historical-strategic-proxy-v1' as const

function rounded(value: number): number {
  return Number(value.toFixed(12))
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function cutoffTime(tradingDate: string): string {
  return `${tradingDate}T19:00:00+08:00`
}

function provenance(
  tradingDate: string,
  dataset: string,
  sourceHash: string,
  recordId: string,
  transforms: readonly string[],
): MarketProvenance {
  return {
    source: {
      adapter: 'maoq-historical-replay',
      dataset,
      version: `${HISTORICAL_STRATEGIC_PROXY_VERSION}:${sourceHash}`,
      retrievedAt: cutoffTime(tradingDate),
      recordId,
    },
    transforms,
  }
}

function brokenLimitCount(session: DailyExecutionSession): number {
  return session.bars.filter(bar => bar.high >= bar.upLimit && bar.close < bar.upLimit).length
}

function proxySnapshot(
  snapshot: DailyHistorySnapshot,
  execution: DailyExecutionSession,
  features: DailyHistoryFeatureRecord,
  previous: DailyHistoryFeatureRecord | undefined,
): MarketSnapshot {
  const date = features.tradingDate
  if (snapshot.identity.tradingDate !== date || execution.tradingDate !== date) {
    throw new Error('historical strategic proxy requires one exact trading date')
  }
  const priced = features.stocks.filter(stock => stock.adjustedReturn1 !== null)
  const advancing = priced.filter(stock => (stock.adjustedReturn1 as number) > 0).length
  const declining = priced.filter(stock => (stock.adjustedReturn1 as number) < 0).length
  const unchanged = priced.length - advancing - declining
  const meanReturn = ratio(
    priced.reduce((sum, stock) => sum + (stock.adjustedReturn1 as number), 0),
    priced.length,
  )
  const currentLimitUp = new Set(features.stocks
    .filter(stock => stock.limitStatus === 'limit-up')
    .map(stock => stock.symbol))
  const priorLimitUp = new Set((previous?.stocks ?? [])
    .filter(stock => stock.limitStatus === 'limit-up')
    .map(stock => stock.symbol))
  const broken = brokenLimitCount(execution)
  const boardCounts = new Map<number, number>()
  for (const stock of features.stocks) {
    if (stock.consecutiveLimitUpSessions < 1) continue
    boardCounts.set(
      stock.consecutiveLimitUpSessions,
      (boardCounts.get(stock.consecutiveLimitUpSessions) ?? 0) + 1,
    )
  }
  const sourceHashes = [snapshot.identity.contentHash, execution.contentHash]
  const stockProvenance = (symbol: string): MarketProvenance => provenance(
    date,
    'historical-daily-stock-proxy',
    snapshot.identity.contentHash,
    `${date}:${symbol}`,
    ['values=quality-gated-history-session', 'availability=research-reconstruction'],
  )
  const sectorProvenance = (sectorId: string): MarketProvenance => provenance(
    date,
    'historical-daily-sector-proxy',
    snapshot.identity.contentHash,
    `${date}:${sectorId}`,
    ['values=point-in-time-sector-history', 'availability=research-reconstruction'],
  )
  return buildMarketSnapshot({
    identity: {
      tradingDate: date,
      cutoffTime: cutoffTime(date),
      calendarVersion: 'historical-quality-gated-sessions-v1',
      adjustmentVersion: 'historical-hfq-v1',
      sectorClassificationVersion: 'historical-sw-l1-v1',
      sourceVersions: [
        `proxy:${HISTORICAL_STRATEGIC_PROXY_VERSION}`,
        `feature:${snapshot.identity.contentHash}`,
        `execution:${execution.contentHash}`,
      ],
    },
    stocks: snapshot.stocks.map(stock => ({ ...stock, provenance: stockProvenance(stock.symbol) })),
    sectors: snapshot.sectors.map(sector => ({ ...sector, provenance: sectorProvenance(sector.sectorId) })),
    breadth: {
      majorIndices: [{
        symbol: 'historical-equal-weight-market',
        close: rounded(100 * (1 + meanReturn)),
        changePct: rounded(meanReturn),
      }],
      totalAmount: snapshot.stocks.reduce((sum, stock) => sum + stock.amount, 0),
      advancing,
      declining,
      unchanged,
      limitUp: currentLimitUp.size,
      limitDown: features.stocks.filter(stock => stock.limitStatus === 'limit-down').length,
      brokenLimit: broken,
      provenance: provenance(date, 'historical-market-breadth-proxy', sourceHashes.join('+'), date, [
        'breadth=adjusted-close-return',
        'market-return=equal-weight-stock-return-proxy',
        'broken-limit=raw-high>=up-limit-and-close<up-limit',
      ]),
    },
    emotion: {
      consecutiveBoardCounts: [...boardCounts]
        .map(([boards, count]) => ({ boards, count }))
        .sort((left, right) => left.boards - right.boards),
      promotionRate: ratio([...priorLimitUp].filter(symbol => currentLimitUp.has(symbol)).length, priorLimitUp.size),
      brokenLimitRate: ratio(broken, broken + currentLimitUp.size),
      lossEffectRate: ratio(
        priced.filter(stock => (stock.adjustedReturn1 as number) <= -0.05).length,
        priced.length,
      ),
      provenance: provenance(date, 'historical-emotion-proxy', sourceHashes.join('+'), date, [
        'boards=consecutive-closed-limit-up-sessions',
        'promotion=prior-limit-up-and-current-limit-up/prior-limit-up',
        'loss-effect=adjusted-return<=-5-percent',
        'news-catalyst=unavailable',
      ]),
    },
    news: [],
  })
}

/** Incremental research-only reconstruction of canonical strategic features. */
export class HistoricalStrategicFeatureStream {
  private readonly snapshots: MarketSnapshot[] = []
  private previousFeatures: DailyHistoryFeatureRecord | undefined

  /**
   * Add one ascending history session and derive canonical strategic features without future facts.
   * @param snapshot - Point-in-time stock and sector history for the decision date.
   * @param execution - Same-date raw prices and limits used to reconstruct broken-limit facts.
   * @param features - Same-date incremental tactic-lab measurements.
   * @returns Strategic features over the current and at most two prior reconstructed sessions.
   */
  push(
    snapshot: DailyHistorySnapshot,
    execution: DailyExecutionSession,
    features: DailyHistoryFeatureRecord,
  ): StrategicFeatureRecord {
    if (snapshot.sectors.length === 0) {
      this.snapshots.length = 0
      this.previousFeatures = features
      const currentSnapshotHash = contentHash({
        proxyVersion: HISTORICAL_STRATEGIC_PROXY_VERSION,
        featureSnapshotHash: snapshot.identity.contentHash,
        executionSessionHash: execution.contentHash,
      })
      return deepFreeze({
        schemaVersion: 1,
        engineVersion: STRATEGIC_ENGINE_VERSION,
        inputSnapshotHashes: [snapshot.identity.contentHash, execution.contentHash],
        currentSnapshotHash,
        tradingDate: features.tradingDate,
        cutoffTime: cutoffTime(features.tradingDate),
        evidence: [],
        marketRegime: {
          status: 'unavailable',
          reasonCodes: ['HISTORICAL_STRATEGIC_PROXY_INCOMPLETE'],
          evidenceRefs: [],
        },
        emotionCycle: {
          status: 'unavailable',
          reasonCodes: ['HISTORICAL_STRATEGIC_PROXY_INCOMPLETE'],
          evidenceRefs: [],
        },
        sectorBattlefields: {
          status: 'unavailable',
          reasonCodes: ['HISTORICAL_SECTOR_FACTS_UNAVAILABLE'],
          evidenceRefs: [],
        },
        eligibleForInterpretation: false,
      })
    }
    const current = proxySnapshot(snapshot, execution, features, this.previousFeatures)
    const result = computeStrategicFeatures(current, this.snapshots)
    this.snapshots.push(current)
    if (this.snapshots.length > 2) this.snapshots.shift()
    this.previousFeatures = features
    return result
  }
}
