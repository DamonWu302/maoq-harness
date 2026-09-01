import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import type { DailyHistoryFeatureRecord, DailyStockResearchFeatures } from './types.ts'

/** Initial deterministic MAOQ tactic implementations compared by P3. */
export type ResearchTacticId =
  | 'regime_signed_breakout_pullback'
  | 'openable_emotion_leader'
  | 'industry_relative_exhaustion_repair'

/** Stable implementation identities. Parameter changes require a new version. */
export const RESEARCH_TACTIC_VERSIONS: Readonly<Record<ResearchTacticId, string>> = deepFreeze({
  regime_signed_breakout_pullback: 'regime-signed-breakout-pullback-v1',
  openable_emotion_leader: 'openable-emotion-leader-v1',
  industry_relative_exhaustion_repair: 'industry-relative-exhaustion-repair-v1',
})

/** One ranked stock whose complete deterministic gates passed at the close. */
export interface ResearchTacticCandidate {
  readonly symbol: string
  readonly score: number
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
  return { symbol: stock.symbol, score: Number(score.toFixed(8)), evidenceRefs: [...stock.evidenceRefs] }
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
  const result = tacticId === 'regime_signed_breakout_pullback'
    ? breakout(record, market)
    : tacticId === 'openable_emotion_leader'
      ? emotion(record, market)
      : repair(record, market)
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
