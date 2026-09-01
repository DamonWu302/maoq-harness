import type { SectorDailySnapshot, StockDailyBar } from '@deepseek-ai/dsh-market-snapshot'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_LAB_FEATURE_ENGINE_VERSION,
  TACTIC_LAB_FEATURE_SCHEMA_VERSION,
  type DailyHistoryFeatureRecord,
  type DailyHistorySnapshot,
  type DailyStockResearchFeatures,
} from './types.ts'
import { computeDailySectorResearchFeatures, DailyHistoryFeatureError } from './history.ts'

interface StreamObservation {
  readonly sessionIndex: number
  readonly snapshotHash: string
  readonly bar: StockDailyBar
  readonly sectorId: string | null
  readonly sectorClose: number | null
}

interface SymbolStream {
  readonly observations: StreamObservation[]
  contiguousSessions: number
}

function rounded(value: number): number {
  return Number(value.toFixed(12))
}

function ratioReturn(current: number, previous: number): number | null {
  return current > 0 && previous > 0 ? rounded(current / previous - 1) : null
}

function memberships(snapshot: DailyHistorySnapshot): ReadonlyMap<string, SectorDailySnapshot> {
  const result = new Map<string, SectorDailySnapshot>()
  const date = snapshot.identity.tradingDate
  for (const sector of snapshot.sectors) {
    for (const member of sector.members) {
      if (member.effectiveFrom > date || (member.effectiveTo !== null && member.effectiveTo < date)) continue
      if (result.has(member.symbol)) throw new DailyHistoryFeatureError(`${member.symbol} has multiple sectors on ${date}`)
      result.set(member.symbol, sector)
    }
  }
  return result
}

function exactWindow(
  observations: readonly StreamObservation[],
  sessions: number,
  currentIndex: number,
): readonly StreamObservation[] | undefined {
  if (observations.length < sessions) return undefined
  const window = observations.slice(-sessions)
  return window[0]?.sessionIndex === currentIndex - sessions + 1 ? window : undefined
}

function returnAt(observations: readonly StreamObservation[], lookback: number, currentIndex: number): number | null {
  const window = exactWindow(observations, lookback + 1, currentIndex)
  const first = window?.[0]
  const current = window?.at(-1)
  return first === undefined || current === undefined ? null : ratioReturn(current.bar.close, first.bar.close)
}

function meanAt(
  observations: readonly StreamObservation[],
  sessions: number,
  currentIndex: number,
  value: (bar: StockDailyBar) => number,
): number | null {
  const window = exactWindow(observations, sessions, currentIndex)
  if (window === undefined) return null
  return rounded(window.reduce((sum, observation) => sum + value(observation.bar), 0) / sessions)
}

function realizedVolatility20(
  observations: readonly StreamObservation[],
  currentIndex: number,
): number | null {
  const window = exactWindow(observations, 21, currentIndex)
  if (window === undefined) return null
  const values = window.slice(1).map((observation, index) => (
    ratioReturn(observation.bar.close, (window[index] as StreamObservation).bar.close)
  ))
  if (values.some(value => value === null)) return null
  const returns = values as number[]
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length
  return rounded(Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1)))
}

function distanceFromHigh(observations: readonly StreamObservation[], sessions: number, currentIndex: number): number | null {
  const window = exactWindow(observations, sessions, currentIndex)
  const current = window?.at(-1)
  if (window === undefined || current === undefined) return null
  return ratioReturn(current.bar.close, Math.max(...window.map(observation => observation.bar.high)))
}

function sectorRelativeReturn(
  observations: readonly StreamObservation[],
  lookback: number,
  currentIndex: number,
  sectorId: string | null,
): number | null {
  if (sectorId === null) return null
  const window = exactWindow(observations, lookback + 1, currentIndex)
  if (window === undefined || window.some(observation => observation.sectorId !== sectorId || observation.sectorClose === null)) return null
  const first = window[0] as StreamObservation
  const current = window.at(-1) as StreamObservation
  const stockReturn = ratioReturn(current.bar.close, first.bar.close)
  if (stockReturn === null) return null
  const sectorReturn = rounded(window.slice(1).reduce((growth, observation) => growth * (observation.sectorClose as number) / 100, 1) - 1)
  return rounded(stockReturn - sectorReturn)
}

function limitUpStreak(observations: readonly StreamObservation[]): number {
  let count = 0
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (observations[index]?.bar.limitStatus !== 'limit-up') break
    count += 1
  }
  return count
}

function evidenceRefs(observations: readonly StreamObservation[], currentIndex: number): readonly string[] {
  const wanted = new Set([currentIndex, currentIndex - 1, currentIndex - 5, currentIndex - 20, currentIndex - 60, currentIndex - 251])
  return observations
    .filter(observation => wanted.has(observation.sessionIndex))
    .map(observation => `snapshot:${observation.snapshotHash}#stocks/${observation.bar.symbol}`)
    .sort()
}

