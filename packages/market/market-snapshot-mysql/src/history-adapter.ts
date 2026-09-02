import type {
  MarketProvenance,
  MarketSnapshotIdentityInput,
  SectorDailySnapshot,
  StockDailyBar,
} from '@deepseek-ai/dsh-market-snapshot'
import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import {
  buildTacticLabHistoryChunk,
  type DailyBenchmarkReturn,
  type DailyExecutionBar,
  type DailyExecutionSession,
  type DailyHistorySnapshot,
  type TacticLabHistoryAdapter,
  type TacticLabHistoryChunk,
  type TacticLabHistoryRequest,
} from '@deepseek-ai/dsh-market-tactic-lab'
import type { MarketSnapshotQuery } from './adapter.ts'

/** Provider mapping version included in every frozen historical chunk. */
export const LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION = 'long-short-stock-history-v3' as const

/** Predeclared investable-market comparisons required by the MAOQ P0 replay. */
export const MAOQ_HISTORY_BENCHMARK_INDEX_SYMBOLS = Object.freeze([
  '000001.SH',
  '000300.SH',
  '000905.SH',
  '000852.SH',
] as const)

interface AvailableHistoryDateRow {
  trading_date: string
  expected_rows: number | string
}

interface HistoryDailyRow {
  trade_date: string
  symbol: string
  open_price: string
  high_price: string
  low_price: string
  close_price: string
  volume: string
  amount: string
  price_source: string
  price_version: string
  adj_factor: string
  adjustment_source: string
  adjustment_version: string
  turnover_rate: string
  basic_source: string
  basic_version: string
  pre_close: string | null
  pre_close_derived: number
  up_limit: string
  down_limit: string
  limit_source: string
  limit_version: string
  list_status: string | null
  list_date: string | null
  delist_date: string | null
  lifecycle_source: string
  lifecycle_version: string
  sector_id: string | null
  sector_name: string | null
  in_date: string | null
  out_date: string | null
  sector_source: string | null
  sector_version: string | null
}

type HistoryDailyCoreRow = Omit<HistoryDailyRow,
  'sector_id' | 'sector_name' | 'in_date' | 'out_date' | 'sector_source' | 'sector_version'>

interface HistorySectorRow {
  symbol: string
  sector_id: string
  sector_name: string | null
  in_date: string | null
  out_date: string | null
  sector_source: string | null
  sector_version: string | null
}

interface HistoryIndexRow {
  trade_date: string
  symbol: string
  name: string
  close_price: string
  previous_close: string | null
  source: string
  fetched_at: string
}

interface HistoryPreviousCloseRow {
  symbol: string
  close_price: string
  price_version: string
}

const HISTORY_DATES_SQL = `/* maoq:tactic-history-dates */
SELECT DATE_FORMAT(p.trade_date, '%Y-%m-%d') trading_date, COUNT(*) expected_rows
FROM daily_price_bar p
JOIN daily_price_session_quality q ON q.trade_date=p.trade_date
WHERE p.trade_date BETWEEN ? AND ?
  AND WEEKDAY(p.trade_date) BETWEEN 0 AND 4
  AND q.status='complete'
  AND q.usable_for_model=1
  AND q.observed_rows >= q.minimum_required_rows
GROUP BY p.trade_date, q.minimum_required_rows, q.observed_rows
HAVING COUNT(*) = q.observed_rows AND COUNT(*) >= GREATEST(q.minimum_required_rows, ?)
ORDER BY p.trade_date`

const HISTORY_DAILY_SQL = `/* maoq:tactic-history-daily */
SELECT
  DATE_FORMAT(p.trade_date, '%Y-%m-%d') trade_date,
  p.symbol, p.open_price, p.high_price, p.low_price, p.close_price, p.volume, p.amount,
  p.source price_source, DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') price_version,
  a.adj_factor, a.source adjustment_source, DATE_FORMAT(a.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') adjustment_version,
  b.turnover_rate, b.source basic_source, DATE_FORMAT(b.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') basic_version,
  l.pre_close, 0 pre_close_derived,
  l.up_limit, l.down_limit, l.source limit_source, DATE_FORMAT(l.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') limit_version,
  s.list_status, DATE_FORMAT(s.list_date, '%Y-%m-%d') list_date, DATE_FORMAT(s.delist_date, '%Y-%m-%d') delist_date,
  COALESCE(s.source, 'daily_price_bar:first-observed') lifecycle_source,
  COALESCE(DATE_FORMAT(s.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00'), DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.%f+08:00')) lifecycle_version
FROM daily_price_bar p
JOIN daily_adjustment_factor a ON a.trade_date=p.trade_date AND a.symbol=p.symbol
JOIN daily_basic_factor b ON b.trade_date=p.trade_date AND b.symbol=p.symbol
JOIN daily_price_limit l ON l.trade_date=p.trade_date AND l.symbol=p.symbol
LEFT JOIN security_lifecycle s ON s.symbol=p.symbol
WHERE p.trade_date BETWEEN ? AND ?
ORDER BY trade_date, symbol`

