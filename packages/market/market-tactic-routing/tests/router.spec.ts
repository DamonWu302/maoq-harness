import { describe, expect, it } from 'vitest'
import { evaluateTacticEligibility } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  deriveTacticRoutingContext,
  routeEligibleTactics,
  verifyTacticRoutingRecord,
  type TacticRoutingRecord,
} from '../src/index.ts'
import {
  outcomes,
  strategicFeatures,
} from './fixtures.ts'

function qualifiedRoute(): TacticRoutingRecord {
  const features = strategicFeatures()
  const scorecard = advanceTacticScorecard(createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'), [
    ...outcomes('regime_signed_breakout_pullback', 8, { netReturn: 0.04, doubledCostNetReturn: 0.03 }),
    ...outcomes('openable_emotion_leader', 8, { netReturn: 0.03, doubledCostNetReturn: 0.02 }),
    ...outcomes('correlation_cluster_sector_rotation', 8, { netReturn: 0.025, doubledCostNetReturn: 0.015 }),
  ], '2026-02-01T00:00:00.000Z')
  return routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
}

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

  it('round-trips canonical routes and rejects every malformed serialized boundary', () => {
    const route = qualifiedRoute()
    expect(verifyTacticRoutingRecord(structuredClone(route))).toEqual(route)
    const candidate = route.slate[0]!
    const invalidCandidate = [
      null,
      { ...candidate, tacticId: 'unknown' },
      { ...candidate, tacticVersion: 1 },
      { ...candidate, routeScore: 'high' },
      { ...candidate, routeScore: Number.NaN },
      { ...candidate, maximumPaperPositionPct: 'zero' },
      { ...candidate, maximumPaperPositionPct: Number.NaN },
      { ...candidate, maximumPaperPositionPct: -1 },
      { ...candidate, maximumPaperPositionPct: 101 },
      { ...candidate, evidenceRefs: 'bad' },
      { ...candidate, evidenceRefs: [1] },
      { ...candidate, evidenceRefs: [''] },
    ]
    const malformed: unknown[] = [
      null,
      [],
      { ...route, routerVersion: 'bad' },
      { ...route, routeId: 1 },
      { ...route, routeId: 'bad' },
      { ...route, tradingDate: 1 },
      { ...route, cutoffTime: 1 },
      { ...route, cutoffTime: 'invalid' },
      { ...route, currentSnapshotHash: 1 },
      { ...route, currentSnapshotHash: 'bad' },
      { ...route, scorecardId: 1 },
      { ...route, scorecardId: 'bad' },
      { ...route, slate: null },
      { ...route, slate: [] },
      { ...route, slate: [...route.slate, route.defensiveFallback] },
      ...invalidCandidate.map(item => ({ ...route, slate: [item] })),
      { ...route, slate: [candidate, candidate] },
      { ...route, defensiveFallback: null },
      { ...route, defensiveFallback: candidate },
      { ...route, cashFloorPct: 'full' },
      { ...route, cashFloorPct: Number.NaN },
      { ...route, cashFloorPct: -1 },
      { ...route, cashFloorPct: 101 },
    ]
    for (const value of malformed) {
      expect(() => verifyTacticRoutingRecord(value)).toThrow(/invalid deterministic tactic routing/)
    }
    expect(() => verifyTacticRoutingRecord({ ...route, cashFloorPct: 99 })).toThrow(/identity mismatch/)
  })
})
