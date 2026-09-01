import {
  computeDailyHistoryFeatures,
  type TacticLabHistoryChunk,
  type TacticLabHistoryRequest,
  verifyTacticLabHistoryChunk,
} from '@deepseek-ai/dsh-market-tactic-lab'
import { describe, expect, it } from 'vitest'
import type { MarketSnapshotQuery } from '../src/adapter.ts'
import {
  LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION,
  LongShortStockTacticHistoryAdapter,
  MarketTacticHistoryMysqlError,
} from '../src/history-adapter.ts'

const FETCHED = '2026-08-28T19:00:00.000000+08:00'
const DATES = ['2026-08-26', '2026-08-27', '2026-08-28'] as const

type DailyFixtureRow = Record<string, string | number | null>

function daily(date: string, close = '11', overrides: DailyFixtureRow = {}): DailyFixtureRow {
  return {
    trade_date: date,
    symbol: '000001',
    open_price: '10',
    high_price: '11',
    low_price: '9',
    close_price: close,
    volume: '1000',
    amount: '10000',
    price_source: 'tushare_official',
    price_version: FETCHED,
    adj_factor: '2',
    adjustment_source: 'tushare_official',
    adjustment_version: FETCHED,
    turnover_rate: '1.5',
    basic_source: 'tushare_official',
    basic_version: FETCHED,
    pre_close: '10',
    up_limit: '11',
    down_limit: '9',
    limit_source: 'tushare_official',
    limit_version: FETCHED,
    list_status: 'L',
    list_date: '2020-01-01',
    delist_date: null,
    lifecycle_source: 'tushare_official',
    lifecycle_version: FETCHED,
    sector_id: '801780.SI',
    sector_name: '银行',
    in_date: '2020-01-01',
    out_date: null,
    sector_source: 'tushare_official',
    sector_version: FETCHED,
    ...overrides,
  }
}