const HISTORY_PREVIOUS_CLOSE_SQL = `/* maoq:tactic-history-previous-closes */
SELECT current.symbol, current.close_price,
 DATE_FORMAT(current.updated_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') price_version
FROM daily_price_bar current
JOIN (
 SELECT symbol, MAX(trade_date) trade_date
 FROM daily_price_bar WHERE trade_date < ? GROUP BY symbol
) previous ON previous.symbol=current.symbol AND previous.trade_date=current.trade_date
ORDER BY current.symbol`

const HISTORY_SECTOR_SQL = `/* maoq:tactic-history-sectors */
SELECT symbol, index_code sector_id, industry_name sector_name,
 DATE_FORMAT(in_date, '%Y-%m-%d') in_date, DATE_FORMAT(out_date, '%Y-%m-%d') out_date,
 source sector_source, DATE_FORMAT(fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') sector_version
FROM security_industry_period
WHERE industry_level='L1' AND in_date <= ? AND (out_date IS NULL OR out_date >= ?)
ORDER BY symbol, in_date DESC, fetched_at DESC, index_code`

const HISTORY_INDEX_SQL = `/* maoq:tactic-history-indices */
SELECT DATE_FORMAT(i.trade_date, '%Y-%m-%d') trade_date, i.symbol, i.name, i.close_price,
 (SELECT previous.close_price FROM market_index_daily_bar previous
  WHERE previous.symbol=i.symbol AND previous.trade_date<i.trade_date
  ORDER BY previous.trade_date DESC LIMIT 1) previous_close,
 i.source, DATE_FORMAT(i.fetched_at, '%Y-%m-%dT%H:%i:%s.%f+08:00') fetched_at
FROM market_index_daily_bar i
WHERE i.trade_date BETWEEN ? AND ?
  AND i.symbol IN ('000001.SH', '000300.SH', '000905.SH', '000852.SH')
ORDER BY trade_date, symbol`

/** Rejected production history evidence. */
export class MarketTacticHistoryMysqlError extends Error {
  /** Stable machine-readable category. */
  readonly code = 'MAOQ_TACTIC_HISTORY_MYSQL_REJECTED' as const

  constructor(message: string) {
    super(`MAOQ tactic history MySQL rejected: ${message}`)
    this.name = 'MarketTacticHistoryMysqlError'
  }
}

function numberOf(value: string | number | null, field: string): number {
  if (value === null) throw new MarketTacticHistoryMysqlError(`${field} is missing or non-numeric`)
  const result = Number(value)
  if (!Number.isFinite(result)) throw new MarketTacticHistoryMysqlError(`${field} is missing or non-numeric`)
  return result
}

function rounded(value: number): number {
  return Number(value.toFixed(12))
}

function latest(values: readonly (string | null)[]): string {
  return values.filter((value): value is string => value !== null && value.length > 0).sort().at(-1) ?? ''
}

