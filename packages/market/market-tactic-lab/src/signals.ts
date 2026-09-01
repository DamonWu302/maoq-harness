import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  ACTIVE_TACTIC_IDS,
  tacticDefinitions,
  type ActiveTacticId,
} from '@deepseek-ai/dsh-market-tactic-eligibility'
import type { DailyHistoryFeatureRecord, DailyStockResearchFeatures } from './types.ts'

/** Implemented deterministic MAOQ stock-selection tactics compared by P3. */
export type ResearchTacticId = ActiveTacticId

const catalogVersions = new Map(tacticDefinitions().map(definition => [definition.tacticId, definition.tacticVersion]))

function tacticVersion(tacticId: ResearchTacticId): string {
  const version = catalogVersions.get(tacticId)
  if (version === undefined) throw new Error(`missing catalog version for research tactic ${tacticId}`)
  return version
}

/** Stable implementation identities. Parameter changes require a new version. */
export const RESEARCH_TACTIC_VERSIONS: Readonly<Record<ResearchTacticId, string>> = deepFreeze(Object.fromEntries(
  ACTIVE_TACTIC_IDS.map(tacticId => [tacticId, tacticVersion(tacticId)]),
) as Record<ResearchTacticId, string>)

/** One ranked stock whose complete deterministic gates passed at the close. */
export interface ResearchTacticCandidate {
  readonly symbol: string
  readonly score: number
  /** Point-in-time 20-session mean amount used only for capacity evidence. */
  readonly amountMean20: number
  readonly evidenceRefs: readonly string[]
}

/** Replay-stable signal output for one tactic at one immutable close. */
export interface ResearchTacticSignal {
  readonly tacticId: ResearchTacticId
  readonly tacticVersion: string
  readonly tradingDate: string
  readonly featureHash: string
  readonly gatePassed: boolean
  readonly gateReason: string
  readonly marketBreadth1: number
  readonly marketBreadth20: number
  readonly currentLimitUpRatio: number
  readonly candidates: readonly ResearchTacticCandidate[]
}

interface MarketCrossSection {
  readonly breadth1: number
  readonly breadth20: number
  readonly limitUpRatio: number
  readonly sectorBreadth1: ReadonlyMap<string, number>
}

function ratio(values: readonly boolean[]): number {
  return values.length === 0 ? 0 : values.filter(Boolean).length / values.length
}

function crossSection(stocks: readonly DailyStockResearchFeatures[]): MarketCrossSection {
  const return1 = stocks.filter(stock => stock.adjustedReturn1 !== null)
  const return20 = stocks.filter(stock => stock.adjustedReturn20 !== null)
  const tradable = stocks.filter(stock => stock.tradingStatus === 'trading')
  const sectors = new Map<string, DailyStockResearchFeatures[]>()
  for (const stock of return1) {
    if (stock.sectorId === null) continue
    sectors.set(stock.sectorId, [...sectors.get(stock.sectorId) ?? [], stock])
  }
  return {
    breadth1: ratio(return1.map(stock => (stock.adjustedReturn1 as number) > 0)),
    breadth20: ratio(return20.map(stock => (stock.adjustedReturn20 as number) > 0)),
    limitUpRatio: ratio(tradable.map(stock => stock.limitStatus === 'limit-up')),
    sectorBreadth1: new Map([...sectors].map(([sectorId, members]) => [
      sectorId,
      ratio(members.map(stock => (stock.adjustedReturn1 as number) > 0)),
    ])),
  }
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function candidate(stock: DailyStockResearchFeatures, score: number): ResearchTacticCandidate {
  if (stock.amountMean20 === null || !Number.isFinite(stock.amountMean20) || stock.amountMean20 <= 0) {
    throw new Error(`${stock.symbol} candidate amountMean20 is not positive`)
  }
  return {
    symbol: stock.symbol,
    score: Number(score.toFixed(8)),
    amountMean20: stock.amountMean20,
    evidenceRefs: [...stock.evidenceRefs],
  }
}

function ranked(candidates: readonly ResearchTacticCandidate[]): readonly ResearchTacticCandidate[] {
  return [...candidates].sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol))
}

