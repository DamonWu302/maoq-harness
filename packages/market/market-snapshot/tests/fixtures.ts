import type {
  MarketProvenance,
  MarketSnapshotDraft,
  MarketSnapshotIdentityInput,
  StockDailyBar,
} from '../src/types.ts'

export const identity: MarketSnapshotIdentityInput = {
  tradingDate: '2026-08-28',
  cutoffTime: '2026-08-28T15:30:00+08:00',
  calendarVersion: 'sse-szse-2026.08',
  adjustmentVersion: 'qfq-2026-08-28',
  sectorClassificationVersion: 'maoq-sector-2026.08',
  sourceVersions: ['news-fixture-v1', 'sector-fixture-v1', 'daily-fixture-v1'],
}

export function provenance(dataset: string, recordId: string): MarketProvenance {
  return {
    source: {
      adapter: 'p1-offline-fixture',
      dataset,
      version: `${dataset}-v1`,
      retrievedAt: '2026-08-28T15:10:00+08:00',
      recordId,
    },
    transforms: ['vendor-fields-to-maoq-v1'],
  }
}

export function stock(overrides: Partial<StockDailyBar> = {}): StockDailyBar {
  return {
    symbol: '000001.SZ',
    tradingDate: identity.tradingDate,
    open: 10,
    high: 10.8,
    low: 9.9,
    close: 10.6,
    volume: 1_000_000,
    amount: 10_400_000,
    turnoverRate: 0.03,
    adjustmentFactor: 1.2,
    tradingStatus: 'trading',
    limitStatus: 'none',
    listingDays: 8_000,
    qualityFlags: [],
    provenance: provenance('daily', overrides.symbol ?? '000001.SZ'),
    ...overrides,
  }
}

export function normalDraft(): MarketSnapshotDraft {
  return {
    identity,
    stocks: [stock({ symbol: '600000.SH' }), stock()],
    sectors: [{
      sectorId: 'bank',
      name: '银行',
      tradingDate: identity.tradingDate,
      open: 100,
      high: 105,
      low: 99,
      close: 104,
      amount: 30_000_000_000,
      advancingRatio: 0.75,
      limitUpCount: 1,
      dispersion: 0.012,
      leaders: ['600000.SH', '000001.SZ'],
      members: [
        { symbol: '600000.SH', effectiveFrom: '2020-01-01', effectiveTo: null },
        { symbol: '000001.SZ', effectiveFrom: '2020-01-01', effectiveTo: null },
      ],
      provenance: provenance('sector', 'bank'),
    }],
    breadth: {
      majorIndices: [
        { symbol: '399001.SZ', close: 12_000, changePct: 0.01 },
        { symbol: '000001.SH', close: 3_500, changePct: 0.008 },
      ],
      totalAmount: 1_200_000_000_000,
      advancing: 3_200,
      declining: 1_500,
      unchanged: 200,
      limitUp: 72,
      limitDown: 8,
      brokenLimit: 24,
      provenance: provenance('breadth', identity.tradingDate),
    },
    emotion: {
      consecutiveBoardCounts: [{ boards: 3, count: 2 }, { boards: 2, count: 7 }],
      promotionRate: 0.48,
      brokenLimitRate: 0.25,
      lossEffectRate: 0.12,
      provenance: provenance('emotion', identity.tradingDate),
    },
    news: [{
      id: 'policy-before-cutoff',
      title: '行业政策公开发布',
      url: 'https://example.test/policy-before-cutoff',
      publisher: 'fixture authority',
      publishedAt: '2026-08-28T10:00:00+08:00',
      fetchedAt: '2026-08-28T10:01:00+08:00',
      eventAt: '2026-08-28T10:00:00+08:00',
      affectedSectors: ['bank'],
      confidence: 1,
      provenance: provenance('news', 'policy-before-cutoff'),
    }],
  }
}
