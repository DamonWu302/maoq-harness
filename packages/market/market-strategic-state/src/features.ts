import type { MarketSnapshot, SectorDailySnapshot } from '@deepseek-ai/dsh-market-snapshot'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  STRATEGIC_ENGINE_VERSION,
  STRATEGIC_FEATURE_SCHEMA_VERSION,
  type EmotionCycle,
  type EmotionCycleFeature,
  type MarketRegime,
  type MarketRegimeFeature,
  type ReadyStrategicComponent,
  type SectorBattlefieldFeature,
  type StrategicComponent,
  type StrategicEvidence,
  type StrategicFeatureRecord,
} from './types.ts'

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function evidenceRef(snapshot: MarketSnapshot, path: string): string {
  return `snapshot:${snapshot.identity.contentHash}#${path}`
}

function addEvidence(target: StrategicEvidence[], snapshot: MarketSnapshot, path: string, value: StrategicEvidence['value']): string {
  const ref = evidenceRef(snapshot, path)
  target.push({ ref, snapshotHash: snapshot.identity.contentHash, path, value })
  return ref
}

function ready<T>(value: T, evidenceRefs: readonly string[]): ReadyStrategicComponent<T> {
  return { status: 'ready', value, evidenceRefs }
}

function marketLabel(feature: Omit<MarketRegimeFeature, 'label'>): MarketRegime {
  if (feature.advanceRatio < 0.38 || feature.meanIndexChangePct <= -0.012 || feature.lossEffectRate >= 0.45) return 'risk_contraction'
  if (feature.brokenLimitPressure >= 0.4 || (Math.abs(feature.meanIndexChangePct) <= 0.004 && Math.abs(feature.advanceRatio - 0.5) >= 0.2)) return 'high_volatility_divergence'
  if (feature.advanceRatio >= 0.6 && feature.meanIndexChangePct > 0.004 && feature.lossEffectRate < 0.22) return 'risk_on_trend'
  if (feature.advanceRatio >= 0.52 && feature.meanIndexChangePct >= 0 && feature.lossEffectRate < 0.32) return 'repair'
  return 'rotation'
}

function emotionLabel(feature: Omit<EmotionCycleFeature, 'label'>): EmotionCycle {
  if (feature.boardHeight >= 5 && feature.promotionRate >= 0.6 && feature.brokenLimitRate < 0.25 && feature.lossEffectRate < 0.18) return 'climax'
  if ((feature.brokenLimitRate >= 0.4 || feature.lossEffectRate >= 0.32) && (feature.boardHeight >= 3 || feature.promotionRate >= 0.35)) return 'divergence'
  if (feature.promotionRate < 0.22 || feature.lossEffectRate >= 0.45) return 'ebb'
  if (feature.boardHeight >= 3 && feature.promotionRate >= 0.45 && feature.brokenLimitRate < 0.32 && feature.lossEffectRate < 0.22) return 'acceleration'
  if (feature.promotionRate >= 0.28 && feature.lossEffectRate < 0.32 && feature.advanceRatio >= 0.5) return 'repair'
  return 'startup'
}

function computeMarket(snapshot: MarketSnapshot, evidence: StrategicEvidence[]): StrategicComponent<MarketRegimeFeature> {
  const breadthTotal = snapshot.breadth.advancing + snapshot.breadth.declining + snapshot.breadth.unchanged
  if (breadthTotal === 0 || snapshot.breadth.majorIndices.length === 0) {
    return { status: 'unavailable', reasonCodes: ['MARKET_BREADTH_INSUFFICIENT'], evidenceRefs: [] }
  }
  const featureWithoutLabel = {
    advanceRatio: round(ratio(snapshot.breadth.advancing, breadthTotal)),
    meanIndexChangePct: round(mean(snapshot.breadth.majorIndices.map(index => index.changePct))),
    limitBalance: round(ratio(
      snapshot.breadth.limitUp - snapshot.breadth.limitDown,
      snapshot.breadth.limitUp + snapshot.breadth.limitDown,
    )),
    brokenLimitPressure: round(ratio(snapshot.breadth.brokenLimit, snapshot.breadth.limitUp + snapshot.breadth.brokenLimit)),
    lossEffectRate: snapshot.emotion.lossEffectRate,
  }
  const refs = [
    addEvidence(evidence, snapshot, 'breadth.advancing', snapshot.breadth.advancing),
    addEvidence(evidence, snapshot, 'breadth.declining', snapshot.breadth.declining),
    addEvidence(evidence, snapshot, 'breadth.unchanged', snapshot.breadth.unchanged),
    ...snapshot.breadth.majorIndices.map((index, i) => addEvidence(
      evidence, snapshot, `breadth.majorIndices[${String(i)}].changePct`, index.changePct,
    )),
    addEvidence(evidence, snapshot, 'breadth.limitUp', snapshot.breadth.limitUp),
    addEvidence(evidence, snapshot, 'breadth.limitDown', snapshot.breadth.limitDown),
    addEvidence(evidence, snapshot, 'breadth.brokenLimit', snapshot.breadth.brokenLimit),
    addEvidence(evidence, snapshot, 'emotion.lossEffectRate', snapshot.emotion.lossEffectRate),
  ]
  return ready({ label: marketLabel(featureWithoutLabel), ...featureWithoutLabel }, refs)
}

