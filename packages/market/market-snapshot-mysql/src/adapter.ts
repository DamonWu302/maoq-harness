import type {
  EmotionFacts,
  MarketBreadth,
  MarketProvenance,
  MarketSnapshotAdapter,
  MarketSnapshotDraft,
  MarketSnapshotIdentityInput,
  SectorDailySnapshot,
  StockDailyBar,
} from '@deepseek-ai/dsh-market-snapshot'

/** Minimal SELECT executor used by production MySQL and deterministic tests. */
export interface MarketSnapshotQuery {
  /** Execute one parameterized SELECT and return plain row objects. */
  rows<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]>
}

interface QualityRow {
  trade_date: string
  status: string
  observed_rows: number
  minimum_required_rows: number
  usable_for_model: number
  source: string
  updated_at: string
}

interface VersionRow {
  price_version: string | null
  adjustment_version: string | null
  basic_version: string | null
  limit_version: string | null
  index_version: string | null
  sector_version: string | null
}

interface DailyRow {
  symbol: string
  open_price: string
  high_price: string
  low_price: string
  close_price: string
  volume: string | null
  amount: string | null
  price_source: string
  price_retrieved_at: string
  adj_factor: string
  adjustment_source: string
  adjustment_retrieved_at: string
  turnover_rate: string | null
  basic_source: string
  basic_retrieved_at: string
  pre_close: string | null
  up_limit: string | null
  down_limit: string | null
  limit_source: string
  limit_retrieved_at: string
  list_status: string | null
  list_date: string | null
  delist_date: string | null
  lifecycle_source: string
  lifecycle_retrieved_at: string
}

interface SectorRow {
  symbol: string
  index_code: string
  industry_name: string
  in_date: string
  out_date: string | null
  source: string
  fetched_at: string
}

interface IndexRow {
  symbol: string
  close_price: string
  previous_close: string | null
  source: string
  fetched_at: string
}

interface LimitHistoryRow {
  trade_date: string
  symbol: string
  close_price: string
  high_price: string
  pre_close: string | null
  up_limit: string | null
}

const QUALITY_SQL = `/* maoq:quality */
SELECT DATE_FORMAT(trade_date, '%Y-%m-%d') trade_date, status, observed_rows,
       minimum_required_rows, usable_for_model, source,
       DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') updated_at
FROM daily_price_session_quality WHERE trade_date = ?`

const VERSION_SQL = `/* maoq:versions */
SELECT
 (SELECT DATE_FORMAT(MAX(updated_at), '%Y-%m-%dT%H:%i:%s.%f+08:00') FROM daily_price_bar WHERE trade_date = ?) price_version,
 (SELECT DATE_FORMAT(MAX(fetched_at), '%Y-%m-%dT%H:%i:%s.%f+08:00') FROM daily_adjustment_factor WHERE trade_date = ?) adjustment_version,
 (SELECT DATE_FORMAT(MAX(fetched_at), '%Y-%m-%dT%H:%i:%s.%f+08:00') FROM daily_basic_factor WHERE trade_date = ?) basic_version,
 (SELECT DATE_FORMAT(MAX(fetched_at), '%Y-%m-%dT%H:%i:%s.%f+08:00') FROM daily_price_limit WHERE trade_date = ?) limit_version,
 (SELECT DATE_FORMAT(MAX(fetched_at), '%Y-%m-%dT%H:%i:%s.%f+08:00') FROM market_index_daily_bar WHERE trade_date = ?) index_version,
 (SELECT DATE_FORMAT(MAX(fetched_at), '%Y-%m-%dT%H:%i:%s.%f+08:00') FROM security_industry_period WHERE industry_level = 'L1' AND in_date <= ? AND (out_date IS NULL OR out_date >= ?)) sector_version`

