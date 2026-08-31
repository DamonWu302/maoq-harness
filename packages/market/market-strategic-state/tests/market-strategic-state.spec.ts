import { describe, expect, it } from 'vitest'
import { buildMarketSnapshot, canonicalJson, type MarketSnapshot, type MarketSnapshotDraft } from '@deepseek-ai/dsh-market-snapshot'
import {
  buildStrategicStateRecord,
  computeStrategicFeatures,
  MAO_METHOD_CATALOG,
  StrategicInterpretationValidationError,
  type EmotionCycle,
  type MarketRegime,
  type StrategicInterpretationDraft,
} from '../src/index.ts'
import { normalDraft } from '../../market-snapshot/tests/fixtures.ts'

function datedDraft(date: string, dayOffset: number): MarketSnapshotDraft {
  const base = normalDraft()
  const cutoffTime = `${date}T15:30:00+08:00`
  const retrievedAt = `${date}T15:10:00+08:00`
  const provenance = (value: typeof base.breadth.provenance) => ({
    ...value,
    source: { ...value.source, retrievedAt, recordId: `${value.source.recordId}-${date}` },
  })
  return {
    ...base,
    identity: {
      ...base.identity,
      tradingDate: date,
      cutoffTime,
      adjustmentVersion: `qfq-${date}`,
      sourceVersions: base.identity.sourceVersions.map(version => `${version}-${date}`),
    },
    stocks: base.stocks.map(stock => ({
      ...stock,
      tradingDate: date,
      close: stock.close + dayOffset * 0.01,
      provenance: provenance(stock.provenance),
    })),
    sectors: base.sectors.map(sector => ({
      ...sector,
      tradingDate: date,
      close: sector.close + dayOffset,
      provenance: provenance(sector.provenance),
    })),
    breadth: { ...base.breadth, provenance: provenance(base.breadth.provenance) },
    emotion: { ...base.emotion, provenance: provenance(base.emotion.provenance) },
    news: base.news.map(item => ({
      ...item,
      id: `${item.id}-${date}`,
      publishedAt: `${date}T10:00:00+08:00`,
      fetchedAt: `${date}T10:01:00+08:00`,
      eventAt: `${date}T10:00:00+08:00`,
      provenance: provenance(item.provenance),
    })),
  }
}

function snapshot(
  breadth: Partial<MarketSnapshotDraft['breadth']> = {},
  emotion: Partial<MarketSnapshotDraft['emotion']> = {},
): MarketSnapshot {
  const draft = datedDraft('2026-08-28', 2)
  return buildMarketSnapshot({
    ...draft,
    breadth: { ...draft.breadth, ...breadth },
    emotion: { ...draft.emotion, ...emotion },
  })
}

const history = [
  buildMarketSnapshot(datedDraft('2026-08-26', 0)),
  buildMarketSnapshot(datedDraft('2026-08-27', 1)),
]

function interpretation(features: ReturnType<typeof computeStrategicFeatures>): StrategicInterpretationDraft {
  const refs = features.evidence.map(item => item.ref)
  return {
    principalContradiction: '风险偏好修复与炸板压力之间的矛盾',
    leastResistanceBattlefield: '银行',
    supportingEvidenceRefs: [refs[0]!],
    counterEvidenceRefs: [refs[1]!],
    transitionConditions: ['若晋级率低于 0.2，则转为退潮判断'],
    confidence: 0.68,
    eligiblePosture: 'watch',
    maoMethodApplications: [{
      methodId: 'principal_contradiction',
      application: '把风险偏好与炸板压力中当前起主导作用的一方作为状态判断核心。',
      evidenceRefs: [refs[0]!, refs[1]!],
      limitation: '该判断只适用于当前快照与显式历史，不外推到盘中。',
    }],
  }
}

