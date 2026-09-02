import type {
  MarketProvenance,
  SectorDailySnapshot,
  StockDailyBar,
} from '@deepseek-ai/dsh-market-snapshot'
import { describe, expect, it } from 'vitest'
import {
  buildTacticLabHistoryChunk,
  computeDailyHistoryFeatures,
  DailyHistoryFeatureStream,
  DEFAULT_A_SHARE_EXECUTION_POLICY,
  simulateNextOpenExecution,
  type DailyExecutionBar,
  type DailyExecutionSession,
  type DailyHistorySnapshot,
  verifyTacticLabHistoryChunk,
} from '../src/index.ts'

function dateAt(index: number): string {
  return new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10)
}

function provenance(date: string): MarketProvenance {
  return {
    source: {
      adapter: 'tactic-lab-fixture',
      dataset: 'daily',
      version: 'v1',
      retrievedAt: `${date}T19:00:00+08:00`,
      recordId: date,
    },
    transforms: [],
  }
}

function bar(
  date: string,
  overrides: Partial<StockDailyBar> = {},
): StockDailyBar {
  const close = overrides.close ?? 10
  return {
    symbol: '000001.SZ',
    tradingDate: date,
    open: overrides.open ?? close,
    high: overrides.high ?? close * 1.02,
    low: overrides.low ?? close * 0.98,
    close,
    volume: 1_000_000,
    amount: 10_000_000,
    turnoverRate: 0.02,
    adjustmentFactor: 1,
    tradingStatus: 'trading',
    limitStatus: 'none',
    listingDays: 1_000,
    qualityFlags: [],
    provenance: provenance(date),
    ...overrides,
  }
}

function sector(date: string, close: number, sectorId = 'bank'): SectorDailySnapshot {
  return {
    sectorId,
    name: sectorId,
    tradingDate: date,
    open: close,
    high: close,
    low: close,
    close,
    amount: 1_000_000_000,
    advancingRatio: 0.6,
    limitUpCount: 0,
    dispersion: 0.01,
    leaders: ['000001.SZ'],
    members: [{ symbol: '000001.SZ', effectiveFrom: '2020-01-01', effectiveTo: null }],
    provenance: provenance(date),
  }
}

function snapshot(
  index: number,
  stockOverrides: Partial<StockDailyBar> = {},
  sectorId = 'bank',
): DailyHistorySnapshot {
  const date = dateAt(index)
  const close = stockOverrides.close ?? 10 + index * 0.05
  return {
    identity: {
      tradingDate: date,
      cutoffTime: `${date}T19:15:00+08:00`,
      calendarVersion: 'fixture-v1',
      adjustmentVersion: 'fixture-v1',
      sectorClassificationVersion: 'fixture-v1',
      sourceVersions: ['fixture-v1'],
      contentHash: index.toString(16).padStart(64, '0'),
    },
    stocks: [bar(date, { close, ...stockOverrides })],
    sectors: [sector(date, 100.01, sectorId)],
    benchmarks: [{
      benchmarkId: '000001.SH',
      name: 'SSE Composite',
      kind: 'market_index',
      tradingDate: date,
      dailyReturn: index === 0 ? 0 : 0.005,
      provenance: provenance(date),
    }],
  }
}

function executionBar(index: number, overrides: Partial<DailyExecutionBar> = {}): DailyExecutionBar {
  const tradingDate = dateAt(index)
  const open = overrides.open ?? 10
  return {
    symbol: '000001.SZ',
    tradingDate,
    open,
    high: overrides.high ?? open * 1.02,
    low: overrides.low ?? open * 0.98,
    close: overrides.close ?? open,
    upLimit: 11,
    downLimit: 9,
    tradingStatus: 'trading',
    ...overrides,
  }
}

function executionSession(index: number, overrides: Partial<DailyExecutionBar> = {}): DailyExecutionSession {
  return {
    tradingDate: dateAt(index),
    contentHash: `e${index.toString(16)}`.padStart(64, '0'),
    bars: [executionBar(index, overrides)],
  }
}