function daysInclusive(from: string | null, to: string): number {
  if (from === null) return 0
  return Math.max(0, Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1)
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

function provenance(
  dataset: string,
  version: string,
  retrievedAt: string,
  recordId: string,
  transforms: readonly string[],
): MarketProvenance {
  return {
    source: {
      adapter: 'long-short-stock-history-mysql',
      dataset,
      version,
      retrievedAt,
      recordId,
    },
    transforms: [...transforms],
  }
}

function sourceVersions(rows: readonly HistoryDailyRow[], indices: readonly HistoryIndexRow[]): readonly string[] {
  return [
    `mapping:${LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION}`,
    `price:${latest(rows.map(row => row.price_version))}`,
    `adjustment:${latest(rows.map(row => row.adjustment_version))}`,
    `basic:${latest(rows.map(row => row.basic_version))}`,
    `limit:${latest(rows.map(row => row.limit_version))}`,
    `lifecycle:${latest(rows.map(row => row.lifecycle_version))}`,
    `sector:${latest(rows.map(row => row.sector_version)) || 'unavailable'}`,
    `index:${latest(indices.map(row => row.fetched_at))}`,
  ]
}

function stock(row: HistoryDailyRow): StockDailyBar {
  const factor = numberOf(row.adj_factor, `${row.trade_date}:${row.symbol}.adj_factor`)
  const rawClose = numberOf(row.close_price, `${row.trade_date}:${row.symbol}.close`)
  const upLimit = numberOf(row.up_limit, `${row.trade_date}:${row.symbol}.up_limit`)
  const downLimit = numberOf(row.down_limit, `${row.trade_date}:${row.symbol}.down_limit`)
  const retrievedAt = latest([
    row.price_version,
    row.adjustment_version,
    row.basic_version,
    row.limit_version,
    row.lifecycle_version,
    row.sector_version,
  ])
  return {
    symbol: row.symbol,
    tradingDate: row.trade_date,
    open: rounded(numberOf(row.open_price, `${row.trade_date}:${row.symbol}.open`) * factor),
    high: rounded(numberOf(row.high_price, `${row.trade_date}:${row.symbol}.high`) * factor),
    low: rounded(numberOf(row.low_price, `${row.trade_date}:${row.symbol}.low`) * factor),
    close: rounded(rawClose * factor),
    volume: numberOf(row.volume, `${row.trade_date}:${row.symbol}.volume`),
    amount: numberOf(row.amount, `${row.trade_date}:${row.symbol}.amount`),
    turnoverRate: rounded(numberOf(row.turnover_rate, `${row.trade_date}:${row.symbol}.turnover_rate`) / 100),
    adjustmentFactor: factor,
    tradingStatus: row.list_status === 'D' && row.delist_date !== null && row.delist_date <= row.trade_date ? 'delisting' : 'trading',
    limitStatus: rawClose >= upLimit ? 'limit-up' : rawClose <= downLimit ? 'limit-down' : 'none',
    listingDays: daysInclusive(row.list_date, row.trade_date),
    qualityFlags: [
      ...row.list_status === null ? ['lifecycle-inferred-from-observed-bar'] : [],
      ...row.pre_close_derived === 1 ? ['pre-close-derived-from-previous-session'] : [],
      ...row.pre_close === null ? ['pre-close-unavailable-no-history'] : [],
      ...row.sector_id === null ? ['point-in-time-sector-unavailable'] : [],
    ],
    provenance: provenance(
      'daily_price_bar+daily_adjustment_factor+daily_basic_factor+daily_price_limit+security_lifecycle',
      LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION,
      retrievedAt,
      `${row.trade_date}:${row.symbol}`,
      [
        'hfq-price=raw-price*adj-factor',
        'turnover-ratio=turnover-rate-percent/100',
        'volume-and-amount-unadjusted',
        ...row.pre_close_derived === 1 ? ['missing-limit-pre-close=previous-session-raw-close'] : [],
      ],
    ),
  }
}

function executionBar(row: HistoryDailyRow): DailyExecutionBar {
  return {
    symbol: row.symbol,
    tradingDate: row.trade_date,
    open: numberOf(row.open_price, `${row.trade_date}:${row.symbol}.raw-open`),
    high: numberOf(row.high_price, `${row.trade_date}:${row.symbol}.raw-high`),
    low: numberOf(row.low_price, `${row.trade_date}:${row.symbol}.raw-low`),
    close: numberOf(row.close_price, `${row.trade_date}:${row.symbol}.raw-close`),
    upLimit: numberOf(row.up_limit, `${row.trade_date}:${row.symbol}.up-limit`),
    downLimit: numberOf(row.down_limit, `${row.trade_date}:${row.symbol}.down-limit`),
    tradingStatus: row.list_status === 'D' && row.delist_date !== null && row.delist_date <= row.trade_date ? 'delisting' : 'trading',
  }
}

function sectors(date: string, rows: readonly HistoryDailyRow[]): SectorDailySnapshot[] {
  const groups = new Map<string, [HistoryDailyRow, ...HistoryDailyRow[]]>()
  for (const row of rows) {
    if (row.sector_id === null || row.pre_close === null || numberOf(row.pre_close, `${date}:${row.symbol}.pre_close`) <= 0) continue
    const existing = groups.get(row.sector_id)
    if (existing === undefined) groups.set(row.sector_id, [row])
    else existing.push(row)
  }
  return [...groups.entries()].map(([sectorId, members]) => {
    const observations = members.map((row) => {
      const previous = numberOf(row.pre_close, `${date}:${row.symbol}.pre_close`)
      const close = numberOf(row.close_price, `${date}:${row.symbol}.close`)
      return { row, previous, change: close / previous - 1 }
    })
    const meanRelative = (field: 'open_price' | 'high_price' | 'low_price' | 'close_price'): number =>
      rounded(observations.reduce((sum, item) => sum + numberOf(item.row[field], `${date}:${item.row.symbol}.${field}`) / item.previous, 0) / observations.length * 100)
    const retrievedAt = latest(members.flatMap(row => [row.price_version, row.sector_version]))
    return {
      sectorId,
      name: members[0].sector_name ?? sectorId,
      tradingDate: date,
      open: meanRelative('open_price'),
      high: meanRelative('high_price'),
      low: meanRelative('low_price'),
      close: meanRelative('close_price'),
      amount: observations.reduce((sum, item) => sum + numberOf(item.row.amount, `${date}:${item.row.symbol}.amount`), 0),
      advancingRatio: observations.filter(item => item.change > 0).length / observations.length,
      limitUpCount: observations.filter(item => numberOf(item.row.close_price, `${date}:${item.row.symbol}.close`) >= numberOf(item.row.up_limit, `${date}:${item.row.symbol}.up_limit`)).length,
      dispersion: rounded(standardDeviation(observations.map(item => item.change))),
      leaders: [...observations]
        .sort((left, right) => right.change - left.change || left.row.symbol.localeCompare(right.row.symbol))
        .slice(0, 3)
        .map(item => item.row.symbol),
      members: members.map(row => ({
        symbol: row.symbol,
        effectiveFrom: row.in_date as string,
        effectiveTo: row.out_date,
      })).sort((left, right) => left.symbol.localeCompare(right.symbol)),
      provenance: provenance(
        'daily_price_bar+daily_price_limit+security_industry_period',
        LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION,
        retrievedAt,
        `${date}:${sectorId}`,
        ['sector-relative-level=mean(raw-price/pre-close)*100', 'point-in-time-industry-membership'],
      ),
    }
  }).sort((left, right) => left.sectorId.localeCompare(right.sectorId))
}

function benchmarkReturns(
  date: string,
  rows: readonly HistoryDailyRow[],
  indices: readonly HistoryIndexRow[],
): readonly DailyBenchmarkReturn[] {
  const eligible = rows.filter(row => row.pre_close !== null && numberOf(row.pre_close, `${date}:${row.symbol}.pre_close`) > 0)
  if (eligible.length === 0) throw new MarketTacticHistoryMysqlError(`${date} has no equal-weight benchmark observations`)
  const equalWeightReturn = rounded(eligible.reduce((sum, row) => (
    sum + numberOf(row.close_price, `${date}:${row.symbol}.close`) / numberOf(row.pre_close, `${date}:${row.symbol}.pre_close`) - 1
  ), 0) / eligible.length)
  const equalWeightVersion = latest(eligible.map(row => row.price_version))
  return [
    ...indices.map((row): DailyBenchmarkReturn => {
      const previous = numberOf(row.previous_close, `${date}:${row.symbol}.previous_close`)
      if (previous <= 0) throw new MarketTacticHistoryMysqlError(`${date}:${row.symbol}.previous_close must be positive`)
      return {
        benchmarkId: row.symbol,
        name: row.name,
        kind: 'market_index',
        tradingDate: date,
        dailyReturn: rounded(numberOf(row.close_price, `${date}:${row.symbol}.close`) / previous - 1),
        provenance: provenance('market_index_daily_bar', row.fetched_at, row.fetched_at, `${date}:${row.symbol}`, [
          'return=close/previous-session-close-1',
        ]),
      }
    }),
    {
      benchmarkId: 'equal_weight_a_share',
      name: 'A-share equal-weight quality universe',
      kind: 'equal_weight_universe' as const,
      tradingDate: date,
      dailyReturn: equalWeightReturn,
      provenance: provenance('daily_price_bar', equalWeightVersion, equalWeightVersion, `${date}:equal-weight`, [
        'return=mean(raw-close/pre-close-1)',
        ...eligible.some(row => row.pre_close_derived === 1) ? ['missing-limit-pre-close=previous-session-raw-close'] : [],
        'missing-pre-close=excluded',
      ]),
    },
  ].sort((left, right) => left.benchmarkId.localeCompare(right.benchmarkId))
}

function featureSession(
  date: string,
  rows: readonly HistoryDailyRow[],
  indices: readonly HistoryIndexRow[],
  versions: readonly string[],
): DailyHistorySnapshot {
  const stocks = rows.map(stock).sort((left, right) => left.symbol.localeCompare(right.symbol))
  const sectorRows = sectors(date, rows)
  const benchmarks = benchmarkReturns(date, rows, indices)
  const identityInput: MarketSnapshotIdentityInput = {
    tradingDate: date,
    cutoffTime: latest([...rows.flatMap(row => [
      row.price_version,
      row.adjustment_version,
      row.basic_version,
      row.limit_version,
      row.lifecycle_version,
      row.sector_version,
    ]), ...indices.map(row => row.fetched_at)]),
    calendarVersion: 'quality-gated-daily-price-v1',
    adjustmentVersion: `hfq:${latest(rows.map(row => row.adjustment_version))}`,
    sectorClassificationVersion: `sw-l1:${latest(rows.map(row => row.sector_version)) || 'unavailable'}`,
    sourceVersions: [...versions],
  }
  const hash = contentHash({ identity: identityInput, stocks, sectors: sectorRows, benchmarks })
  return { identity: { ...identityInput, contentHash: hash }, stocks, sectors: sectorRows, benchmarks }
}

function executionSession(date: string, rows: readonly HistoryDailyRow[], versions: readonly string[]): DailyExecutionSession {
  const bars = rows.map(executionBar).sort((left, right) => left.symbol.localeCompare(right.symbol))
  return {
    tradingDate: date,
    contentHash: contentHash({ schemaVersion: 1, tradingDate: date, sourceVersions: [...versions], bars }),
    bars,
  }
}

function attachSectors(rows: readonly HistoryDailyCoreRow[], memberships: readonly HistorySectorRow[]): HistoryDailyRow[] {
  const bySymbol = new Map<string, HistorySectorRow[]>()
  for (const membership of memberships) {
    bySymbol.set(membership.symbol, [...bySymbol.get(membership.symbol) ?? [], membership])
  }
  for (const candidates of bySymbol.values()) {
    candidates.sort((left, right) =>
      (right.in_date ?? '').localeCompare(left.in_date ?? '')
      || (right.sector_version ?? '').localeCompare(left.sector_version ?? '')
      || left.sector_id.localeCompare(right.sector_id))
  }
  return rows.map((row) => {
    const membership = bySymbol.get(row.symbol)?.find(candidate =>
      candidate.in_date !== null
      && candidate.in_date <= row.trade_date
      && (candidate.out_date === null || candidate.out_date >= row.trade_date))
    return {
      ...row,
      sector_id: membership?.sector_id ?? null,
      sector_name: membership?.sector_name ?? null,
      in_date: membership?.in_date ?? null,
      out_date: membership?.out_date ?? null,
      sector_source: membership?.sector_source ?? null,
      sector_version: membership?.sector_version ?? null,
    }
  })
}

function applyPreviousCloses(
  rows: readonly HistoryDailyCoreRow[],
  previousBySymbol: Map<string, HistoryPreviousCloseRow>,
): HistoryDailyCoreRow[] {
  return rows.map((row) => {
    const previous = previousBySymbol.get(row.symbol)
    const resolved = row.pre_close === null && previous !== undefined
      ? {
        ...row,
        pre_close: previous.close_price,
        pre_close_derived: 1,
        price_version: latest([row.price_version, previous.price_version]),
      }
      : row
    previousBySymbol.set(row.symbol, {
      symbol: row.symbol,
      close_price: row.close_price,
      price_version: row.price_version,
    })
    return resolved
  })
}

function validateRequest(request: TacticLabHistoryRequest): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(request.startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(request.endDate)) {
    throw new MarketTacticHistoryMysqlError('dates must use YYYY-MM-DD')
  }
  if (request.startDate > request.endDate) throw new MarketTacticHistoryMysqlError('startDate exceeds endDate')
  if (!Number.isSafeInteger(request.chunkSessions) || request.chunkSessions < 1 || request.chunkSessions > 60) {
    throw new MarketTacticHistoryMysqlError('chunkSessions must be an integer from 1 to 60')
  }
  if (!Number.isSafeInteger(request.minimumStocks) || request.minimumStocks < 1) {
    throw new MarketTacticHistoryMysqlError('minimumStocks must be a positive integer')
  }
}