describe('deterministic strategic features', () => {
  it('returns byte-identical features for the same snapshot hashes and engine version', () => {
    const current = snapshot()
    const left = computeStrategicFeatures(current, history)
    const right = computeStrategicFeatures(current, [...history].reverse())
    expect(canonicalJson(right)).toBe(canonicalJson(left))
    expect(right.inputSnapshotHashes).toEqual([...history.map(item => item.identity.contentHash), current.identity.contentHash])
    expect(Object.isFrozen(right)).toBe(true)
  })

  it.each<[MarketRegime, Partial<MarketSnapshotDraft['breadth']>, Partial<MarketSnapshotDraft['emotion']>]>([
    ['risk_on_trend', { advancing: 3_200, declining: 1_500, unchanged: 200, majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: 0.01 }] }, { lossEffectRate: 0.12 }],
    ['rotation', { advancing: 2_200, declining: 2_300, unchanged: 400, majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: 0.006 }], brokenLimit: 8, limitUp: 60 }, { lossEffectRate: 0.25 }],
    ['high_volatility_divergence', { advancing: 3_300, declining: 1_200, unchanged: 400, majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: 0.001 }], brokenLimit: 55, limitUp: 60 }, { lossEffectRate: 0.2 }],
    ['risk_contraction', { advancing: 1_200, declining: 3_200, unchanged: 500, majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: -0.015 }] }, { lossEffectRate: 0.5 }],
    ['repair', { advancing: 2_700, declining: 1_900, unchanged: 300, majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: 0.002 }], brokenLimit: 8, limitUp: 60 }, { lossEffectRate: 0.25 }],
  ])('covers market regime %s with a gold fixture', (label, breadth, emotion) => {
    const component = computeStrategicFeatures(snapshot(breadth, emotion), history).marketRegime
    expect(component.status).toBe('ready')
    if (component.status === 'ready') {
      expect(component.value.label).toBe(label)
      expect(component.evidenceRefs.length).toBeGreaterThan(0)
    }
  })

  it.each<[EmotionCycle, Partial<MarketSnapshotDraft['breadth']>, Partial<MarketSnapshotDraft['emotion']>]>([
    ['startup', { advancing: 2_300, declining: 2_300, unchanged: 300 }, { consecutiveBoardCounts: [{ boards: 2, count: 2 }], promotionRate: 0.25, brokenLimitRate: 0.3, lossEffectRate: 0.25 }],
    ['acceleration', {}, { consecutiveBoardCounts: [{ boards: 4, count: 2 }], promotionRate: 0.5, brokenLimitRate: 0.2, lossEffectRate: 0.15 }],
    ['climax', {}, { consecutiveBoardCounts: [{ boards: 6, count: 1 }], promotionRate: 0.68, brokenLimitRate: 0.16, lossEffectRate: 0.1 }],
    ['divergence', {}, { consecutiveBoardCounts: [{ boards: 4, count: 2 }], promotionRate: 0.5, brokenLimitRate: 0.48, lossEffectRate: 0.25 }],
    ['ebb', {}, { consecutiveBoardCounts: [{ boards: 2, count: 1 }], promotionRate: 0.15, brokenLimitRate: 0.35, lossEffectRate: 0.5 }],
    ['repair', {}, { consecutiveBoardCounts: [{ boards: 2, count: 4 }], promotionRate: 0.35, brokenLimitRate: 0.25, lossEffectRate: 0.2 }],
  ])('covers emotion cycle %s with a gold fixture', (label, breadth, emotion) => {
    const component = computeStrategicFeatures(snapshot(breadth, emotion), history).emotionCycle
    expect(component.status).toBe('ready')
    if (component.status === 'ready') {
      expect(component.value.label).toBe(label)
      expect(component.evidenceRefs.length).toBeGreaterThan(0)
    }
  })

  it('reports market, emotion, and sector failures independently', () => {
    const zeroBreadth = computeStrategicFeatures(snapshot({ advancing: 0, declining: 0, unchanged: 0 }), history)
    expect(zeroBreadth.marketRegime).toMatchObject({ status: 'unavailable', reasonCodes: ['MARKET_BREADTH_INSUFFICIENT'] })
    expect(zeroBreadth.emotionCycle.status).toBe('ready')

    const noBoards = computeStrategicFeatures(snapshot({}, { consecutiveBoardCounts: [] }), history)
    expect(noBoards.marketRegime.status).toBe('ready')
    expect(noBoards.emotionCycle).toMatchObject({ status: 'unavailable', reasonCodes: ['BOARD_HEIGHT_MISSING'] })

    const noHistory = computeStrategicFeatures(snapshot())
    expect(noHistory.marketRegime.status).toBe('ready')
    expect(noHistory.emotionCycle.status).toBe('ready')
    expect(noHistory.sectorBattlefields).toMatchObject({ status: 'unavailable', reasonCodes: ['SECTOR_HISTORY_REQUIRES_TWO_PRIOR_SNAPSHOTS'] })
    expect(noHistory.eligibleForInterpretation).toBe(false)
  })

  it('computes sector dimensions without emitting a stock ranking', () => {
    const component = computeStrategicFeatures(snapshot(), history).sectorBattlefields
    expect(component.status).toBe('ready')
    if (component.status === 'ready') {
      expect(component.value[0]).toMatchObject({ sectorId: 'bank', persistence: 1, catalystSupport: 1 })
      expect(component.value[0]).not.toHaveProperty('stocks')
      expect(component.value[0]!.evidenceRefs.length).toBeGreaterThan(0)
    }
  })
})