describe('daily history research features', () => {
  it('matches batch semantics while incrementally replaying a rolling 252-session universe', () => {
    const snapshots = Array.from({ length: 253 }, (_, index) => snapshot(index, {
      limitStatus: index >= 250 ? 'limit-up' : 'none',
      turnoverRate: 0.01 + index / 100_000,
      amount: 10_000_000 + index * 10_000,
    }))
    const stream = new DailyHistoryFeatureStream()
    let streamed
    for (const item of snapshots) streamed = stream.push(item)
    expect(streamed).toEqual(computeDailyHistoryFeatures(snapshots))
    expect(Object.isFrozen(streamed)).toBe(true)
  })

  it('matches batch failure-closed windows after missing sessions and sector changes', () => {
    const snapshots = Array.from({ length: 22 }, (_, index) => snapshot(
      index,
      {},
      index < 10 ? 'old' : 'new',
    ))
    snapshots[15] = { ...snapshots[15]!, stocks: [] }
    const stream = new DailyHistoryFeatureStream()
    for (const item of snapshots) stream.push(item)
    expect(stream.push(snapshot(22, {}, 'new'))).toEqual(computeDailyHistoryFeatures([
      ...snapshots,
      snapshot(22, {}, 'new'),
    ]))
  })

  it('rejects invalid hashes, nonascending dates, duplicate stocks, and duplicate sector membership', () => {
    const invalidHash = new DailyHistoryFeatureStream()
    expect(() => invalidHash.push({
      ...snapshot(0),
      identity: { ...snapshot(0).identity, contentHash: 'invalid' },
    })).toThrow(/content hash is not SHA-256/)

    const dates = new DailyHistoryFeatureStream()
    dates.push(snapshot(0))
    expect(() => dates.push(snapshot(0))).toThrow(/is not later/)

    const duplicateStocks = new DailyHistoryFeatureStream()
    const stock = snapshot(0).stocks[0]!
    expect(() => duplicateStocks.push({ ...snapshot(0), stocks: [stock, stock] })).toThrow(/duplicate symbols/)

    const duplicateSectors = new DailyHistoryFeatureStream()
    const base = snapshot(0)
    expect(() => duplicateSectors.push({ ...base, sectors: [sector(dateAt(0), 100, 'one'), sector(dateAt(0), 100, 'two')] }))
      .toThrow(/multiple sectors/)
  })

  it('fails sector and return windows closed for unavailable, inactive, or nonpositive evidence', () => {
    const noSector = new DailyHistoryFeatureStream()
    const withoutSector = { ...snapshot(0), sectors: [] }
    expect(noSector.push(withoutSector).stocks[0]?.sectorRelativeReturn5).toBeNull()

    const datedMembership = new DailyHistoryFeatureStream()
    const dated = snapshot(0)
    const datedSector = {
      ...dated.sectors[0]!,
      members: [
        { symbol: 'wrong', effectiveFrom: '2020-01-01', effectiveTo: null },
        { symbol: '000001.SZ', effectiveFrom: '2099-01-01', effectiveTo: null },
        { symbol: '000001.SZ', effectiveFrom: '2020-01-01', effectiveTo: '2020-01-02' },
        { symbol: '000001.SZ', effectiveFrom: '2020-01-01', effectiveTo: '2099-01-01' },
      ],
    }
    expect(datedMembership.push({ ...dated, sectors: [datedSector] }).stocks[0]?.sectorId).toBe('bank')

    const nonpositive = new DailyHistoryFeatureStream()
    const nonpositiveSnapshots = Array.from({ length: 7 }, (_, index) => snapshot(index, {
      close: index === 0 || index === 6 ? 0 : 10,
      high: index === 0 || index === 6 ? 0 : 10,
    }))
    for (const item of nonpositiveSnapshots.slice(0, 6)) nonpositive.push(item)
    expect(nonpositive.push(nonpositiveSnapshots[6]!).stocks[0]?.adjustedReturn1).toBeNull()

    const missingSectorClose = new DailyHistoryFeatureStream()
    let result
    for (let index = 0; index < 6; index += 1) {
      const item = snapshot(index)
      result = missingSectorClose.push({
        ...item,
        sectors: [{ ...item.sectors[0]!, close: null as unknown as number }],
      })
    }
    expect(result?.stocks[0]?.sectorRelativeReturn5).toBeNull()
  })

  it('content-addresses paired feature and raw-execution chunks', () => {
    const chunk = buildTacticLabHistoryChunk({
      adapterVersion: 'fixture-v1',
      sourceVersions: ['price:v1', 'adjustment:v1'],
      featureSessions: [snapshot(0), snapshot(1)],
      executionSessions: [executionSession(0), executionSession(1)],
    })
    expect(chunk.startDate).toBe(dateAt(0))
    expect(chunk.endDate).toBe(dateAt(1))
    expect(chunk.contentHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(() => {
      verifyTacticLabHistoryChunk(chunk)
    }).not.toThrow()
    expect(() => {
      verifyTacticLabHistoryChunk({ ...chunk, contentHash: 'a'.repeat(64) })
    })
      .toThrow(/content hash mismatch/)
  })

  it('rejects malformed or unpaired history chunks', () => {
    const firstFeature = snapshot(0)
    const firstExecution = executionSession(0)
    const cases = [
      {
        draft: { adapterVersion: '', sourceVersions: [], featureSessions: [firstFeature], executionSessions: [firstExecution] },
        message: /adapterVersion must not be empty/,
      },
      {
        draft: { adapterVersion: 'fixture', sourceVersions: [], featureSessions: [], executionSessions: [] },
        message: /featureSessions must not be empty/,
      },
      {
        draft: { adapterVersion: 'fixture', sourceVersions: [], featureSessions: [firstFeature], executionSessions: [] },
        message: /session counts differ/,
      },
      {
        draft: {
          adapterVersion: 'fixture',
          sourceVersions: [],
          featureSessions: [undefined] as unknown as DailyHistorySnapshot[],
          executionSessions: [firstExecution],
        },
        message: /session pairing is incomplete/,
      },
      {
        draft: {
          adapterVersion: 'fixture',
          sourceVersions: [],
          featureSessions: [firstFeature],
          executionSessions: [executionSession(1)],
        },
        message: /feature and execution dates differ/,
      },
      {
        draft: {
          adapterVersion: 'fixture',
          sourceVersions: [],
          featureSessions: [snapshot(1), snapshot(0)],
          executionSessions: [executionSession(1), executionSession(0)],
        },
        message: /not strictly ascending/,
      },
      {
        draft: {
          adapterVersion: 'fixture',
          sourceVersions: [],
          featureSessions: [{ ...firstFeature, identity: { ...firstFeature.identity, contentHash: 'invalid' } }],
          executionSessions: [firstExecution],
        },
        message: /invalid session hash/,
      },
      {
        draft: {
          adapterVersion: 'fixture',
          sourceVersions: [],
          featureSessions: [firstFeature],
          executionSessions: [{ ...firstExecution, contentHash: 'invalid' }],
        },
        message: /invalid session hash/,
      },
    ] as const
    for (const testCase of cases) {
      expect(() => {
        buildTacticLabHistoryChunk(testCase.draft)
      }).toThrow(testCase.message)
    }
  })

  it('computes adjusted, sector-relative, liquidity, high-distance, and emotion measurements', () => {
    const snapshots = Array.from({ length: 252 }, (_, index) => snapshot(index, {
      limitStatus: index >= 249 ? 'limit-up' : 'none',
      turnoverRate: 0.01 + index / 100_000,
      amount: 10_000_000 + index * 10_000,
    }))
    const result = computeDailyHistoryFeatures(snapshots)
    const stock = result.stocks[0]
    expect(stock?.historySessions).toBe(252)
    expect(stock?.adjustedReturn20).toBeGreaterThan(0)
    expect(stock?.sectorRelativeReturn20).toBeGreaterThan(0)
    expect(stock?.distanceFromHigh252).toBeLessThanOrEqual(0)
    expect(stock?.turnover5To20Ratio).toBeGreaterThan(1)
    expect(stock?.consecutiveLimitUpSessions).toBe(3)
    expect(stock?.limitUpSessions20).toBe(3)
    expect(result.currentSnapshotHash).toBe('fb'.padStart(64, '0'))
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('honors already-adjusted snapshot prices and fails affected windows closed on missing sessions', () => {
    const adjusted = [
      snapshot(0, { close: 10, adjustmentFactor: 1 }),
      snapshot(1, { close: 10, adjustmentFactor: 2 }),
    ]
    expect(computeDailyHistoryFeatures(adjusted).stocks[0]?.adjustedReturn1).toBe(0)

    const missing = Array.from({ length: 21 }, (_, index) => snapshot(index))
    missing[15] = { ...missing[15]!, stocks: [] }
    const stock = computeDailyHistoryFeatures(missing).stocks[0]
    expect(stock?.adjustedReturn5).toBeNull()
    expect(stock?.turnoverMean20).toBeNull()
    expect(stock?.historySessions).toBe(5)
  })

  it('refuses sector-relative history across a classification change', () => {
    const snapshots = Array.from({ length: 21 }, (_, index) => snapshot(index, {}, index < 10 ? 'old' : 'new'))
    const stock = computeDailyHistoryFeatures(snapshots).stocks[0]
    expect(stock?.sectorId).toBe('new')
    expect(stock?.sectorRelativeReturn5).not.toBeNull()
    expect(stock?.sectorRelativeReturn20).toBeNull()
  })
})

describe('A-share next-open execution', () => {
  it('fills only on the next session, charges both-side costs, and marks final equity', () => {
    const sessions = [
      executionSession(0, { open: 10, high: 10.2, low: 9.8, close: 10 }),
      executionSession(1, { open: 10, high: 10.2, low: 9.8, close: 10.1 }),
      executionSession(2, { open: 10.8, high: 11.2, low: 10.7, close: 11.1, upLimit: 12 }),
    ]
    const result = simulateNextOpenExecution(sessions, [
      { orderId: 'buy', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 1_000 },
      { orderId: 'sell', symbol: '000001.SZ', signalDate: dateAt(1), side: 'sell', quantity: 1_000 },
    ])
    expect(result.fills.map(fill => [fill.orderId, fill.fillDate])).toEqual([
      ['buy', dateAt(1)],
      ['sell', dateAt(2)],
    ])
    expect(result.fills[0]?.price).toBe(10.005)
    expect(result.fills[1]?.stampDuty).toBeGreaterThan(0)
    expect(result.positions).toEqual([])
    expect(result.inputSessionHashes).toEqual(sessions.map(session => session.contentHash))
    expect(result.finalEquity).toBe(result.finalCash)
    expect(result.finalCash).toBeGreaterThan(DEFAULT_A_SHARE_EXECUTION_POLICY.initialCash)
  })

  it('does not invent fills at an opening price limit or during suspension', () => {
    const sessions = [
      executionSession(0),
      executionSession(1, { open: 11, high: 11, low: 11, close: 11, upLimit: 11 }),
      executionSession(2, { tradingStatus: 'suspended' }),
    ]
    const result = simulateNextOpenExecution(sessions, [
      { orderId: 'sealed', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 100 },
      { orderId: 'suspended', symbol: '000001.SZ', signalDate: dateAt(1), side: 'buy', quantity: 100 },
      { orderId: 'last', symbol: '000001.SZ', signalDate: dateAt(2), side: 'buy', quantity: 100 },
    ])
    expect(result.fills).toEqual([])
    expect(result.rejections.map(rejection => [rejection.orderId, rejection.reason])).toEqual([
      ['last', 'no_next_session'],
      ['sealed', 'open_limit_up'],
      ['suspended', 'not_trading'],
    ])
  })

  it('keeps an owned position when the next open is locked limit-down', () => {
    const sessions = [
      executionSession(0),
      executionSession(1),
      executionSession(2, { open: 9, high: 9, low: 9, close: 9, downLimit: 9 }),
      executionSession(3),
    ]
    const result = simulateNextOpenExecution(sessions, [
      { orderId: 'buy', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 100 },
      { orderId: 'locked-sell', symbol: '000001.SZ', signalDate: dateAt(1), side: 'sell', quantity: 100 },
      { orderId: 'later-sell', symbol: '000001.SZ', signalDate: dateAt(2), side: 'sell', quantity: 100 },
    ])
    expect(result.fills.map(fill => fill.orderId)).toEqual(['buy', 'later-sell'])
    expect(result.rejections).toContainEqual({
      orderId: 'locked-sell',
      symbol: '000001.SZ',
      signalDate: dateAt(1),
      reason: 'open_limit_down',
    })
    expect(result.positions).toEqual([])
  })

  it('rejects invalid lots, duplicate order IDs, insufficient cash, and unavailable positions', () => {
    const sessions = [executionSession(0), executionSession(1)]
    const result = simulateNextOpenExecution(sessions, [
      { orderId: 'bad-lot', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 1 },
      { orderId: 'duplicate', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 100 },
      { orderId: 'duplicate', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 100 },
      { orderId: 'too-large', symbol: '000001.SZ', signalDate: dateAt(0), side: 'buy', quantity: 10_000_000 },
      { orderId: 'sell-empty', symbol: '000001.SZ', signalDate: dateAt(0), side: 'sell', quantity: 100 },
    ])
    expect(result.rejections.map(rejection => rejection.reason)).toEqual([
      'invalid_order',
      'duplicate_order_id',
      'insufficient_position',
      'insufficient_cash',
    ])
    expect(result.fills.map(fill => fill.orderId)).toEqual(['duplicate'])
  })
})