/** Streaming read-only adapter for the existing quality-gated A-share daily tables. */
export class LongShortStockTacticHistoryAdapter implements TacticLabHistoryAdapter {
  readonly name = 'long-short-stock-history-mysql'

  constructor(private readonly query: MarketSnapshotQuery) {}

  /**
   * Load complete historical sessions in bounded chunks without retaining the full universe in memory.
   * @param request - Inclusive date range, chunk bound, and stock-count quality floor.
   * @returns Async stream of immutable paired feature/execution chunks.
   */
  async *load(request: TacticLabHistoryRequest): AsyncIterable<TacticLabHistoryChunk> {
    validateRequest(request)
    const dates = await this.query.rows<AvailableHistoryDateRow>(HISTORY_DATES_SQL, [
      request.startDate,
      request.endDate,
      request.minimumStocks,
    ])
    if (dates.length === 0) throw new MarketTacticHistoryMysqlError('no complete sessions matched the requested range')
    const previousRows = await this.query.rows<HistoryPreviousCloseRow>(HISTORY_PREVIOUS_CLOSE_SQL, [
      dates[0]?.trading_date,
    ])
    const previousBySymbol = new Map(previousRows.map(row => [row.symbol, row]))
    for (let offset = 0; offset < dates.length; offset += request.chunkSessions) {
      const slice = dates.slice(offset, offset + request.chunkSessions)
      const start = dates[offset]?.trading_date
      const end = dates[Math.min(offset + request.chunkSessions, dates.length) - 1]?.trading_date
      if (start === undefined || end === undefined) throw new MarketTacticHistoryMysqlError('date chunk is incomplete')
      const sourceRows = await this.query.rows<HistoryDailyCoreRow>(HISTORY_DAILY_SQL, [start, end])
      const coreRows = applyPreviousCloses(sourceRows, previousBySymbol)
      const memberships = await this.query.rows<HistorySectorRow>(HISTORY_SECTOR_SQL, [end, start])
      const indexRows = await this.query.rows<HistoryIndexRow>(HISTORY_INDEX_SQL, [start, end])
      const rows = attachSectors(coreRows, memberships)
      const byDate = new Map<string, HistoryDailyRow[]>()
      for (const row of rows) byDate.set(row.trade_date, [...byDate.get(row.trade_date) ?? [], row])
      const indicesByDate = new Map<string, HistoryIndexRow[]>()
      for (const row of indexRows) indicesByDate.set(row.trade_date, [...indicesByDate.get(row.trade_date) ?? [], row])
      const completeSessions: { date: string; rows: HistoryDailyRow[] }[] = []
      for (const expected of slice) {
        const sessionRows = byDate.get(expected.trading_date)
        const count = sessionRows?.length ?? 0
        const expectedRows = numberOf(expected.expected_rows, `${expected.trading_date}.expected_rows`)
        if (sessionRows === undefined || count !== expectedRows) {
          throw new MarketTacticHistoryMysqlError(`${expected.trading_date} joined ${String(count)} rows; daily source contains ${String(expectedRows)}`)
        }
        completeSessions.push({ date: expected.trading_date, rows: sessionRows })
      }
      for (const expected of slice) {
        const observed = indicesByDate.get(expected.trading_date) ?? []
        const symbols = observed.map(row => row.symbol).sort()
        if (symbols.join('\n') !== [...MAOQ_HISTORY_BENCHMARK_INDEX_SYMBOLS].sort().join('\n')) {
          throw new MarketTacticHistoryMysqlError(`${expected.trading_date} benchmark indices are incomplete`)
        }
      }
      const versions = sourceVersions(rows, indexRows)
      yield buildTacticLabHistoryChunk({
        adapterVersion: LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION,
        sourceVersions: versions,
        featureSessions: completeSessions.map(item => featureSession(
          item.date,
          item.rows,
          indicesByDate.get(item.date) as HistoryIndexRow[],
          versions,
        )),
        executionSessions: completeSessions.map(item => executionSession(item.date, item.rows, versions)),
      })
    }
  }
}