function breakout(
  record: DailyHistoryFeatureRecord,
  market: MarketCrossSection,
): Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'> {
  const gatePassed = market.breadth20 >= 0.55 && market.breadth1 >= 0.48
  const candidates = gatePassed ? record.stocks.flatMap((stock) => {
    const { adjustedReturn20: return20, adjustedReturn60: return60, distanceFromHigh20: distance20,
      sectorRelativeReturn20: sectorRelative20, turnover5To20Ratio: turnoverRatio, amountMean20: amount20 } = stock
    if (stock.tradingStatus !== 'trading' || stock.limitStatus === 'limit-up' || stock.listingDays < 120
      || stock.historySessions < 61 || !finite(return20) || !finite(return60) || !finite(distance20)
      || !finite(sectorRelative20) || !finite(turnoverRatio) || !finite(amount20)) return []
    if (return20 <= 0.03 || return20 > 0.3 || return60 <= 0.08 || return60 > 0.6
      || distance20 < -0.05 || sectorRelative20 <= 0.02 || turnoverRatio < 0.75
      || turnoverRatio > 2 || amount20 < 50_000_000 || stock.consecutiveLimitUpSessions > 1) return []
    return [candidate(stock,
      return20 * 2 + return60 + sectorRelative20 * 2 + (distance20 + 0.05) - Math.abs(turnoverRatio - 1) * 0.05)]
  }) : []
  return {
    gatePassed,
    gateReason: gatePassed ? 'risk_on_trend_confirmed' : 'market_trend_breadth_insufficient',
    candidates: ranked(candidates),
  }
}

function emotion(
  record: DailyHistoryFeatureRecord,
  market: MarketCrossSection,
): Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'> {
  const gatePassed = market.limitUpRatio >= 0.002 && market.limitUpRatio <= 0.025 && market.breadth1 >= 0.45
  const candidates = gatePassed ? record.stocks.flatMap((stock) => {
    const { adjustedReturn20: return20, turnover5To20Ratio: turnoverRatio, amountMean20: amount20 } = stock
    if (stock.tradingStatus !== 'trading' || stock.limitStatus !== 'limit-up' || stock.listingDays < 60
      || stock.historySessions < 21 || !finite(return20) || !finite(turnoverRatio) || !finite(amount20)) return []
    if (stock.consecutiveLimitUpSessions < 1 || stock.consecutiveLimitUpSessions > 4
      || return20 <= 0.05 || return20 > 0.8 || turnoverRatio < 0.9 || amount20 < 100_000_000) return []
    return [candidate(stock,
      stock.consecutiveLimitUpSessions * 2 + stock.limitUpSessions20 * 0.25 + return20 + Math.log10(amount20) * 0.02)]
  }) : []
  return {
    gatePassed,
    gateReason: gatePassed ? 'emotion_launch_or_acceleration' : 'emotion_cycle_not_attackable',
    candidates: ranked(candidates),
  }
}

function repair(
  record: DailyHistoryFeatureRecord,
  market: MarketCrossSection,
): Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'> {
  const gatePassed = market.breadth1 >= 0.5 && market.breadth20 <= 0.55
  const candidates = gatePassed ? record.stocks.flatMap((stock) => {
    const { adjustedReturn1: return1, adjustedReturn5: return5, distanceFromHigh20: distance20,
      sectorRelativeReturn20: sectorRelative20, turnover5To20Ratio: turnoverRatio, amountMean20: amount20 } = stock
    if (stock.tradingStatus !== 'trading' || stock.limitStatus !== 'none' || stock.sectorId === null
      || stock.listingDays < 120 || stock.historySessions < 21 || !finite(return1) || !finite(return5)
      || !finite(distance20) || !finite(sectorRelative20) || !finite(turnoverRatio) || !finite(amount20)) return []
    const sectorBreadth = market.sectorBreadth1.get(stock.sectorId) as number
    if (return1 <= 0 || return5 > 0.04 || distance20 > -0.08 || sectorRelative20 > -0.1
      || turnoverRatio > 0.9 || amount20 < 50_000_000 || sectorBreadth < 0.5) return []
    return [candidate(stock,
      -sectorRelative20 * 2 + return1 - Math.max(return5, -0.2) + (0.9 - turnoverRatio) * 0.1 + sectorBreadth * 0.05)]
  }) : []
  return {
    gatePassed,
    gateReason: gatePassed ? 'breadth_repair_confirmed' : 'repair_breadth_not_confirmed',
    candidates: ranked(candidates),
  }
}