function featureFor(stream: SymbolStream, currentIndex: number): DailyStockResearchFeatures {
  const observations = stream.observations
  const current = observations.at(-1) as StreamObservation
  const turnoverMean5 = meanAt(observations, 5, currentIndex, bar => bar.turnoverRate)
  const turnoverMean20 = meanAt(observations, 20, currentIndex, bar => bar.turnoverRate)
  const limitWindow = exactWindow(observations, 20, currentIndex)
  return {
    symbol: current.bar.symbol,
    tradingDate: current.bar.tradingDate,
    historySessions: stream.contiguousSessions,
    sectorId: current.sectorId,
    adjustedReturn1: returnAt(observations, 1, currentIndex),
    adjustedReturn5: returnAt(observations, 5, currentIndex),
    adjustedReturn20: returnAt(observations, 20, currentIndex),
    adjustedReturn60: returnAt(observations, 60, currentIndex),
    realizedVolatility20: realizedVolatility20(observations, currentIndex),
    distanceFromHigh20: distanceFromHigh(observations, 20, currentIndex),
    distanceFromHigh252: distanceFromHigh(observations, 252, currentIndex),
    sectorRelativeReturn5: sectorRelativeReturn(observations, 5, currentIndex, current.sectorId),
    sectorRelativeReturn20: sectorRelativeReturn(observations, 20, currentIndex, current.sectorId),
    turnoverMean5,
    turnoverMean20,
    turnover5To20Ratio: turnoverMean5 === null || turnoverMean20 === null || turnoverMean20 === 0
      ? null
      : rounded(turnoverMean5 / turnoverMean20),
    amountMean20: meanAt(observations, 20, currentIndex, bar => bar.amount),
    consecutiveLimitUpSessions: limitUpStreak(observations),
    limitUpSessions20: limitWindow?.filter(observation => observation.bar.limitStatus === 'limit-up').length ?? 0,
    tradingStatus: current.bar.tradingStatus,
    limitStatus: current.bar.limitStatus,
    listingDays: current.bar.listingDays,
    evidenceRefs: evidenceRefs(observations, currentIndex),
  }
}

/** Incremental daily feature engine for multi-year full-universe research replay. */
export class DailyHistoryFeatureStream {
  private readonly hashes: string[] = []
  private readonly symbols = new Map<string, SymbolStream>()
  private readonly sectorSnapshots: DailyHistorySnapshot[] = []
  private previousDate: string | undefined

  /**
   * Add one strictly ascending immutable session and compute its complete cross-section in one pass.
   * @param snapshot - Next point-in-time adjusted feature session.
   * @returns Frozen features with the same semantics as `computeDailyHistoryFeatures()`.
   */
  push(snapshot: DailyHistorySnapshot): DailyHistoryFeatureRecord {
    const date = snapshot.identity.tradingDate
    if (!/^[a-f0-9]{64}$/u.test(snapshot.identity.contentHash)) {
      throw new DailyHistoryFeatureError(`${date} content hash is not SHA-256`)
    }
    if (this.previousDate !== undefined && this.previousDate >= date) {
      throw new DailyHistoryFeatureError(`stream date ${date} is not later than ${this.previousDate}`)
    }
    const stockSymbols = snapshot.stocks.map(bar => bar.symbol)
    if (new Set(stockSymbols).size !== stockSymbols.length) {
      throw new DailyHistoryFeatureError('current snapshot contains duplicate symbols')
    }
    const sessionIndex = this.hashes.length
    const sectors = memberships(snapshot)
    this.hashes.push(snapshot.identity.contentHash)
    this.sectorSnapshots.push(snapshot)
    if (this.sectorSnapshots.length > 20) this.sectorSnapshots.shift()
    this.previousDate = date
    for (const bar of snapshot.stocks) {
      const stream = this.symbols.get(bar.symbol) ?? { observations: [], contiguousSessions: 0 }
      const previousIndex = stream.observations.at(-1)?.sessionIndex
      stream.contiguousSessions = previousIndex === sessionIndex - 1 ? stream.contiguousSessions + 1 : 1
      const sector = sectors.get(bar.symbol)
      stream.observations.push({
        sessionIndex,
        snapshotHash: snapshot.identity.contentHash,
        bar,
        sectorId: sector?.sectorId ?? null,
        sectorClose: sector?.close ?? null,
      })
      if (stream.observations.length > 252) stream.observations.shift()
      this.symbols.set(bar.symbol, stream)
    }
    const stocks = [...stockSymbols].sort().map((symbol) => {
      return featureFor(this.symbols.get(symbol) as SymbolStream, sessionIndex)
    })
    const sectorFeatures = computeDailySectorResearchFeatures(this.sectorSnapshots)
    return deepFreeze({
      schemaVersion: TACTIC_LAB_FEATURE_SCHEMA_VERSION,
      engineVersion: TACTIC_LAB_FEATURE_ENGINE_VERSION,
      currentSnapshotHash: snapshot.identity.contentHash,
      inputSnapshotHashes: [...this.hashes],
      tradingDate: date,
      sessions: this.hashes.length,
      stocks,
      sectors: sectorFeatures.sectors,
      sectorCorrelations20: sectorFeatures.correlations,
    })
  }
}