const DAILY_SQL = `/* maoq:daily */
SELECT p.symbol, p.open_price, p.high_price, p.low_price, p.close_price, p.volume, p.amount,
 p.source price_source, DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') price_retrieved_at,
 a.adj_factor, a.source adjustment_source, DATE_FORMAT(a.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') adjustment_retrieved_at,
 b.turnover_rate, b.source basic_source, DATE_FORMAT(b.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') basic_retrieved_at,
 l.pre_close, l.up_limit, l.down_limit, l.source limit_source, DATE_FORMAT(l.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') limit_retrieved_at,
 s.list_status, DATE_FORMAT(COALESCE(s.list_date, (SELECT MIN(first_bar.trade_date) FROM daily_price_bar first_bar WHERE first_bar.symbol=p.symbol)), '%Y-%m-%d') list_date,
 DATE_FORMAT(s.delist_date, '%Y-%m-%d') delist_date,
 COALESCE(s.source, 'daily_price_bar:first-observed') lifecycle_source,
 COALESCE(DATE_FORMAT(s.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00'), DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.%f+08:00')) lifecycle_retrieved_at
FROM daily_price_bar p
JOIN daily_adjustment_factor a ON a.trade_date=p.trade_date AND a.symbol=p.symbol
JOIN daily_basic_factor b ON b.trade_date=p.trade_date AND b.symbol=p.symbol
JOIN daily_price_limit l ON l.trade_date=p.trade_date AND l.symbol=p.symbol
LEFT JOIN security_lifecycle s ON s.symbol=p.symbol
WHERE p.trade_date = ? ORDER BY p.symbol`

const SECTOR_SQL = `/* maoq:sectors */
SELECT symbol, index_code, industry_name, DATE_FORMAT(in_date, '%Y-%m-%d') in_date,
 DATE_FORMAT(out_date, '%Y-%m-%d') out_date, source,
 DATE_FORMAT(fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') fetched_at
FROM (
 SELECT p.*, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY in_date DESC, fetched_at DESC, index_code) membership_rank
 FROM security_industry_period p
 WHERE industry_level='L1' AND in_date <= ? AND (out_date IS NULL OR out_date >= ?)
) ranked WHERE membership_rank=1
ORDER BY index_code, symbol`

const INDEX_SQL = `/* maoq:indices */
SELECT i.symbol, i.close_price,
 (SELECT p.close_price FROM market_index_daily_bar p WHERE p.symbol=i.symbol AND p.trade_date < i.trade_date ORDER BY p.trade_date DESC LIMIT 1) previous_close,
 i.source, DATE_FORMAT(i.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') fetched_at
FROM market_index_daily_bar i WHERE i.trade_date=? ORDER BY i.symbol`

const HISTORY_SQL = `/* maoq:limit-history */
SELECT DATE_FORMAT(p.trade_date, '%Y-%m-%d') trade_date, p.symbol, p.close_price, p.high_price, l.pre_close, l.up_limit
FROM daily_price_bar p JOIN daily_price_limit l ON l.trade_date=p.trade_date AND l.symbol=p.symbol
JOIN (SELECT trade_date FROM daily_price_session_quality WHERE trade_date <= ? AND usable_for_model=1 ORDER BY trade_date DESC LIMIT ?) sessions
  ON sessions.trade_date=p.trade_date
ORDER BY p.trade_date, p.symbol`

/** Rejected source evidence. No partial draft is returned. */
export class MarketSnapshotMysqlError extends Error {
  /** Stable machine-readable category. */
  readonly code = 'MARKET_SNAPSHOT_MYSQL_REJECTED' as const

  constructor(message: string) {
    super(`market snapshot mysql rejected: ${message}`)
    this.name = 'MarketSnapshotMysqlError'
  }
}

function numberOf(value: string | number | null, field: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) throw new MarketSnapshotMysqlError(`${field} is missing or non-numeric`)
  return result
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('\n') === [...right].sort().join('\n')
}

function sameIdentity(left: MarketSnapshotIdentityInput, right: MarketSnapshotIdentityInput): boolean {
  return left.tradingDate === right.tradingDate
    && left.cutoffTime === right.cutoffTime
    && left.calendarVersion === right.calendarVersion
    && left.adjustmentVersion === right.adjustmentVersion
    && left.sectorClassificationVersion === right.sectorClassificationVersion
    && sameStrings(left.sourceVersions, right.sourceVersions)
}

