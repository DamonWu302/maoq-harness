import { describe, expect, it } from 'vitest'
import {
  generateResearchTacticSignal,
  RESEARCH_TACTIC_VERSIONS,
  type DailyHistoryFeatureRecord,
  type DailyStockResearchFeatures,
  type ResearchTacticId,
} from '../src/index.ts'

const DATE = '2026-08-31'
const HASH = 'a'.repeat(64)

function stock(symbol: string, overrides: Partial<DailyStockResearchFeatures> = {}): DailyStockResearchFeatures {
  return {
    symbol,
    tradingDate: DATE,
    historySessions: 252,
    sectorId: 'sector-a',
    adjustedReturn1: 0.01,
    adjustedReturn5: 0.02,
    adjustedReturn20: 0.12,
    adjustedReturn60: 0.2,
    distanceFromHigh20: -0.02,
    distanceFromHigh252: -0.1,
    sectorRelativeReturn5: 0.02,
    sectorRelativeReturn20: 0.05,
    turnoverMean5: 0.03,
    turnoverMean20: 0.025,
    turnover5To20Ratio: 1.2,
    amountMean20: 200_000_000,
    consecutiveLimitUpSessions: 0,
    limitUpSessions20: 0,
    tradingStatus: 'trading',
    limitStatus: 'none',
    listingDays: 1_000,
    evidenceRefs: [`snapshot:${HASH}#stocks/${symbol}`],
    ...overrides,
  }
}

function record(stocks: readonly DailyStockResearchFeatures[], hash = HASH): DailyHistoryFeatureRecord {
  return {
    schemaVersion: 1,
    engineVersion: 'maoq-daily-history-v1',
    currentSnapshotHash: hash,
    inputSnapshotHashes: [hash],
    tradingDate: DATE,
    sessions: 252,
    stocks,
  }
}

function breakoutUniverse(candidateOverrides: Partial<DailyStockResearchFeatures> = {}): DailyHistoryFeatureRecord {
  const backgrounds = Array.from({ length: 9 }, (_, index) => stock(`B${String(index).padStart(2, '0')}`, {
    adjustedReturn1: index < 4 ? 0.01 : -0.01,
    adjustedReturn20: index < 5 ? 0.02 : -0.02,
    amountMean20: 1,
  }))
  return record([stock('TARGET', candidateOverrides), ...backgrounds])
}

function emotionUniverse(candidateOverrides: Partial<DailyStockResearchFeatures> = {}): DailyHistoryFeatureRecord {
  const backgrounds = Array.from({ length: 99 }, (_, index) => stock(`E${String(index).padStart(2, '0')}`, {
    adjustedReturn1: index < 44 ? 0.01 : -0.01,
    adjustedReturn20: 0.01,
    amountMean20: 1,
  }))
  return record([stock('TARGET', {
    limitStatus: 'limit-up',
    consecutiveLimitUpSessions: 2,
    limitUpSessions20: 3,
    adjustedReturn20: 0.2,
    ...candidateOverrides,
  }), ...backgrounds])
}

function repairUniverse(candidateOverrides: Partial<DailyStockResearchFeatures> = {}): DailyHistoryFeatureRecord {
  const backgrounds = Array.from({ length: 9 }, (_, index) => stock(`R${String(index).padStart(2, '0')}`, {
    adjustedReturn1: index < 4 ? 0.01 : -0.01,
    adjustedReturn20: -0.01,
    amountMean20: 1,
  }))
  return record([stock('TARGET', {
    adjustedReturn1: 0.02,
    adjustedReturn5: -0.08,
    adjustedReturn20: -0.12,
    distanceFromHigh20: -0.2,
    sectorRelativeReturn20: -0.18,
    turnover5To20Ratio: 0.7,
    ...candidateOverrides,
  }), ...backgrounds])
}

function signal(tacticId: ResearchTacticId, input: DailyHistoryFeatureRecord) {
  return generateResearchTacticSignal(tacticId, input)
}

