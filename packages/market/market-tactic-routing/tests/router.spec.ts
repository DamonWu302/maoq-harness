import { describe, expect, it } from 'vitest'
import { evaluateTacticEligibility } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  deriveTacticRoutingContext,
  routeEligibleTactics,
} from '../src/index.ts'
import {
  outcomes,
  strategicFeatures,
} from './fixtures.ts'

describe('deterministic tactic routing', () => {
  it('routes qualified research tactics by score while preserving zero paper scope', () => {
    const features = strategicFeatures()
    const eligibility = evaluateTacticEligibility(features)
    const initial = createEmptyTacticScorecard('2026-01-01T00:00:00.000Z')
    const scorecard = advanceTacticScorecard(initial, [
      ...outcomes('regime_signed_breakout_pullback', 8, { netReturn: 0.04, doubledCostNetReturn: 0.03 }),
      ...outcomes('openable_emotion_leader', 8, { netReturn: 0.03, doubledCostNetReturn: 0.02 }),
      ...outcomes('correlation_cluster_sector_rotation', 8, { netReturn: 0.025, doubledCostNetReturn: 0.015 }),
      ...outcomes('sector_residual_strength', 8, { netReturn: 0.02, doubledCostNetReturn: 0.012 }),
    ], '2026-02-01T00:00:00.000Z')
    const route = routeEligibleTactics(features, eligibility, scorecard)
    expect(route.slate.map(item => item.tacticId)).toEqual([
      'regime_signed_breakout_pullback',
      'openable_emotion_leader',
      'correlation_cluster_sector_rotation',
    ])
    expect(route.slate.every(item => item.scope === 'research' && item.maximumPaperPositionPct === 0)).toBe(true)
    expect(route.rejected.find(item => item.tacticId === 'sector_residual_strength')?.reasons)
      .toEqual(['outside_top_three'])
    expect(route.defensiveFallback.tacticId).toBe('defensive_no_trade')
    expect(route.cashFloorPct).toBe(100)
    expect(route.routeId).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('makes defense the only slate item when conditional evidence is insufficient', () => {
    const features = strategicFeatures()
    const eligibility = evaluateTacticEligibility(features)
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('regime_signed_breakout_pullback', 7),
      '2026-02-01T00:00:00.000Z',
    )
    const route = routeEligibleTactics(features, eligibility, scorecard)
    expect(route.slate.map(item => item.tacticId)).toEqual(['defensive_no_trade'])
    expect(route.rejected.find(item => item.tacticId === 'regime_signed_breakout_pullback')?.reasons)
      .toContain('insufficient_matured_sample')
  })

  it.each([
    [{ doubledCostNetReturn: -0.001 }, 'nonpositive_doubled_cost_expectancy'],
    [{ fillRate: 0.4 }, 'fill_rate_below_half'],
    [{ netReturn: -0.01 }, 'nonpositive_expectancy_lower_bound'],
  ] as const)('fails active routing closed for weak evidence %o', (overrides, reason) => {
    const features = strategicFeatures()
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('regime_signed_breakout_pullback', 8, overrides),
      '2026-02-01T00:00:00.000Z',
    )
    const route = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
    expect(route.slate.map(item => item.tacticId)).toEqual(['defensive_no_trade'])
    expect(route.rejected.find(item => item.tacticId === 'regime_signed_breakout_pullback')?.reasons).toContain(reason)
  })

  it('rejects future scorecards and derives stable bounded contexts', () => {
    const features = strategicFeatures({ crowding: 0.7, internalBreadth: 0.3 })
    expect(deriveTacticRoutingContext(features)).toMatchObject({
      sectorStructure: 'narrow',
      volatilityBand: 'normal',
      crowdingBand: 'high',
      executionQualityBand: 'unknown',
    })
    const future = createEmptyTacticScorecard('2026-02-03T00:00:00.000Z')
    expect(() => routeEligibleTactics(features, evaluateTacticEligibility(features), future))
      .toThrow('scorecard cutoff exceeds')
  })
})