function latest(...values: string[]): string {
  return [...values].sort().at(-1) ?? ''
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function rounded(value: number): number {
  return Number(value.toFixed(12))
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

function daysInclusive(from: string | null, to: string): number {
  if (from === null) return 0
  return Math.max(0, Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1)
}

function validateCutoff(timestamp: string, cutoff: string, subject: string): void {
  if (Date.parse(timestamp) > Date.parse(cutoff)) throw new MarketSnapshotMysqlError(`${subject} was retrieved after cutoff ${cutoff}`)
}

function source(
  adapter: string,
  dataset: string,
  version: string,
  retrievedAt: string,
  recordId: string,
  transforms: readonly string[],
): MarketProvenance {
  return { source: { adapter, dataset, version, retrievedAt, recordId }, transforms }
}

/** Converts quality-gated `long_short_stock` tables into provider-neutral facts. */
export class LongShortStockMysqlAdapter implements MarketSnapshotAdapter {
  readonly name: string

  constructor(
    private readonly query: MarketSnapshotQuery,
    options: { readonly adapterName?: string; readonly minimumStocks?: number; readonly historySessions?: number } = {},
  ) {
    this.name = options.adapterName ?? 'long-short-stock-mysql'
    this.minimumStocks = options.minimumStocks ?? 3000
    this.historySessions = options.historySessions ?? 20
  }

  private readonly minimumStocks: number
  private readonly historySessions: number

  /** Discover the exact versions required to request a reproducible snapshot. */
  async discoverIdentity(tradingDate: string, cutoffTime: string): Promise<MarketSnapshotIdentityInput> {
    const [quality] = await this.query.rows<QualityRow>(QUALITY_SQL, [tradingDate])
    if (quality === undefined) throw new MarketSnapshotMysqlError(`no quality decision for ${tradingDate}`)
    if (quality.trade_date !== tradingDate) throw new MarketSnapshotMysqlError(`quality date ${quality.trade_date} does not match ${tradingDate}`)
    if (quality.usable_for_model !== 1 || quality.status !== 'complete') throw new MarketSnapshotMysqlError(`quality gate is ${quality.status}, usable=${String(quality.usable_for_model)}`)
    const required = Math.max(this.minimumStocks, quality.minimum_required_rows)
    if (quality.observed_rows < required) throw new MarketSnapshotMysqlError(`only ${String(quality.observed_rows)} rows; ${String(required)} required`)
    validateCutoff(quality.updated_at, cutoffTime, 'quality decision')
    const versionParameters = [tradingDate, tradingDate, tradingDate, tradingDate, tradingDate, tradingDate, tradingDate]
    const [versions] = await this.query.rows<VersionRow>(VERSION_SQL, versionParameters)
    if (versions === undefined) throw new MarketSnapshotMysqlError(`no source versions for ${tradingDate}`)
    const requiredVersions = [
      versions.price_version,
      versions.adjustment_version,
      versions.basic_version,
      versions.limit_version,
      versions.index_version,
      versions.sector_version,
    ]
    if (requiredVersions.some(value => value === null)) throw new MarketSnapshotMysqlError(`one or more required datasets are absent for ${tradingDate}`)
    const [price, adjustment, basic, limit, index, sector] = requiredVersions as [string, string, string, string, string, string]
    for (const [label, value] of [['price', price], ['adjustment', adjustment], ['basic', basic], ['limit', limit], ['index', index], ['sector', sector]] as const) validateCutoff(value, cutoffTime, label)
    return {
      tradingDate,
      cutoffTime,
      calendarVersion: `quality:${quality.source}@${quality.updated_at}`,
      adjustmentVersion: `hfq:${adjustment}`,
      sectorClassificationVersion: `sw-l1:${sector}`,
      sourceVersions: [
        `price:${price}`,
        `basic:${basic}`,
        `limit:${limit}`,
        `index:${index}`,
        `emotion:${price}+${limit}`,
      ],
    }
  }

  /** Load one exact identity and reject drift, incompleteness, or post-cutoff evidence. */
  async load(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshotDraft> {
    const observed = await this.discoverIdentity(identity.tradingDate, identity.cutoffTime)
    if (!sameIdentity(identity, observed)) {
      throw new MarketSnapshotMysqlError('requested identity does not match the current audited source versions')
    }
    const [daily, sectorRows, indices, history, qualityRows] = await Promise.all([
      this.query.rows<DailyRow>(DAILY_SQL, [identity.tradingDate]),
      this.query.rows<SectorRow>(SECTOR_SQL, [identity.tradingDate, identity.tradingDate]),
      this.query.rows<IndexRow>(INDEX_SQL, [identity.tradingDate]),
      this.query.rows<LimitHistoryRow>(HISTORY_SQL, [identity.tradingDate, this.historySessions]),
      this.query.rows<QualityRow>(QUALITY_SQL, [identity.tradingDate]),
    ])
    if (daily.length < this.minimumStocks) throw new MarketSnapshotMysqlError(`joined daily facts contain only ${String(daily.length)} stocks`)
    if (daily.length !== qualityRows[0]?.observed_rows) throw new MarketSnapshotMysqlError(`joined daily facts contain ${String(daily.length)} stocks but quality observed ${String(qualityRows[0]?.observed_rows ?? 'none')}`)
    if (sectorRows.length === 0) throw new MarketSnapshotMysqlError('point-in-time SW L1 membership is empty')
    if (indices.length === 0) throw new MarketSnapshotMysqlError('major index facts are empty')
    const finalObserved = await this.discoverIdentity(identity.tradingDate, identity.cutoffTime)
    if (!sameIdentity(identity, finalObserved)) throw new MarketSnapshotMysqlError('source versions changed while facts were being read')
    const stocks = this.stocks(identity, daily)
    return {
      identity,
      stocks,
      sectors: this.sectors(identity, daily, sectorRows),
      breadth: this.breadth(identity, daily, indices),
      emotion: this.emotion(identity, daily, history),
      news: [],
    }
  }

  private stocks(identity: MarketSnapshotIdentityInput, rows: readonly DailyRow[]): StockDailyBar[] {
    return rows.map((row) => {
      const factor = numberOf(row.adj_factor, `${row.symbol}.adj_factor`)
      const close = numberOf(row.close_price, `${row.symbol}.close`)
      const up = numberOf(row.up_limit, `${row.symbol}.up_limit`)
      const down = numberOf(row.down_limit, `${row.symbol}.down_limit`)
      const retrievedAt = latest(
        row.price_retrieved_at,
        row.adjustment_retrieved_at,
        row.basic_retrieved_at,
        row.limit_retrieved_at,
        row.lifecycle_retrieved_at,
      )
      validateCutoff(retrievedAt, identity.cutoffTime, row.symbol)
      return {
        symbol: row.symbol,
        tradingDate: identity.tradingDate,
        open: numberOf(row.open_price, `${row.symbol}.open`) * factor,
        high: numberOf(row.high_price, `${row.symbol}.high`) * factor,
        low: numberOf(row.low_price, `${row.symbol}.low`) * factor,
        close: close * factor,
        volume: numberOf(row.volume, `${row.symbol}.volume`),
        amount: numberOf(row.amount, `${row.symbol}.amount`),
        turnoverRate: numberOf(row.turnover_rate, `${row.symbol}.turnover_rate`) / 100,
        adjustmentFactor: factor,
        tradingStatus: row.list_status === 'D' && row.delist_date !== null && row.delist_date <= identity.tradingDate ? 'delisting' : 'trading',
        limitStatus: close >= up ? 'limit-up' : close <= down ? 'limit-down' : 'none',
        listingDays: daysInclusive(row.list_date, identity.tradingDate),
        qualityFlags: row.list_status === null ? ['lifecycle-inferred-from-observed-bar'] : [],
        provenance: source(this.name, [
          'daily_price_bar',
          'daily_adjustment_factor',
          'daily_basic_factor',
          'daily_price_limit',
          'security_lifecycle',
        ].join('+'), identity.adjustmentVersion, retrievedAt, `${identity.tradingDate}:${row.symbol}`, [
          'hfq-price=raw-price*adj-factor',
          'turnover-ratio=turnover-rate-percent/100',
          'volume-and-amount-unadjusted',
          'listing-days=calendar-days-inclusive',
          'missing-lifecycle=trading-status-from-observed-bar-and-list-date-from-first-bar',
        ]),
      }
    })
  }

  private sectors(
    identity: MarketSnapshotIdentityInput,
    rows: readonly DailyRow[],
    memberships: readonly SectorRow[],
  ): SectorDailySnapshot[] {
    const bySymbol = new Map(rows.map(row => [row.symbol, row]))
    const groups = new Map<string, SectorRow[]>()
    for (const membership of memberships) groups.set(membership.index_code, [...groups.get(membership.index_code) ?? [], membership])
    return [...groups.entries()].map(([sectorId, members]) => {
      const active = members.flatMap((member) => {
        const row = bySymbol.get(member.symbol)
        if (row === undefined || row.pre_close === null) return []
        const preClose = numberOf(row.pre_close, `${row.symbol}.pre_close`)
        if (preClose <= 0) return []
        return [{ row, preClose, change: numberOf(row.close_price, `${row.symbol}.close`) / preClose - 1 }]
      })
      if (active.length === 0) throw new MarketSnapshotMysqlError(`sector ${sectorId} has no active priced members`)
      const meanRelative = (field: 'open_price' | 'high_price' | 'low_price' | 'close_price') =>
        rounded(active.reduce((sum, item) => sum + numberOf(item.row[field], `${item.row.symbol}.${field}`) / item.preClose, 0) / active.length * 100)
      const retrievedAt = latest(...members.map(member => member.fetched_at), ...active.map(item => item.row.price_retrieved_at))
      validateCutoff(retrievedAt, identity.cutoffTime, sectorId)
      return {
        sectorId,
        name: members[0]?.industry_name ?? sectorId,
        tradingDate: identity.tradingDate,
        open: meanRelative('open_price'),
        high: meanRelative('high_price'),
        low: meanRelative('low_price'),
        close: meanRelative('close_price'),
        amount: active.reduce((sum, item) => sum + numberOf(item.row.amount, `${item.row.symbol}.amount`), 0),
        advancingRatio: ratio(active.filter(item => item.change > 0).length, active.length),
        limitUpCount: active.filter(item => numberOf(item.row.close_price, `${item.row.symbol}.close`) >= numberOf(item.row.up_limit, `${item.row.symbol}.up_limit`)).length,
        dispersion: standardDeviation(active.map(item => item.change)),
        leaders: [...active]
          .sort((a, b) => b.change - a.change || a.row.symbol.localeCompare(b.row.symbol))
          .slice(0, 5)
          .map(item => item.row.symbol),
        members: members.map(member => ({ symbol: member.symbol, effectiveFrom: member.in_date, effectiveTo: member.out_date })),
        provenance: source(this.name, 'security_industry_period+daily_price_bar+daily_price_limit', identity.sectorClassificationVersion, retrievedAt, `${identity.tradingDate}:${sectorId}`, [
          'pit-membership=in-date<=trade-date<=out-date-or-open',
          'overlapping-membership=latest-in-date-then-latest-fetch',
          'equal-weight-sector-index=mean(raw-price/pre-close)*100',
          'leaders=top-5-close-return',
        ]),
      }
    })
  }

  private breadth(identity: MarketSnapshotIdentityInput, rows: readonly DailyRow[], indices: readonly IndexRow[]): MarketBreadth {
    const changes = rows.map(row => numberOf(row.close_price, `${row.symbol}.close`) - numberOf(row.pre_close, `${row.symbol}.pre_close`))
    const broken = rows.filter(row => numberOf(row.high_price, `${row.symbol}.high`) >= numberOf(row.up_limit, `${row.symbol}.up_limit`) && numberOf(row.close_price, `${row.symbol}.close`) < numberOf(row.up_limit, `${row.symbol}.up_limit`)).length
    const retrievedAt = latest(...rows.map(row => row.price_retrieved_at), ...indices.map(index => index.fetched_at))
    return {
      majorIndices: indices.map(index => ({
        symbol: index.symbol,
        close: numberOf(index.close_price, `${index.symbol}.close`),
        changePct: (numberOf(index.close_price, `${index.symbol}.close`) / numberOf(index.previous_close, `${index.symbol}.previous_close`) - 1) * 100,
      })),
      totalAmount: rows.reduce((sum, row) => sum + numberOf(row.amount, `${row.symbol}.amount`), 0),
      advancing: changes.filter(change => change > 0).length,
      declining: changes.filter(change => change < 0).length,
      unchanged: changes.filter(change => change === 0).length,
      limitUp: rows.filter(row => numberOf(row.close_price, `${row.symbol}.close`) >= numberOf(row.up_limit, `${row.symbol}.up_limit`)).length,
      limitDown: rows.filter(row => numberOf(row.close_price, `${row.symbol}.close`) <= numberOf(row.down_limit, `${row.symbol}.down_limit`)).length,
      brokenLimit: broken,
      provenance: source(this.name, 'daily_price_bar+daily_price_limit+market_index_daily_bar', identity.sourceVersions.join('|'), retrievedAt, identity.tradingDate, ['breadth=close-vs-pre-close', 'broken-limit=high>=up-limit-and-close<up-limit']),
    }
  }

  private emotion(identity: MarketSnapshotIdentityInput, rows: readonly DailyRow[], history: readonly LimitHistoryRow[]): EmotionFacts {
    const byDate = new Map<string, LimitHistoryRow[]>()
    for (const row of history) byDate.set(row.trade_date, [...byDate.get(row.trade_date) ?? [], row])
    const dates = [...byDate.keys()].sort()
    const todayIndex = dates.indexOf(identity.tradingDate)
    if (todayIndex < 0) throw new MarketSnapshotMysqlError('emotion history does not include the requested date')
    const previous = todayIndex > 0 ? byDate.get(dates[todayIndex - 1] ?? '') ?? [] : []
    const priorLimitUp = new Set(previous.filter(row => numberOf(row.close_price, `${row.symbol}.close`) >= numberOf(row.up_limit, `${row.symbol}.up_limit`)).map(row => row.symbol))
    const currentLimitUp = new Set(rows.filter(row => numberOf(row.close_price, `${row.symbol}.close`) >= numberOf(row.up_limit, `${row.symbol}.up_limit`)).map(row => row.symbol))
    const streaks = new Map<number, number>()
    for (const symbol of currentLimitUp) {
      let boards = 0
      for (let index = todayIndex; index >= 0; index -= 1) {
        const row = (byDate.get(dates[index] ?? '') ?? []).find(candidate => candidate.symbol === symbol)
        if (row === undefined || numberOf(row.close_price, `${symbol}.close`) < numberOf(row.up_limit, `${symbol}.up_limit`)) break
        boards += 1
      }
      streaks.set(boards, (streaks.get(boards) ?? 0) + 1)
    }
    const broken = rows.filter(row => numberOf(row.high_price, `${row.symbol}.high`) >= numberOf(row.up_limit, `${row.symbol}.up_limit`) && numberOf(row.close_price, `${row.symbol}.close`) < numberOf(row.up_limit, `${row.symbol}.up_limit`)).length
    return {
      consecutiveBoardCounts: [...streaks].map(([boards, count]) => ({ boards, count })),
      promotionRate: ratio([...priorLimitUp].filter(symbol => currentLimitUp.has(symbol)).length, priorLimitUp.size),
      brokenLimitRate: ratio(broken, broken + currentLimitUp.size),
      lossEffectRate: ratio(rows.filter(row => numberOf(row.close_price, `${row.symbol}.close`) / numberOf(row.pre_close, `${row.symbol}.pre_close`) - 1 <= -0.05).length, rows.length),
      provenance: source(this.name, 'daily_price_bar+daily_price_limit', identity.sourceVersions.find(value => value.startsWith('emotion:')) ?? 'emotion', latest(...rows.map(row => row.price_retrieved_at)), identity.tradingDate, [
        `consecutive-boards=closed-limit-ups-over-last-${String(this.historySessions)}-usable-sessions`,
        'promotion=prior-limit-up-and-current-limit-up/prior-limit-up',
        'broken-rate=broken/(broken+closed-limit-up)',
        'loss-effect=close-return<=-5-percent/all-priced-stocks',
      ]),
    }
  }
}
