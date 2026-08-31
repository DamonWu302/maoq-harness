import { describe, expect, it } from 'vitest'
import { buildMarketSnapshot } from '@deepseek-ai/dsh-market-snapshot'
import {
  LongShortStockMysqlAdapter,
  MarketSnapshotMysqlError,
  type MarketSnapshotQuery,
} from '../src/adapter.ts'

const DATE = '2026-08-28'
const CUTOFF = '2026-08-28T21:00:00+08:00'
const FETCHED = '2026-08-28T19:00:00.000000+08:00'

interface FixtureOptions {
  usable?: number
  observed?: number
  dailyCount?: number
  missingVersion?: boolean
}

function fixture(options: FixtureOptions = {}): { query: MarketSnapshotQuery; statements: string[] } {
  const statements: string[] = []
  const daily = {
    symbol: '000001', open_price: '10', high_price: '11', low_price: '9', close_price: '11', volume: '1000', amount: '10000',
    price_source: 'tushare_official', price_retrieved_at: FETCHED,
    adj_factor: '2', adjustment_source: 'tushare_official', adjustment_retrieved_at: FETCHED,
    turnover_rate: '1.5', basic_source: 'tushare_official', basic_retrieved_at: FETCHED,
    pre_close: '10', up_limit: '11', down_limit: '9', limit_source: 'tushare_official', limit_retrieved_at: FETCHED,
    list_status: 'L', list_date: '2020-01-01', delist_date: null, lifecycle_source: 'tushare_official', lifecycle_retrieved_at: FETCHED,
  }
  const routes: Record<string, object[]> = {
    quality: [{ trade_date: DATE, status: 'complete', observed_rows: options.observed ?? 1, minimum_required_rows: 1, usable_for_model: options.usable ?? 1, source: 'tushare_official', updated_at: FETCHED }],
    versions: [{
      price_version: FETCHED,
      adjustment_version: options.missingVersion === true ? null : FETCHED,
      basic_version: FETCHED,
      limit_version: FETCHED,
      index_version: FETCHED,
      sector_version: FETCHED,
    }],
    daily: Array.from({ length: options.dailyCount ?? 1 }, (_, index) => ({ ...daily, symbol: index === 0 ? '000001' : `00000${String(index + 1)}` })),
    sectors: [{ symbol: '000001', index_code: '801780.SI', industry_name: '银行', in_date: '2020-01-01', out_date: null, source: 'jiaoch_tushare_proxy', fetched_at: FETCHED }],
    indices: [{ symbol: '000001.SH', close_price: '3300', previous_close: '3267.3267', source: 'tushare_official', fetched_at: FETCHED }],
    'limit-history': [
      { trade_date: '2026-08-27', symbol: '000001', close_price: '10', high_price: '10', pre_close: '9.09', up_limit: '10' },
      { trade_date: DATE, symbol: '000001', close_price: '11', high_price: '11', pre_close: '10', up_limit: '11' },
    ],
  }
  return {
    statements,
    query: {
      rows: async <T extends object>(sql: string): Promise<T[]> => {
        statements.push(sql)
        const route = Object.keys(routes).find(key => sql.includes(`maoq:${key}`))
        if (route === undefined) throw new Error(`unexpected SQL: ${sql}`)
        return routes[route] as T[]
      },
    },
  }
}

