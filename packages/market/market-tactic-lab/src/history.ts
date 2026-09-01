import type { SectorDailySnapshot, StockDailyBar } from '@deepseek-ai/dsh-market-snapshot'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_LAB_FEATURE_ENGINE_VERSION,
  TACTIC_LAB_FEATURE_SCHEMA_VERSION,
  type DailyHistoryFeatureRecord,
  type DailyHistorySnapshot,
  type DailySectorCorrelation20,
  type DailySectorResearchFeatures,
  type DailyStockResearchFeatures,
} from './types.ts'

/** Rejected point-in-time history input. */
export class DailyHistoryFeatureError extends Error {
  /** Stable machine-readable category. */
  readonly code = 'MAOQ_DAILY_HISTORY_REJECTED' as const

  constructor(message: string) {
    super(`MAOQ daily history rejected: ${message}`)
    this.name = 'DailyHistoryFeatureError'
  }
}

interface SessionObservation {
  readonly snapshot: DailyHistorySnapshot
  readonly bar: StockDailyBar | undefined
}

function rounded(value: number): number {
  return Number(value.toFixed(12))
}

function adjusted(bar: StockDailyBar, field: 'close' | 'high'): number {
  return bar[field]
}

function ratioReturn(current: number, previous: number): number | null {
  if (!(current > 0) || !(previous > 0)) return null
  return rounded(current / previous - 1)
}

function last<T>(values: readonly T[]): T | undefined {
  return values.at(-1)
}

function exactWindow(series: readonly SessionObservation[], sessions: number): readonly SessionObservation[] | undefined {
  if (sessions < 1 || series.length < sessions) return undefined
  const window = series.slice(-sessions)
  return window.every(observation => observation.bar !== undefined) ? window : undefined
}

function returnAt(series: readonly SessionObservation[], lookback: number): number | null {
  const window = exactWindow(series, lookback + 1)
  const current = last(window ?? [])?.bar
  const anchor = window?.[0]?.bar
  if (current === undefined || anchor === undefined) return null
  return ratioReturn(adjusted(current, 'close'), adjusted(anchor, 'close'))
}

function meanAt(
  series: readonly SessionObservation[],
  sessions: number,
  value: (bar: StockDailyBar) => number,
): number | null {
  const window = exactWindow(series, sessions)
  if (window === undefined) return null
  return rounded(window.reduce((sum, observation) => sum + value(observation.bar as StockDailyBar), 0) / sessions)
}

function sampleVolatility(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return rounded(Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)))
}

function stockVolatility20(series: readonly SessionObservation[]): number | null {
  const window = exactWindow(series, 21)
  if (window === undefined) return null
  const returns = window.slice(1).map((observation, index) => {
    const previous = window[index]?.bar
    return previous === undefined ? null : ratioReturn((observation.bar as StockDailyBar).close, previous.close)
  })
  return returns.some(value => value === null) ? null : sampleVolatility(returns as number[])
}

function distanceFromHigh(series: readonly SessionObservation[], sessions: number): number | null {
  const window = exactWindow(series, sessions)
  const current = last(window ?? [])?.bar
  if (window === undefined || current === undefined) return null
  const high = Math.max(...window.map(observation => adjusted(observation.bar as StockDailyBar, 'high')))
  return ratioReturn(adjusted(current, 'close'), high)
}

function activeMember(sector: SectorDailySnapshot, symbol: string, date: string): boolean {
  return sector.members.some(member => member.symbol === symbol
    && member.effectiveFrom <= date
    && (member.effectiveTo === null || member.effectiveTo >= date))
}

function sectorFor(snapshot: DailyHistorySnapshot, symbol: string): SectorDailySnapshot | undefined {
  const matches = snapshot.sectors.filter(sector => activeMember(sector, symbol, snapshot.identity.tradingDate))
  if (matches.length > 1) throw new DailyHistoryFeatureError(`${symbol} has multiple sectors on ${snapshot.identity.tradingDate}`)
  return matches[0]
}

