import { describe, expect, it } from 'vitest'
import { PUBLIC_TACTIC_EVIDENCE } from '../src/evidence.ts'

describe('public tactic evidence', () => {
  it('keeps unique attributable benchmarks for every initial tactic', () => {
    expect(new Set(PUBLIC_TACTIC_EVIDENCE.map(item => item.evidenceId)).size).toBe(PUBLIC_TACTIC_EVIDENCE.length)
    expect(new Set(PUBLIC_TACTIC_EVIDENCE.map(item => item.tacticId))).toEqual(new Set([
      'regime_signed_breakout_pullback',
      'openable_emotion_leader',
      'industry_relative_exhaustion_repair',
      'correlation_cluster_sector_rotation',
      'sector_residual_strength',
      'low_volatility_sector_leader',
    ]))
    for (const item of PUBLIC_TACTIC_EVIDENCE) {
      expect(item.sourceUrl).toMatch(/^https:\/\//u)
      expect(item.limitations.length).toBeGreaterThan(0)
      if (item.reportedAnnualizedSharpe !== null) expect(item.reportedAnnualizedSharpe).toBeTypeOf('number')
      if (item.reportedMaximumDrawdown !== null) {
        expect(item.reportedMaximumDrawdown).toBeGreaterThanOrEqual(0)
        expect(item.reportedMaximumDrawdown).toBeLessThanOrEqual(1)
      }
    }
  })

  it('retains adverse and incompatible public results instead of cherry-picking Sharpe', () => {
    expect(PUBLIC_TACTIC_EVIDENCE).toEqual(expect.arrayContaining([
      expect.objectContaining({ decisionUse: 'negative-control', reportedAnnualizedSharpe: -1.243 }),
      expect.objectContaining({ decisionUse: 'rejected', reportedAnnualizedSharpe: 1.187 }),
    ]))
  })
})