describe('long_short_stock MySQL adapter', () => {
  it('discovers exact versions and builds deterministic adjusted facts', async () => {
    const { query, statements } = fixture()
    const adapter = new LongShortStockMysqlAdapter(query, { minimumStocks: 1 })
    const identity = await adapter.discoverIdentity(DATE, CUTOFF)
    const first = buildMarketSnapshot(await adapter.load(identity))
    const second = buildMarketSnapshot(await adapter.load(identity))

    expect(first.identity.contentHash).toBe(second.identity.contentHash)
    expect(first.stocks[0]).toMatchObject({
      symbol: '000001', open: 20, high: 22, low: 18, close: 22,
      volume: 1000, amount: 10000, turnoverRate: 0.015, limitStatus: 'limit-up',
    })
    expect(first.sectors[0]).toMatchObject({ sectorId: '801780.SI', close: 110, advancingRatio: 1, leaders: ['000001'] })
    expect(first.emotion).toMatchObject({ consecutiveBoardCounts: [{ boards: 2, count: 1 }], promotionRate: 1, brokenLimitRate: 0 })
    expect(statements.find(sql => sql.includes('maoq:sectors'))).toContain('ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY in_date DESC')
  })

  it('rejects a failed quality decision before reading market rows', async () => {
    const { query } = fixture({ usable: 0 })
    const adapter = new LongShortStockMysqlAdapter(query, { minimumStocks: 1 })
    await expect(adapter.discoverIdentity(DATE, CUTOFF)).rejects.toThrow(MarketSnapshotMysqlError)
  })

  it('rejects missing reference datasets and post-cutoff evidence', async () => {
    const missing = new LongShortStockMysqlAdapter(fixture({ missingVersion: true }).query, { minimumStocks: 1 })
    await expect(missing.discoverIdentity(DATE, CUTOFF)).rejects.toThrow(/required datasets are absent/)

    const late = new LongShortStockMysqlAdapter(fixture().query, { minimumStocks: 1 })
    await expect(late.discoverIdentity(DATE, '2026-08-28T18:00:00+08:00')).rejects.toThrow(/after cutoff/)
  })

  it('rejects identity drift and a joined row count that contradicts quality', async () => {
    const stable = new LongShortStockMysqlAdapter(fixture().query, { minimumStocks: 1 })
    const identity = await stable.discoverIdentity(DATE, CUTOFF)
    await expect(stable.load({ ...identity, adjustmentVersion: 'hfq:different' })).rejects.toThrow(/does not match/)

    const incomplete = new LongShortStockMysqlAdapter(fixture({ observed: 2 }).query, { minimumStocks: 1 })
    const incompleteIdentity = await incomplete.discoverIdentity(DATE, CUTOFF)
    await expect(incomplete.load(incompleteIdentity)).rejects.toThrow(/quality observed 2/)
  })

  it('marks lifecycle inference instead of silently dropping a newly listed priced stock', async () => {
    const base = fixture()
    const wrapped: MarketSnapshotQuery = {
      rows: async <T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> => {
        const rows = await base.query.rows<Record<string, unknown>>(sql, parameters)
        if (!sql.includes('maoq:daily')) return rows as T[]
        return rows.map(row => ({ ...row, list_status: null, list_date: DATE, lifecycle_source: 'daily_price_bar:first-observed' })) as T[]
      },
    }
    const adapter = new LongShortStockMysqlAdapter(wrapped, { minimumStocks: 1 })
    const identity = await adapter.discoverIdentity(DATE, CUTOFF)
    const draft = await adapter.load(identity)
    expect(draft.stocks[0]?.qualityFlags).toEqual(['lifecycle-inferred-from-observed-bar'])
    expect(draft.stocks[0]?.tradingStatus).toBe('trading')
  })

  it('merges only the exact frozen news batch named by the snapshot identity', async () => {
    const hash = 'a'.repeat(64)
    const batch = {
      schemaVersion: 1 as const,
      tradingDate: DATE,
      cutoffTime: CUTOFF,
      queryVersion: 'queries-v1',
      fetchedAt: FETCHED,
      contentHash: hash,
      evidence: [{
        id: 'policy-1',
        title: '政策事实',
        url: 'https://www.gov.cn/policy-1',
        publisher: 'www.gov.cn',
        publishedAt: '2026-08-28T09:00:00+08:00',
        fetchedAt: FETCHED,
        eventAt: '2026-08-28T09:00:00+08:00',
        affectedSectors: ['801780.SI'],
        confidence: 0.8,
        provenance: {
          source: {
            adapter: 'web-search',
            dataset: 'policy query',
            version: 'queries-v1',
            retrievedAt: FETCHED,
            recordId: 'policy-1',
          },
          transforms: ['event-time=publication-time'],
        },
      }],
    }
    const adapter = new LongShortStockMysqlAdapter(fixture().query, {
      minimumStocks: 1,
      readNewsBatch: () => Promise.resolve(batch),
    })
    const identity = await adapter.discoverIdentity(DATE, CUTOFF, hash)
    const snapshot = buildMarketSnapshot(await adapter.load(identity))
    expect(identity.sourceVersions).toContain(`news:${hash}`)
    expect(snapshot.news).toHaveLength(1)

    const wrongDate = new LongShortStockMysqlAdapter(fixture().query, {
      minimumStocks: 1,
      readNewsBatch: () => Promise.resolve({ ...batch, tradingDate: '2026-08-27' }),
    })
    await expect(wrongDate.load(await wrongDate.discoverIdentity(DATE, CUTOFF, hash))).rejects.toThrow(/does not match/)
  })
})