function correlatedSectorClusters(record: DailyHistoryFeatureRecord): readonly ReadonlySet<string>[] {
  const parents = new Map(record.sectors.map(sector => [sector.sectorId, sector.sectorId]))
  const root = (sectorId: string): string => {
    const parent = parents.get(sectorId)
    if (parent === undefined || parent === sectorId) return sectorId
    const value = root(parent)
    parents.set(sectorId, value)
    return value
  }
  for (const pair of record.sectorCorrelations20) {
    if (pair.correlation < 0.75) continue
    const left = root(pair.leftSectorId)
    const right = root(pair.rightSectorId)
    if (left !== right) {
      const canonical = left < right ? left : right
      parents.set(left, canonical)
      parents.set(right, canonical)
    }
  }
  const clusters = new Map<string, Set<string>>()
  for (const sectorId of parents.keys()) {
    const key = root(sectorId)
    const cluster = clusters.get(key) ?? new Set<string>()
    cluster.add(sectorId)
    clusters.set(key, cluster)
  }
  return [...clusters.values()]
}

function correlationClusterRotation(
  record: DailyHistoryFeatureRecord,
  market: MarketCrossSection,
): Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'> {
  const sectorById = new Map(record.sectors.map(sector => [sector.sectorId, sector]))
  const rankedClusters = correlatedSectorClusters(record).flatMap((sectorIds) => {
    const sectors = [...sectorIds]
      .map(sectorId => sectorById.get(sectorId))
      .filter((value): value is NonNullable<typeof value> => value !== undefined)
    if (sectors.length === 0 || sectors.some(sector => !finite(sector.adjustedReturn20) || !finite(sector.realizedVolatility20))) return []
    const return20 = sectors.reduce((sum, sector) => sum + (sector.adjustedReturn20 as number), 0) / sectors.length
    const volatility20 = sectors.reduce((sum, sector) => sum + (sector.realizedVolatility20 as number), 0) / sectors.length
    const breadth = sectors.reduce((sum, sector) => sum + sector.advancingRatio, 0) / sectors.length
    if (return20 <= 0.03 || breadth < 0.5) return []
    return [{ sectorIds, score: return20 / Math.max(volatility20, 0.002) + breadth }]
  }).sort((left, right) => right.score - left.score)
  const selectedSectors = rankedClusters[0]?.sectorIds ?? new Set<string>()
  const gatePassed = market.breadth20 >= 0.5 && market.breadth1 >= 0.45 && selectedSectors.size > 0
  const candidates = gatePassed ? record.stocks.flatMap((stock) => {
    const { adjustedReturn20: return20, sectorRelativeReturn20: relative20, realizedVolatility20: volatility20,
      turnover5To20Ratio: turnoverRatio, amountMean20: amount20 } = stock
    if (stock.sectorId === null || !selectedSectors.has(stock.sectorId) || stock.tradingStatus !== 'trading'
      || stock.limitStatus !== 'none' || stock.listingDays < 120 || !finite(return20) || !finite(relative20)
      || !finite(volatility20) || !finite(turnoverRatio) || !finite(amount20)) return []
    if (return20 <= 0.02 || return20 > 0.35 || relative20 < -0.02 || volatility20 > 0.045
      || turnoverRatio < 0.6 || turnoverRatio > 1.8 || amount20 < 50_000_000) return []
    return [candidate(stock, return20 + relative20 * 2 - volatility20 * 3 + Math.log10(amount20) * 0.005)]
  }) : []
  return {
    gatePassed,
    gateReason: gatePassed ? 'correlated_sector_cluster_leads' : 'no_attackable_sector_cluster',
    candidates: ranked(candidates),
  }
}