function fixture(options: {
  expectedRows?: number | string
  omitLastRow?: boolean
  noDates?: boolean
  invalidDateChunk?: boolean
  rowsForDate?: (date: string) => DailyFixtureRow[]
} = {}): MarketSnapshotQuery {
  return {
    rows: async <T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> => {
      if (sql.includes('maoq:tactic-history-dates')) {
        if (options.noDates === true) return []
        if (options.invalidDateChunk === true) return [{ trading_date: undefined, expected_rows: 1 }] as T[]
        return DATES.map(trading_date => ({
          trading_date,
          expected_rows: options.expectedRows ?? 1,
        })) as T[]
      }
      if (sql.includes('maoq:tactic-history-daily')) {
        const start = String(parameters[0])
        const end = String(parameters[1])
        return DATES
          .filter(date => date >= start && date <= end)
          .filter(date => !(options.omitLastRow === true && date === end))
          .flatMap(date => options.rowsForDate?.(date) ?? [daily(date)]) as T[]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
}

async function collect(
  adapter: LongShortStockTacticHistoryAdapter,
  overrides: Partial<TacticLabHistoryRequest> = {},
): Promise<TacticLabHistoryChunk[]> {
  const chunks: TacticLabHistoryChunk[] = []
  for await (const chunk of adapter.load({
    startDate: DATES[0],
    endDate: DATES[2],
    chunkSessions: 2,
    minimumStocks: 1,
    ...overrides,
  })) chunks.push(chunk)
  return chunks
}

describe('long_short_stock tactic history adapter', () => {
  it('streams stable paired adjusted-feature and raw-execution chunks', async () => {
    const first = await collect(new LongShortStockTacticHistoryAdapter(fixture()))
    const second = await collect(new LongShortStockTacticHistoryAdapter(fixture()))
    expect(first.map(chunk => [chunk.startDate, chunk.endDate])).toEqual([
      [DATES[0], DATES[1]],
      [DATES[2], DATES[2]],
    ])
    expect(first.map(chunk => chunk.contentHash)).toEqual(second.map(chunk => chunk.contentHash))
    expect(first[0]?.adapterVersion).toBe(LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION)
    expect(first[0]?.featureSessions[0]?.stocks[0]).toMatchObject({
      symbol: '000001',
      open: 20,
      close: 22,
      adjustmentFactor: 2,
      turnoverRate: 0.015,
      limitStatus: 'limit-up',
    })
    expect(first[0]?.featureSessions[0]?.sectors[0]).toMatchObject({
      sectorId: '801780.SI',
      close: 110,
      limitUpCount: 1,
    })
    expect(first[0]?.executionSessions[0]?.bars[0]).toMatchObject({
      symbol: '000001',
      open: 10,
      close: 11,
      upLimit: 11,
      downLimit: 9,
    })
    const firstChunk = first[0]
    expect(firstChunk).toBeDefined()
    if (firstChunk === undefined) throw new Error('expected the first history chunk')
    expect(firstChunk.sourceVersions).toContain(`mapping:${LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION}`)
    expect(() => {
      verifyTacticLabHistoryChunk(firstChunk)
    }).not.toThrow()
    expect(computeDailyHistoryFeatures(firstChunk.featureSessions).stocks[0]?.adjustedReturn1).toBe(0)
  })

  it('rejects a required-table join that silently loses source rows', async () => {
    const adapter = new LongShortStockTacticHistoryAdapter(fixture({ omitLastRow: true }))
    await expect(collect(adapter)).rejects.toThrow(/joined 0 rows; daily source contains 1/)
  })

  it('preserves delisting, limit, lifecycle, and point-in-time sector states', async () => {
    const rowsForDate = (date: string): DailyFixtureRow[] => [
      daily(date, '9', {
        symbol: '000001',
        list_status: 'D',
        delist_date: date,
        sector_name: null,
      }),
      daily(date, '10.5', {
        symbol: '000002',
        list_status: null,
        list_date: null,
        pre_close: null,
        sector_id: null,
        sector_name: null,
        in_date: null,
        sector_source: null,
        sector_version: null,
      }),
      daily(date, '11', {
        symbol: '000003',
        sector_id: '801750.SI',
        sector_name: '计算机',
      }),
      daily(date, '10.2', {
        symbol: '000004',
        list_status: 'D',
        list_date: '2099-01-01',
        delist_date: null,
        sector_name: null,
      }),
      daily(date, '10', {
        symbol: '000005',
        list_status: 'D',
        delist_date: '2099-01-01',
        pre_close: '0',
        sector_version: '',
      }),
      daily(date, '9', {
        symbol: '000006',
        sector_name: null,
      }),
    ]
    const chunks = await collect(new LongShortStockTacticHistoryAdapter(fixture({ expectedRows: 6, rowsForDate })))
    const session = chunks[0]?.featureSessions[0]
    expect(session?.stocks.map(stock => [stock.symbol, stock.tradingStatus, stock.limitStatus])).toEqual([
      ['000001', 'delisting', 'limit-down'],
      ['000002', 'trading', 'none'],
      ['000003', 'trading', 'limit-up'],
      ['000004', 'trading', 'none'],
      ['000005', 'trading', 'none'],
      ['000006', 'trading', 'limit-down'],
    ])
    expect(session?.stocks[1]?.qualityFlags).toEqual([
      'lifecycle-inferred-from-observed-bar',
      'pre-close-unavailable-no-history',
      'point-in-time-sector-unavailable',
    ])
    expect(session?.stocks[1]?.listingDays).toBe(0)
    expect(session?.stocks[3]?.listingDays).toBe(0)
    expect(session?.sectors.map(sector => [sector.sectorId, sector.name])).toEqual([
      ['801750.SI', '计算机'],
      ['801780.SI', '801780.SI'],
    ])
    expect(session?.sectors[1]?.members.map(member => member.symbol)).toEqual(['000001', '000004', '000006'])
    expect(session?.sectors[1]?.dispersion).toBeGreaterThan(0)
  })

  it('marks sector evidence unavailable when every row lacks dated membership', async () => {
    const rowsForDate = (date: string): DailyFixtureRow[] => [daily(date, '10', {
      pre_close: null,
      sector_id: null,
      sector_name: null,
      in_date: null,
      sector_source: null,
      sector_version: null,
    })]
    const chunks = await collect(new LongShortStockTacticHistoryAdapter(fixture({ rowsForDate })))
    expect(chunks[0]?.sourceVersions).toContain('sector:unavailable')
    expect(chunks[0]?.featureSessions[0]?.identity.sectorClassificationVersion).toBe('sw-l1:unavailable')
    expect(chunks[0]?.featureSessions[0]?.sectors).toEqual([])
  })

  it('rejects malformed required numeric and membership facts', async () => {
    const invalidRows = [
      (date: string): DailyFixtureRow[] => [daily(date, '11', { adj_factor: null })],
      (date: string): DailyFixtureRow[] => [daily(date, '11', { open_price: 'not-a-number' })],
      (date: string): DailyFixtureRow[] => [daily(date, '11', { in_date: null })],
      (date: string): DailyFixtureRow[] => [daily(date, '11', { in_date: '' })],
    ]
    for (const rowsForDate of invalidRows) {
      await expect(collect(new LongShortStockTacticHistoryAdapter(fixture({ rowsForDate })))).rejects.toThrow(
        MarketTacticHistoryMysqlError,
      )
    }
    await expect(collect(new LongShortStockTacticHistoryAdapter(fixture({ expectedRows: 'invalid' })))).rejects.toThrow(
      /expected_rows is missing or non-numeric/,
    )
  })

  it('rejects empty ranges and invalid bounds before returning partial success', async () => {
    const empty = new LongShortStockTacticHistoryAdapter(fixture({ noDates: true }))
    await expect(collect(empty)).rejects.toThrow(MarketTacticHistoryMysqlError)

    const adapter = new LongShortStockTacticHistoryAdapter(fixture())
    const run = async (): Promise<void> => {
      for await (const _chunk of adapter.load({
        startDate: DATES[2],
        endDate: DATES[0],
        chunkSessions: 2,
        minimumStocks: 1,
      })) void _chunk
    }
    await expect(run()).rejects.toThrow(/startDate exceeds endDate/)
  })

  it('validates every external history request bound', async () => {
    const adapter = new LongShortStockTacticHistoryAdapter(fixture())
    const invalidRequests: Partial<TacticLabHistoryRequest>[] = [
      { startDate: '2026/08/26' },
      { endDate: '2026/08/28' },
      { chunkSessions: 0 },
      { chunkSessions: 61 },
      { chunkSessions: 1.5 },
      { minimumStocks: 0 },
      { minimumStocks: 1.5 },
    ]
    for (const request of invalidRequests) {
      await expect(collect(adapter, request)).rejects.toThrow(MarketTacticHistoryMysqlError)
    }
    await expect(collect(new LongShortStockTacticHistoryAdapter(fixture({ invalidDateChunk: true })))).rejects.toThrow(
      /date chunk is incomplete/,
    )
  })
})