describe('deterministic P3 tactic signals', () => {
  it('ranks a regime-confirmed breakout candidate and freezes its evidence', () => {
    const result = signal('regime_signed_breakout_pullback', breakoutUniverse())
    expect(result).toMatchObject({
      tacticVersion: RESEARCH_TACTIC_VERSIONS.regime_signed_breakout_pullback,
      gatePassed: true,
      gateReason: 'risk_on_trend_confirmed',
      marketBreadth1: 0.5,
      marketBreadth20: 0.6,
    })
    expect(result.candidates.map(item => item.symbol)).toEqual(['TARGET'])
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('ranks an emotion leader but leaves next-open tradability to execution', () => {
    const input = emotionUniverse()
    const tied = stock('AAA', {
      ...input.stocks[0],
      symbol: 'AAA',
      evidenceRefs: ['aaa'],
    })
    const result = signal('openable_emotion_leader', record([tied, ...input.stocks]))
    expect(result.gateReason).toBe('emotion_launch_or_acceleration')
    expect(result.currentLimitUpRatio).toBe(2 / 101)
    expect(result.candidates.map(item => item.symbol)).toEqual(['AAA', 'TARGET'])
  })

  it('requires both market and sector breadth before ranking industry-relative repair', () => {
    const result = signal('industry_relative_exhaustion_repair', repairUniverse())
    expect(result).toMatchObject({ gatePassed: true, gateReason: 'breadth_repair_confirmed' })
    expect(result.candidates.map(item => item.symbol)).toEqual(['TARGET'])
  })

  it.each([
    ['regime_signed_breakout_pullback', breakoutUniverse({ adjustedReturn1: -0.01, adjustedReturn20: -0.01 })],
    ['openable_emotion_leader', record([])],
    ['industry_relative_exhaustion_repair', repairUniverse({ adjustedReturn1: -0.01 })],
  ] as const)('fails %s closed when its market phase is absent', (tacticId, input) => {
    const result = signal(tacticId, input)
    expect(result.gatePassed).toBe(false)
    expect(result.candidates).toEqual([])
  })

  it('rejects every incomplete breakout candidate gate', () => {
    const invalid: Partial<DailyStockResearchFeatures>[] = [
      { tradingStatus: 'delisting' }, { limitStatus: 'limit-up' }, { listingDays: 119 }, { historySessions: 60 },
      { adjustedReturn20: null }, { adjustedReturn20: 0.03 }, { adjustedReturn20: 0.31 },
      { adjustedReturn60: 0.08 }, { adjustedReturn60: 0.61 }, { distanceFromHigh20: -0.051 },
      { sectorRelativeReturn20: 0.02 }, { turnover5To20Ratio: 0.74 }, { turnover5To20Ratio: 2.01 },
      { amountMean20: 49_999_999 }, { consecutiveLimitUpSessions: 2 },
    ]
    for (const overrides of invalid) {
      expect(signal('regime_signed_breakout_pullback', breakoutUniverse(overrides)).candidates).toEqual([])
    }
  })

  it('rejects every incomplete emotion candidate gate', () => {
    const invalid: Partial<DailyStockResearchFeatures>[] = [
      { tradingStatus: 'delisting' }, { limitStatus: 'none' }, { listingDays: 59 }, { historySessions: 20 },
      { adjustedReturn20: Number.NaN }, { consecutiveLimitUpSessions: 0 }, { consecutiveLimitUpSessions: 5 },
      { adjustedReturn20: 0.05 }, { adjustedReturn20: 0.81 }, { turnover5To20Ratio: 0.89 },
      { amountMean20: 99_999_999 },
    ]
    for (const overrides of invalid) {
      expect(signal('openable_emotion_leader', emotionUniverse(overrides)).candidates).toEqual([])
    }
    expect(signal('openable_emotion_leader', emotionUniverse({ limitStatus: 'limit-up' })).gatePassed).toBe(true)
  })

  it('rejects every incomplete repair candidate gate', () => {
    const invalid: Partial<DailyStockResearchFeatures>[] = [
      { tradingStatus: 'delisting' }, { limitStatus: 'limit-down' }, { sectorId: null }, { listingDays: 119 },
      { historySessions: 20 }, { adjustedReturn1: null }, { adjustedReturn1: 0 }, { adjustedReturn5: 0.05 },
      { distanceFromHigh20: -0.07 }, { sectorRelativeReturn20: -0.09 }, { turnover5To20Ratio: 0.91 },
      { amountMean20: 49_999_999 },
    ]
    for (const overrides of invalid) {
      expect(signal('industry_relative_exhaustion_repair', repairUniverse(overrides)).candidates).toEqual([])
    }
    const weakSector = repairUniverse({ sectorId: 'weak' })
    expect(signal('industry_relative_exhaustion_repair', record([
      ...weakSector.stocks,
      stock('WEAK-1', { sectorId: 'weak', adjustedReturn1: -0.01, adjustedReturn20: -0.01, amountMean20: 1 }),
      stock('WEAK-2', { sectorId: 'weak', adjustedReturn1: -0.01, adjustedReturn20: -0.01, amountMean20: 1 }),
      stock('STRONG-1', { adjustedReturn1: 0.01, adjustedReturn20: -0.01, amountMean20: 1 }),
      stock('STRONG-2', { adjustedReturn1: 0.01, adjustedReturn20: -0.01, amountMean20: 1 }),
    ])).candidates).toEqual([])
  })

  it('rejects a feature record without an immutable identity', () => {
    expect(() => signal('regime_signed_breakout_pullback', record([], 'bad'))).toThrow(/feature hash/)
  })
})