function computeEmotion(snapshot: MarketSnapshot, evidence: StrategicEvidence[]): StrategicComponent<EmotionCycleFeature> {
  if (snapshot.emotion.consecutiveBoardCounts.length === 0) {
    return { status: 'unavailable', reasonCodes: ['BOARD_HEIGHT_MISSING'], evidenceRefs: [] }
  }
  const breadthTotal = snapshot.breadth.advancing + snapshot.breadth.declining + snapshot.breadth.unchanged
  const featureWithoutLabel = {
    boardHeight: Math.max(...snapshot.emotion.consecutiveBoardCounts.filter(item => item.count > 0).map(item => item.boards), 0),
    promotionRate: snapshot.emotion.promotionRate,
    brokenLimitRate: snapshot.emotion.brokenLimitRate,
    lossEffectRate: snapshot.emotion.lossEffectRate,
    advanceRatio: round(ratio(snapshot.breadth.advancing, breadthTotal)),
  }
  const refs = [
    addEvidence(
      evidence,
      snapshot,
      'emotion.consecutiveBoardCounts',
      JSON.stringify(snapshot.emotion.consecutiveBoardCounts),
    ),
    addEvidence(evidence, snapshot, 'emotion.promotionRate', snapshot.emotion.promotionRate),
    addEvidence(evidence, snapshot, 'emotion.brokenLimitRate', snapshot.emotion.brokenLimitRate),
    addEvidence(evidence, snapshot, 'emotion.lossEffectRate', snapshot.emotion.lossEffectRate),
    addEvidence(evidence, snapshot, 'breadth.advancing', snapshot.breadth.advancing),
    addEvidence(evidence, snapshot, 'breadth.declining', snapshot.breadth.declining),
    addEvidence(evidence, snapshot, 'breadth.unchanged', snapshot.breadth.unchanged),
  ]
  return ready({ label: emotionLabel(featureWithoutLabel), ...featureWithoutLabel }, refs)
}

function sectorReturn(sector: SectorDailySnapshot): number {
  return sector.open === 0 ? 0 : sector.close / sector.open - 1
}