describe('evidence-bound interpretation and Mao method attribution', () => {
  it('enriches allowlisted method IDs with a source and clearly labels paraphrase', () => {
    const features = computeStrategicFeatures(snapshot(), history)
    const record = buildStrategicStateRecord(features, interpretation(features), '2026-08-28T16:00:00+08:00', 24)
    expect(record.actionable).toBe(true)
    expect(record.interpretation.maoMethodApplications[0]).toMatchObject({
      methodId: 'principal_contradiction',
      sourceTitle: '《矛盾论》',
      attributionKind: 'paraphrase',
    })
    expect(MAO_METHOD_CATALOG.principal_contradiction.sourceUrl).toContain('mao-193708')
  })

  it('rejects uncited facts and missing counter-evidence at the host boundary', () => {
    const features = computeStrategicFeatures(snapshot(), history)
    const valid = interpretation(features)
    expect(() => buildStrategicStateRecord(features, { ...valid, supportingEvidenceRefs: ['invented'] }, '2026-08-28T16:00:00+08:00', 24))
      .toThrow(/unknown evidence/)
    expect(() => buildStrategicStateRecord(features, { ...valid, counterEvidenceRefs: [] }, '2026-08-28T16:00:00+08:00', 24))
      .toThrow(/must not be empty/)
  })

  it('forces stale or incomplete records to no_trade and keeps low confidence non-actionable', () => {
    const complete = computeStrategicFeatures(snapshot(), history)
    const valid = interpretation(complete)
    expect(() => buildStrategicStateRecord(complete, valid, '2026-08-30T16:00:00+08:00', 24))
      .toThrow(StrategicInterpretationValidationError)

    const staleNoTrade = buildStrategicStateRecord(complete, { ...valid, eligiblePosture: 'no_trade' }, '2026-08-30T16:00:00+08:00', 24)
    expect(staleNoTrade.actionable).toBe(false)

    const incomplete = computeStrategicFeatures(snapshot())
    const incompleteDraft = interpretation(incomplete)
    expect(() => buildStrategicStateRecord(incomplete, incompleteDraft, '2026-08-28T16:00:00+08:00', 24)).toThrow(/require no_trade/)
    expect(buildStrategicStateRecord(incomplete, { ...incompleteDraft, eligiblePosture: 'no_trade' }, '2026-08-28T16:00:00+08:00', 24).actionable).toBe(false)

    expect(buildStrategicStateRecord(complete, { ...valid, confidence: 0.49 }, '2026-08-28T16:00:00+08:00', 24).actionable).toBe(false)
  })
})