function residualStrength(
  record: DailyHistoryFeatureRecord,
  market: MarketCrossSection,
): Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'> {
  const strongSectors = new Set(record.sectors.filter(sector => finite(sector.adjustedReturn20)
    && sector.adjustedReturn20 > 0.015 && sector.advancingRatio >= 0.45).map(sector => sector.sectorId))
  const gatePassed = market.breadth20 >= 0.45 && strongSectors.size > 0
  const candidates = gatePassed ? record.stocks.flatMap((stock) => {
    const { adjustedReturn20: return20, adjustedReturn60: return60, sectorRelativeReturn20: relative20,
      realizedVolatility20: volatility20, amountMean20: amount20, turnover5To20Ratio: turnoverRatio } = stock
    if (stock.sectorId === null || !strongSectors.has(stock.sectorId) || stock.tradingStatus !== 'trading'
      || stock.limitStatus !== 'none' || stock.listingDays < 120 || !finite(return20) || !finite(return60)
      || !finite(relative20) || !finite(volatility20) || !finite(amount20) || !finite(turnoverRatio)) return []
    if (return20 <= 0.03 || return20 > 0.35 || return60 <= 0 || relative20 <= 0.04 || volatility20 > 0.05
      || amount20 < 50_000_000 || turnoverRatio < 0.7 || turnoverRatio > 1.8) return []
    return [candidate(stock, relative20 * 3 + return20 + return60 * 0.25 - volatility20 * 4)]
  }) : []
  return {
    gatePassed,
    gateReason: gatePassed ? 'positive_sector_residual_regime' : 'sector_residual_regime_absent',
    candidates: ranked(candidates),
  }
}

function lowVolatilityLeader(
  record: DailyHistoryFeatureRecord,
  market: MarketCrossSection,
): Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'> {
  const strongSectors = new Set(record.sectors.filter(sector => finite(sector.adjustedReturn20)
    && sector.adjustedReturn20 > 0 && sector.advancingRatio >= 0.45).map(sector => sector.sectorId))
  const gatePassed = market.breadth20 >= 0.35 && market.breadth20 <= 0.65
    && market.limitUpRatio <= 0.015 && strongSectors.size > 0
  const candidates = gatePassed ? record.stocks.flatMap((stock) => {
    const { adjustedReturn20: return20, sectorRelativeReturn20: relative20, realizedVolatility20: volatility20,
      distanceFromHigh20: distance20, amountMean20: amount20 } = stock
    if (stock.sectorId === null || !strongSectors.has(stock.sectorId) || stock.tradingStatus !== 'trading'
      || stock.limitStatus !== 'none' || stock.listingDays < 180 || !finite(return20) || !finite(relative20)
      || !finite(volatility20) || !finite(distance20) || !finite(amount20)) return []
    if (return20 <= 0.01 || return20 > 0.2 || relative20 <= 0 || volatility20 > 0.025
      || distance20 < -0.12 || amount20 < 100_000_000 || stock.limitUpSessions20 > 1) return []
    return [candidate(stock, return20 + relative20 * 2 - volatility20 * 6 + (distance20 + 0.12) * 0.2)]
  }) : []
  return {
    gatePassed,
    gateReason: gatePassed ? 'rotation_defensive_low_volatility' : 'low_volatility_regime_absent',
    candidates: ranked(candidates),
  }
}

/**
 * Generate one deterministic post-close signal from an immutable feature record.
 * @param tacticId - Fixed versioned research tactic to evaluate.
 * @param record - Point-in-time features available after that session's close.
 * @returns Frozen market gates and deterministically ranked candidates.
 */
export function generateResearchTacticSignal(
  tacticId: ResearchTacticId,
  record: DailyHistoryFeatureRecord,
): ResearchTacticSignal {
  if (!/^[a-f0-9]{64}$/u.test(record.currentSnapshotHash)) throw new Error('feature hash is not SHA-256')
  const market = crossSection(record.stocks)
  let result: Pick<ResearchTacticSignal, 'gatePassed' | 'gateReason' | 'candidates'>
  switch (tacticId) {
    case 'regime_signed_breakout_pullback': result = breakout(record, market); break
    case 'openable_emotion_leader': result = emotion(record, market); break
    case 'industry_relative_exhaustion_repair': result = repair(record, market); break
    case 'correlation_cluster_sector_rotation': result = correlationClusterRotation(record, market); break
    case 'sector_residual_strength': result = residualStrength(record, market); break
    case 'low_volatility_sector_leader': result = lowVolatilityLeader(record, market); break
  }
  return deepFreeze({
    tacticId,
    tacticVersion: RESEARCH_TACTIC_VERSIONS[tacticId],
    tradingDate: record.tradingDate,
    featureHash: record.currentSnapshotHash,
    gatePassed: result.gatePassed,
    gateReason: result.gateReason,
    marketBreadth1: market.breadth1,
    marketBreadth20: market.breadth20,
    currentLimitUpRatio: market.limitUpRatio,
    candidates: result.candidates,
  })
}