function sectorRelativeReturn(series: readonly SessionObservation[], lookback: number, sectorId: string | null): number | null {
  if (sectorId === null) return null
  const window = exactWindow(series, lookback + 1)
  if (window === undefined) return null
  const sectors = window.map(observation => sectorFor(observation.snapshot, (observation.bar as StockDailyBar).symbol))
  if (sectors.some(sector => sector?.sectorId !== sectorId)) return null
  const currentBar = last(window)?.bar
  const anchorBar = window[0]?.bar
  if (currentBar === undefined || anchorBar === undefined) return null
  const stockReturn = ratioReturn(adjusted(currentBar, 'close'), adjusted(anchorBar, 'close'))
  const sectorReturn = rounded(sectors.slice(1).reduce((growth, sector) => growth * ((sector as SectorDailySnapshot).close / 100), 1) - 1)
  return stockReturn === null ? null : rounded(stockReturn - sectorReturn)
}

function limitUpStreak(series: readonly SessionObservation[]): number {
  let count = 0
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const bar = series[index]?.bar
    if (bar?.limitStatus !== 'limit-up') break
    count += 1
  }
  return count
}

function limitUpCount(series: readonly SessionObservation[], sessions: number): number {
  const window = exactWindow(series, sessions)
  return window?.filter(observation => observation.bar?.limitStatus === 'limit-up').length ?? 0
}

function contiguousSessions(series: readonly SessionObservation[]): number {
  let count = 0
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index]?.bar === undefined) break
    count += 1
  }
  return count
}

function ref(observation: SessionObservation, symbol: string): string {
  return `snapshot:${observation.snapshot.identity.contentHash}#stocks/${symbol}`
}

function evidenceRefs(series: readonly SessionObservation[], symbol: string): readonly string[] {
  const indices = [series.length - 1, series.length - 2, series.length - 6, series.length - 21, series.length - 61, series.length - 252]
  return [...new Set(indices
    .filter(index => index >= 0)
    .map(index => series[index])
    .filter((value): value is SessionObservation => value?.bar !== undefined)
    .map(observation => ref(observation, symbol)))].sort()
}

function featureFor(symbol: string, snapshots: readonly DailyHistorySnapshot[]): DailyStockResearchFeatures {
  const series = snapshots.map(snapshot => ({
    snapshot,
    bar: snapshot.stocks.find(bar => bar.symbol === symbol),
  }))
  const current = last(series)?.bar
  if (current === undefined) throw new DailyHistoryFeatureError(`${symbol} is absent from the current snapshot`)
  const currentSnapshot = last(snapshots) as DailyHistorySnapshot
  const sectorId = sectorFor(currentSnapshot, symbol)?.sectorId ?? null
  const turnoverMean5 = meanAt(series, 5, bar => bar.turnoverRate)
  const turnoverMean20 = meanAt(series, 20, bar => bar.turnoverRate)
  return {
    symbol,
    tradingDate: current.tradingDate,
    historySessions: contiguousSessions(series),
    sectorId,
    adjustedReturn1: returnAt(series, 1),
    adjustedReturn5: returnAt(series, 5),
    adjustedReturn20: returnAt(series, 20),
    adjustedReturn60: returnAt(series, 60),
    realizedVolatility20: stockVolatility20(series),
    distanceFromHigh20: distanceFromHigh(series, 20),
    distanceFromHigh252: distanceFromHigh(series, 252),
    sectorRelativeReturn5: sectorRelativeReturn(series, 5, sectorId),
    sectorRelativeReturn20: sectorRelativeReturn(series, 20, sectorId),
    turnoverMean5,
    turnoverMean20,
    turnover5To20Ratio: turnoverMean5 === null || turnoverMean20 === null || turnoverMean20 === 0
      ? null
      : rounded(turnoverMean5 / turnoverMean20),
    amountMean20: meanAt(series, 20, bar => bar.amount),
    consecutiveLimitUpSessions: limitUpStreak(series),
    limitUpSessions20: limitUpCount(series, 20),
    tradingStatus: current.tradingStatus,
    limitStatus: current.limitStatus,
    listingDays: current.listingDays,
    evidenceRefs: evidenceRefs(series, symbol),
  }
}

function sectorDailyReturn(sector: SectorDailySnapshot): number {
  return rounded(sector.close / 100 - 1)
}

function correlation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
  const covariance = left.reduce((sum, value, index) => sum + (value - leftMean) * ((right[index] as number) - rightMean), 0)
  const leftScale = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0))
  const rightScale = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0))
  return leftScale === 0 || rightScale === 0 ? null : rounded(covariance / leftScale / rightScale)
}

