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
    expect(route.slate.every(item => item.evidenceScope === 'exact_context')).toBe(true)
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

  it('uses regime evidence when exact and regime-emotion cells remain sparse', () => {
    const features = strategicFeatures()
    const acceleration = deriveTacticRoutingContext(strategicFeatures({ emotion: 'acceleration', crowding: 0.4 }))
    const repair = deriveTacticRoutingContext(strategicFeatures({ emotion: 'repair', crowding: 0.7 }))
    const scorecard = advanceTacticScorecard(createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'), [
      ...outcomes('regime_signed_breakout_pullback', 4, {
        context: acceleration,
        netReturn: 0.04,
        doubledCostNetReturn: 0.03,
      }),
      ...outcomes('regime_signed_breakout_pullback', 4, {
        context: repair,
        netReturn: 0.04,
        doubledCostNetReturn: 0.03,
      }),
    ], '2026-02-01T00:00:00.000Z')
    const route = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
    expect(route.slate[0]).toMatchObject({
      tacticId: 'regime_signed_breakout_pullback',
      evidenceScope: 'market_regime',
      metrics: { sampleCount: 8 },
    })
  })

  it('prefers regime-emotion evidence before broader same-regime evidence', () => {
    const features = strategicFeatures()
    const sameEmotionCrowded = deriveTacticRoutingContext(strategicFeatures({ emotion: 'startup', crowding: 0.7 }))
    const scorecard = advanceTacticScorecard(createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'), [
      ...outcomes('regime_signed_breakout_pullback', 4),
      ...outcomes('regime_signed_breakout_pullback', 4, {
        context: sameEmotionCrowded,
        netReturn: 0.04,
        doubledCostNetReturn: 0.03,
      }),
    ], '2026-02-01T00:00:00.000Z')
    const route = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
    expect(route.slate[0]).toMatchObject({
      tacticId: 'regime_signed_breakout_pullback',
      evidenceScope: 'regime_emotion',
      metrics: { sampleCount: 8 },
    })
  })

  it('never borrows evidence across market regimes', () => {
    const features = strategicFeatures()
    const rotation = deriveTacticRoutingContext(strategicFeatures({ market: 'rotation' }))
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('regime_signed_breakout_pullback', 8, { context: rotation }),
      '2026-02-01T00:00:00.000Z',
    )
    const route = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
    expect(route.slate.map(item => item.tacticId)).toEqual(['defensive_no_trade'])
    expect(route.rejected.find(item => item.tacticId === 'regime_signed_breakout_pullback'))
      .toMatchObject({ reasons: ['missing_conditional_record'], evidenceScope: null })
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

  it.each([
    [{ crowding: 0.4 }, 'regime_signed_breakout_pullback', 'crowdingPenalty', 0.03],
    [{ crowding: 0.7 }, 'regime_signed_breakout_pullback', 'crowdingPenalty', 0.08],
    [{ market: 'high_volatility_divergence', emotion: 'repair' }, 'industry_relative_exhaustion_repair', 'transitionPenalty', 0.06],
  ] as const)('prices current crowding and transition resistance %o', (featureOverrides, tacticId, component, penalty) => {
    const features = strategicFeatures(featureOverrides)
    const context = deriveTacticRoutingContext(features)
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes(tacticId, 8, { context, netReturn: 0.04, doubledCostNetReturn: 0.03 }),
      '2026-02-01T00:00:00.000Z',
    )
    const candidate = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard).slate[0]!
    expect(candidate.tacticId).toBe(tacticId)
    expect(candidate.scoreComponents[component]).toBe(penalty)
  })

  it('rejects a positive but resistance-dominated route score', () => {
    const features = strategicFeatures({ market: 'high_volatility_divergence', emotion: 'repair', crowding: 0.7 })
    const context = deriveTacticRoutingContext(features)
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('industry_relative_exhaustion_repair', 8, {
        context,
        netReturn: 0.0001,
        doubledCostNetReturn: 0.0001,
        fillRate: 0.5,
      }),
      '2026-02-01T00:00:00.000Z',
    )
    const rejected = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard).rejected
      .find(item => item.tacticId === 'industry_relative_exhaustion_repair')
    expect(rejected?.reasons).toContain('nonpositive_route_score')
  })

  it('uses tactic identity as the stable tie-breaker', () => {
    const features = strategicFeatures()
    const tacticIds = [
      'regime_signed_breakout_pullback',
      'openable_emotion_leader',
      'correlation_cluster_sector_rotation',
      'sector_residual_strength',
    ] as const
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      tacticIds.flatMap(tacticId => outcomes(tacticId, 8)),
      '2026-02-01T00:00:00.000Z',
    )
    const route = routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
    expect(route.slate.map(item => item.tacticId)).toEqual([
      'correlation_cluster_sector_rotation',
      'openable_emotion_leader',
      'regime_signed_breakout_pullback',
    ])
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

  it('rejects mismatched eligibility and an unavailable defensive fallback', () => {
    const features = strategicFeatures()
    const eligibility = evaluateTacticEligibility(features)
    const scorecard = createEmptyTacticScorecard('2026-02-01T00:00:00.000Z')
    expect(() => routeEligibleTactics(features, {
      ...eligibility,
      currentSnapshotHash: 'b'.repeat(64),
    }, scorecard)).toThrow(/current strategic snapshot/)
    expect(() => routeEligibleTactics(features, {
      ...eligibility,
      tactics: eligibility.tactics.filter(item => item.tacticId !== 'defensive_no_trade'),
    }, scorecard)).toThrow(/eligible defensive fallback/)
  })

  it('rejects catalog-version drift before consulting scorecard evidence', () => {
    const features = strategicFeatures()
    const eligibility = evaluateTacticEligibility(features)
    const tactics = eligibility.tactics.map(item => item.tacticId === 'regime_signed_breakout_pullback'
      ? { ...item, tacticVersion: 'stale-v0' }
      : item)
    const route = routeEligibleTactics(features, { ...eligibility, tactics }, createEmptyTacticScorecard('2026-02-01T00:00:00.000Z'))
    expect(route.rejected.find(item => item.tacticId === 'regime_signed_breakout_pullback'))
      .toMatchObject({ reasons: ['catalog_version_mismatch'], evidenceScope: null })
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
      { ...candidate, evidenceScope: 'global' },
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
