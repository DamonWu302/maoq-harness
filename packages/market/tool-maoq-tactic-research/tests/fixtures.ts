import type { MarketProvenance, SectorDailySnapshot, StockDailyBar } from '@deepseek-ai/dsh-market-snapshot'
import {
  buildTacticLabHistoryChunk,
  type DailyExecutionSession,
  type DailyHistorySnapshot,
  type TacticLabHistoryAdapter,
  type TacticLabHistoryChunk,
} from '@deepseek-ai/dsh-market-tactic-lab'

function dateAt(index: number): string {
  return new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
}

function provenance(date: string, symbol: string): MarketProvenance {
  return {
    source: {
      adapter: 'tactic-tool-fixture',
      dataset: 'daily',
      version: 'v1',
      retrievedAt: `${date}T19:15:00+08:00`,
      recordId: `${date}:${symbol}`,
    },
    transforms: [],
  }
}

function historySnapshot(index: number): DailyHistorySnapshot {
  const date = dateAt(index)
  const symbols = ['TARGET', ...Array.from({ length: 9 }, (_, item) => `H${String(item).padStart(2, '0')}`)]
  const stocks: StockDailyBar[] = symbols.map((symbol, item) => {
    const slope = item === 0 ? 0.006 : item <= 5 ? 0.003 : -0.002
    const close = 10 * (1 + slope * index)
    return {
      symbol,
      tradingDate: date,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1_000_000,
      amount: item === 0 ? 200_000_000 : 1,
      turnoverRate: 0.02,
      adjustmentFactor: 1,
      tradingStatus: 'trading',
      limitStatus: 'none',
      listingDays: 1_000,
      qualityFlags: [],
      provenance: provenance(date, symbol),
    }
  })
  const sector: SectorDailySnapshot = {
    sectorId: 'sector-a',
    name: 'sector-a',
    tradingDate: date,
    open: 100.1,
    high: 100.1,
    low: 100.1,
    close: 100.1,
    amount: 1_000_000_000,
    advancingRatio: 0.6,
    limitUpCount: 0,
    dispersion: 0.01,
    leaders: ['TARGET'],
    members: symbols.map(symbol => ({ symbol, effectiveFrom: '2020-01-01', effectiveTo: null })),
    provenance: provenance(date, 'sector-a'),
  }
  return {
    identity: {
      tradingDate: date,
      cutoffTime: `${date}T19:15:00+08:00`,
      calendarVersion: 'fixture-v1',
      adjustmentVersion: 'fixture-v1',
      sectorClassificationVersion: 'fixture-v1',
      sourceVersions: ['fixture-v1'],
      contentHash: (index + 500).toString(16).padStart(64, '0'),
    },
    stocks,
    sectors: [sector],
    benchmarks: [{
      benchmarkId: '000001.SH',
      name: 'SSE Composite',
      kind: 'market_index',
      tradingDate: date,
      dailyReturn: index === 0 ? 0 : 0.005,
      provenance: provenance(date, '000001.SH'),
    }],
  }
}

function historyExecution(index: number): DailyExecutionSession {
  const snapshot = historySnapshot(index)
  return {
    tradingDate: snapshot.identity.tradingDate,
    contentHash: (index + 800).toString(16).padStart(64, '0'),
    bars: snapshot.stocks.map(item => ({
      symbol: item.symbol,
      tradingDate: item.tradingDate,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      upLimit: item.close * 1.1,
      downLimit: item.close * 0.9,
      tradingStatus: item.tradingStatus,
    })),
  }
}

/** Build deterministic full-universe chunks for model-tool tests. */
export function fixtureHistoryChunks(count = 64): TacticLabHistoryChunk[] {
  const chunks: TacticLabHistoryChunk[] = []
  for (let offset = 0; offset < count; offset += 32) {
    const length = Math.min(32, count - offset)
    chunks.push(buildTacticLabHistoryChunk({
      adapterVersion: 'tactic-tool-fixture-v1',
      sourceVersions: ['fixture-v1'],
      featureSessions: Array.from({ length }, (_, item) => historySnapshot(offset + item)),
      executionSessions: Array.from({ length }, (_, item) => historyExecution(offset + item)),
    }))
  }
  return chunks
}

/** Create a registered history fixture whose request is observable. */
export function fixtureHistoryAdapter(
  chunks: readonly TacticLabHistoryChunk[] = fixtureHistoryChunks(),
  requests: unknown[] = [],
): TacticLabHistoryAdapter {
  return {
    name: 'fixture-history',
    async *load(request) {
      requests.push(request)
      yield* chunks
    },
  }
}