/**
 * Compute bounded sector features shared by batch and incremental stock engines.
 *
 * @param input Ordered daily snapshots ending at the decision session.
 * @returns Current sector features and canonical pairwise 20-session correlations.
 */
export function computeDailySectorResearchFeatures(input: readonly DailyHistorySnapshot[]): {
  readonly sectors: readonly DailySectorResearchFeatures[]
  readonly correlations: readonly DailySectorCorrelation20[]
} {
  const current = input.at(-1)
  if (current === undefined) return { sectors: [], correlations: [] }
  const returns = new Map<string, number[]>()
  for (const snapshot of input.slice(-20)) {
    for (const sector of snapshot.sectors) {
      returns.set(sector.sectorId, [...returns.get(sector.sectorId) ?? [], sectorDailyReturn(sector)])
    }
  }
  const sectors = current.sectors.map((sector): DailySectorResearchFeatures => {
    const values = returns.get(sector.sectorId) ?? []
    return {
      sectorId: sector.sectorId,
      historySessions: values.length,
      adjustedReturn1: sectorDailyReturn(sector),
      adjustedReturn20: values.length === 20 ? rounded(values.reduce((growth, value) => growth * (1 + value), 1) - 1) : null,
      realizedVolatility20: values.length === 20 ? sampleVolatility(values) : null,
      advancingRatio: sector.advancingRatio,
      amount: sector.amount,
      dispersion: sector.dispersion,
      leaders: [...sector.leaders],
    }
  }).sort((left, right) => left.sectorId.localeCompare(right.sectorId))
  const complete = sectors.filter(sector => sector.historySessions === 20).map(sector => sector.sectorId)
  const correlations: DailySectorCorrelation20[] = []
  for (let leftIndex = 0; leftIndex < complete.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < complete.length; rightIndex += 1) {
      const leftSectorId = complete[leftIndex] as string
      const rightSectorId = complete[rightIndex] as string
      const value = correlation(returns.get(leftSectorId) as number[], returns.get(rightSectorId) as number[])
      if (value !== null) correlations.push({ leftSectorId, rightSectorId, correlation: value })
    }
  }
  return { sectors, correlations }
}

function normalizeSnapshots(input: readonly DailyHistorySnapshot[]): readonly DailyHistorySnapshot[] {
  if (input.length === 0) throw new DailyHistoryFeatureError('at least one snapshot is required')
  const snapshots = [...input].sort((left, right) => left.identity.tradingDate.localeCompare(right.identity.tradingDate))
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index] as DailyHistorySnapshot
    if (!/^[a-f0-9]{64}$/u.test(snapshot.identity.contentHash)) {
      throw new DailyHistoryFeatureError(`${snapshot.identity.tradingDate} content hash is not SHA-256`)
    }
    if (index > 0 && snapshots[index - 1]?.identity.tradingDate === snapshot.identity.tradingDate) {
      throw new DailyHistoryFeatureError(`duplicate trading date ${snapshot.identity.tradingDate}`)
    }
  }
  return snapshots
}

/**
 * Compute point-in-time daily stock research measurements at the newest supplied snapshot.
 * @param input - Immutable daily snapshots ending at the intended decision date.
 * @returns Frozen, replay-stable features ordered by symbol.
 */
export function computeDailyHistoryFeatures(input: readonly DailyHistorySnapshot[]): DailyHistoryFeatureRecord {
  const snapshots = normalizeSnapshots(input)
  const current = last(snapshots) as DailyHistorySnapshot
  const symbols = current.stocks.map(bar => bar.symbol).sort()
  if (new Set(symbols).size !== symbols.length) throw new DailyHistoryFeatureError('current snapshot contains duplicate symbols')
  const sectorFeatures = computeDailySectorResearchFeatures(snapshots)
  return deepFreeze({
    schemaVersion: TACTIC_LAB_FEATURE_SCHEMA_VERSION,
    engineVersion: TACTIC_LAB_FEATURE_ENGINE_VERSION,
    currentSnapshotHash: current.identity.contentHash,
    inputSnapshotHashes: snapshots.map(snapshot => snapshot.identity.contentHash),
    tradingDate: current.identity.tradingDate,
    sessions: snapshots.length,
    stocks: symbols.map(symbol => featureFor(symbol, snapshots)),
    sectors: sectorFeatures.sectors,
    sectorCorrelations20: sectorFeatures.correlations,
  })
}