function computeSectors(
  current: MarketSnapshot,
  history: readonly MarketSnapshot[],
  evidence: StrategicEvidence[],
): StrategicComponent<readonly SectorBattlefieldFeature[]> {
  if (history.length < 2) {
    return { status: 'unavailable', reasonCodes: ['SECTOR_HISTORY_REQUIRES_TWO_PRIOR_SNAPSHOTS'], evidenceRefs: [] }
  }
  const all = [...history, current]
  const compatible = history.every(snapshot => snapshot.identity.tradingDate < current.identity.tradingDate
    && snapshot.identity.sectorClassificationVersion === current.identity.sectorClassificationVersion)
  if (!compatible) return { status: 'unavailable', reasonCodes: ['SECTOR_HISTORY_INCOMPATIBLE'], evidenceRefs: [] }
  const features: SectorBattlefieldFeature[] = []
  for (const sector of current.sectors) {
    const series = all.map(snapshot => snapshot.sectors.find(item => item.sectorId === sector.sectorId))
    if (series.some(item => item === undefined)) continue
    const complete = series as SectorDailySnapshot[]
    const returns = complete.map(sectorReturn)
    const currentReturn = returns.at(-1)
    if (currentReturn === undefined) continue
    const strength = clamp((currentReturn + 0.05) / 0.1)
    const persistence = ratio(returns.filter(value => value > 0).length, returns.length)
    const capacity = clamp(ratio(sector.amount, current.breadth.totalAmount) * 8)
    const catalystSupport = Math.max(0, ...current.news
      .filter(item => item.affectedSectors.includes(sector.sectorId))
      .map(item => item.confidence))
    const internalBreadth = sector.advancingRatio
    const leaderQuality = clamp(sector.leaders.length / 3)
    const limitUpDensity = ratio(sector.limitUpCount, Math.max(1, sector.members.length))
    const crowding = clamp(limitUpDensity * 2 + Math.max(0, 0.02 - sector.dispersion) * 10)
    const support = 0.22 * strength + 0.18 * persistence + 0.18 * capacity
      + 0.12 * catalystSupport + 0.18 * internalBreadth + 0.12 * leaderQuality
    const resistance = clamp(1 - support + 0.25 * crowding)
    const refs = complete.flatMap((item, index) => {
      const snapshot = all[index]
      if (snapshot === undefined) return []
      return [
        addEvidence(evidence, snapshot, `sectors.${sector.sectorId}.open`, item.open),
        addEvidence(evidence, snapshot, `sectors.${sector.sectorId}.close`, item.close),
      ]
    }).concat([
      addEvidence(evidence, current, `sectors.${sector.sectorId}.amount`, sector.amount),
      addEvidence(evidence, current, `sectors.${sector.sectorId}.advancingRatio`, sector.advancingRatio),
      addEvidence(evidence, current, `sectors.${sector.sectorId}.limitUpCount`, sector.limitUpCount),
      addEvidence(evidence, current, `sectors.${sector.sectorId}.dispersion`, sector.dispersion),
      addEvidence(evidence, current, `sectors.${sector.sectorId}.leaderCount`, sector.leaders.length),
    ])
    features.push({
      sectorId: sector.sectorId,
      name: sector.name,
      strength: round(strength),
      persistence: round(persistence),
      capacity: round(capacity),
      catalystSupport: round(catalystSupport),
      internalBreadth: round(internalBreadth),
      leaderQuality: round(leaderQuality),
      crowding: round(crowding),
      resistance: round(resistance),
      compositeScore: round(support - 0.25 * crowding),
      evidenceRefs: refs,
    })
  }
  if (features.length === 0) return { status: 'unavailable', reasonCodes: ['NO_SECTOR_HAS_COMPLETE_HISTORY'], evidenceRefs: [] }
  features.sort((left, right) => right.compositeScore - left.compositeScore || left.sectorId.localeCompare(right.sectorId))
  return ready(features, features.flatMap(feature => feature.evidenceRefs))
}

/**
 * Compute replay-stable strategic features from one current snapshot and explicit prior snapshots.
 * @param current - Immutable snapshot at the decision cutoff.
 * @param history - Prior snapshots in any input order; at least two are required for sector persistence.
 * @returns A deeply frozen record whose components expose independent failure states.
 */
export function computeStrategicFeatures(current: MarketSnapshot, history: readonly MarketSnapshot[] = []): StrategicFeatureRecord {
  const orderedHistory = [...history].sort((left, right) => left.identity.tradingDate.localeCompare(right.identity.tradingDate))
  const evidence: StrategicEvidence[] = []
  const marketRegime = computeMarket(current, evidence)
  const emotionCycle = computeEmotion(current, evidence)
  const sectorBattlefields = computeSectors(current, orderedHistory, evidence)
  const uniqueEvidence = [...new Map(evidence.map(item => [item.ref, item])).values()]
    .sort((left, right) => left.ref.localeCompare(right.ref))
  const record: StrategicFeatureRecord = {
    schemaVersion: STRATEGIC_FEATURE_SCHEMA_VERSION,
    engineVersion: STRATEGIC_ENGINE_VERSION,
    inputSnapshotHashes: [...orderedHistory.map(snapshot => snapshot.identity.contentHash), current.identity.contentHash],
    currentSnapshotHash: current.identity.contentHash,
    tradingDate: current.identity.tradingDate,
    cutoffTime: current.identity.cutoffTime,
    evidence: uniqueEvidence,
    marketRegime,
    emotionCycle,
    sectorBattlefields,
    eligibleForInterpretation: marketRegime.status === 'ready' && emotionCycle.status === 'ready' && sectorBattlefields.status === 'ready',
  }
  return deepFreeze(record)
}
