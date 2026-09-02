import { describe, expect, it } from 'vitest'
import { evaluateTacticEligibility } from '@deepseek-ai/dsh-market-tactic-eligibility'
import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  createTacticCommanderDecision,
  routeEligibleTactics,
  verifyTacticCommanderDecisionRecord,
  verifyTacticRoutingRecord,
  type TacticRoutingRecord,
} from '../src/index.ts'
import { outcomes, strategicFeatures } from './fixtures.ts'

function qualifiedRoute(): TacticRoutingRecord {
  const features = strategicFeatures()
  const scorecard = advanceTacticScorecard(createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'), [
    ...outcomes('regime_signed_breakout_pullback', 8, { netReturn: 0.04, doubledCostNetReturn: 0.03 }),
    ...outcomes('openable_emotion_leader', 8, { netReturn: 0.03, doubledCostNetReturn: 0.02 }),
    ...outcomes('correlation_cluster_sector_rotation', 8, { netReturn: 0.025, doubledCostNetReturn: 0.015 }),
  ], '2026-02-01T00:00:00.000Z')
  return routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
}

function proposal(route: TacticRoutingRecord) {
  const specialists = ['big_bull_trend', 'short_sentiment'] as const
  const reports = specialists.map((role, index) => ({
    role,
    verdict: index === 0 ? 'support' as const : 'conditional' as const,
    preferredTacticIds: [index === 0 ? 'regime_signed_breakout_pullback' as const : 'openable_emotion_leader' as const],
    analysis: `${role} finds a bounded opportunity.`,
    supportingEvidenceRefs: route.advisoryUniverse.find(item => item.tacticId === (index === 0
      ? 'regime_signed_breakout_pullback'
      : 'openable_emotion_leader'))!.evidenceRefs,
    counterEvidenceRefs: [],
    confidence: 0.65,
    invalidationConditions: ['The cited evidence reverses.'],
  }))
  return {
    routeId: route.routeId,
    selectedSpecialists: specialists,
    specialistReports: reports,
    marketPhase: 'Risk-on trend with startup emotion',
    principalContradiction: 'Trend continuation versus early crowding.',
    rewardedStyle: 'Liquid sector-confirmed leaders',
    posture: 'probe' as const,
    quantRouteDisposition: 'follow' as const,
    quantRouteAssessment: 'The quantitative route and expert evidence align.',
    primaryTacticId: 'regime_signed_breakout_pullback' as const,
    secondaryTacticId: 'openable_emotion_leader' as const,
    stockMissions: ['Find liquid leaders with sector confirmation and executable invalidation.'],
    thesis: 'Trend evidence leads while emotion leadership supplies a bounded secondary attack.',
    evidenceRefs: [
      ...route.slate.find(item => item.tacticId === 'regime_signed_breakout_pullback')!.evidenceRefs,
      ...route.slate.find(item => item.tacticId === 'openable_emotion_leader')!.evidenceRefs,
    ],
    counterEvidenceRefs: [],
    confidence: 0.71,
    invalidationConditions: ['The routed trend or emotion evidence loses qualification.'],
  }
}

function risk(route: TacticRoutingRecord, approved = true) {
  return {
    routeId: route.routeId,
    approved,
    verdict: approved ? 'approve' as const : 'veto' as const,
    reasons: [approved ? 'The proposal stays inside the route.' : 'The evidence is insufficient for attack.'],
    hardLimits: ['Research scope cannot create a paper position.'],
    invalidationConditions: ['Any route identity change requires a new review.'],
  }
}

function routeWithScope(route: TacticRoutingRecord, scope: 'watch' | 'paper'): TacticRoutingRecord {
  const { routeId: _routeId, ...body } = route
  const slate = body.slate.map((item, index) => index === 0
    ? { ...item, scope, maximumPaperPositionPct: scope === 'paper' ? 12 : 0 }
    : item)
  const scopedBody = { ...body, slate }
  return { ...scopedBody, routeId: contentHash(scopedBody) }
}

describe('model-led tactic council', () => {
  it('preserves a routed research selection without creating paper authority', () => {
    const route = qualifiedRoute()
    const decision = createTacticCommanderDecision(route, proposal(route), risk(route))
    expect(decision).toMatchObject({
      status: 'approved',
      scope: 'research',
      finalPrimaryTacticId: 'regime_signed_breakout_pullback',
      finalSecondaryTacticId: 'openable_emotion_leader',
      maximumPaperPositionPct: 0,
      cashFloorPct: 100,
    })
    expect(decision.decisionId).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('turns an independent veto into final defense while retaining the proposal for attribution', () => {
    const route = qualifiedRoute()
    const decision = createTacticCommanderDecision(route, proposal(route), risk(route, false))
    expect(decision).toMatchObject({
      status: 'vetoed',
      scope: 'defense',
      finalPrimaryTacticId: 'defensive_no_trade',
      finalSecondaryTacticId: null,
      maximumPaperPositionPct: 0,
      proposal: { primaryTacticId: 'regime_signed_breakout_pullback' },
    })
  })

  it('keeps the defensive fallback selectable when three active tactics fill the slate', () => {
    const route = qualifiedRoute()
    expect(route.slate).toHaveLength(3)
    expect(route.slate.every(item => item.tacticId !== 'defensive_no_trade')).toBe(true)
    const decision = createTacticCommanderDecision(route, {
      routeId: route.routeId,
      selectedSpecialists: proposal(route).selectedSpecialists,
      specialistReports: proposal(route).specialistReports,
      marketPhase: 'Qualified tactics face unusually high resistance.',
      principalContradiction: 'Nominal qualification versus unfavorable payoff asymmetry.',
      rewardedStyle: 'Cash and optionality',
      posture: 'no_trade',
      quantRouteDisposition: 'override',
      quantRouteAssessment: 'The active slate is qualified but contradicted by its own routed evidence.',
      primaryTacticId: 'defensive_no_trade',
      secondaryTacticId: null,
      stockMissions: ['Wait for a materially stronger evidence margin.'],
      thesis: 'The active routes remain qualified, but their combined resistance does not justify attack.',
      evidenceRefs: route.defensiveFallback.evidenceRefs,
      counterEvidenceRefs: route.slate.flatMap(item => item.evidenceRefs),
      confidence: 0.6,
      invalidationConditions: ['One active route gains a materially stronger evidence margin.'],
    }, risk(route))
    expect(decision).toMatchObject({ scope: 'defense', finalPrimaryTacticId: 'defensive_no_trade' })
  })

  it('allows an evidenced research-only override but rejects unknown evidence', () => {
    const route = qualifiedRoute()
    const advisory = route.advisoryUniverse.find(item => item.tacticId === 'sector_residual_strength')!
    const overridden = createTacticCommanderDecision(route, {
      ...proposal(route),
      primaryTacticId: 'sector_residual_strength',
      secondaryTacticId: null,
      quantRouteDisposition: 'override',
      quantRouteAssessment: 'The scorecard lags a fresh residual-strength structure.',
      evidenceRefs: advisory.evidenceRefs,
      counterEvidenceRefs: route.slate[0]!.evidenceRefs,
    }, risk(route))
    expect(overridden).toMatchObject({ scope: 'research', maximumPaperPositionPct: 0, cashFloorPct: 100 })
    expect(() => createTacticCommanderDecision(route, {
      ...proposal(route),
      evidenceRefs: ['snapshot:unrouted#claim'],
    }, risk(route))).toThrow(/outside its selected advisory tactics/)
  })

  it('rejects incoherent defense and tampered route identities', () => {
    const route = qualifiedRoute()
    expect(() => createTacticCommanderDecision(route, {
      ...proposal(route),
      secondaryTacticId: 'defensive_no_trade',
    }, risk(route))).toThrow(/cannot be a secondary/)
    const tampered = { ...route, cashFloorPct: 99 }
    expect(() => verifyTacticRoutingRecord(tampered)).toThrow(/identity mismatch/)
  })

  it('derives watch and paper authority exclusively from the verified route', () => {
    for (const scope of ['watch', 'paper'] as const) {
      const route = routeWithScope(qualifiedRoute(), scope)
      const primary = route.slate[0]!
      const decision = createTacticCommanderDecision(route, {
        ...proposal(route),
        primaryTacticId: primary.tacticId,
        secondaryTacticId: null,
        evidenceRefs: primary.evidenceRefs,
      }, risk(route))
      expect(decision.scope).toBe(scope)
      expect(decision.maximumPaperPositionPct).toBe(scope === 'paper' ? 12 : 0)
    }
  })

  it('rejects every malformed proposal boundary', () => {
    const route = qualifiedRoute()
    const base = proposal(route)
    const override = route.advisoryUniverse.find(item => item.tacticId === 'sector_residual_strength')!
    const invalid = [
      { ...base, routeId: '0'.repeat(64) },
      { ...base, routeId: 'not-a-hash' },
      { ...base, primaryTacticId: 'unknown' },
      { ...base, secondaryTacticId: 'unknown' },
      { ...base, secondaryTacticId: base.primaryTacticId },
      { ...base, primaryTacticId: 'defensive_no_trade', secondaryTacticId: base.secondaryTacticId },
      { ...base, counterEvidenceRefs: ['outside:route'] },
      { ...base, thesis: ' ' },
      { ...base, confidence: Number.NaN },
      { ...base, confidence: -0.1 },
      { ...base, confidence: 1.1 },
      { ...base, evidenceRefs: 'not-an-array' },
      { ...base, evidenceRefs: [' padded '] },
      { ...base, evidenceRefs: [base.evidenceRefs[0]!, base.evidenceRefs[0]!] },
      { ...base, invalidationConditions: [] },
      { ...base, selectedSpecialists: ['big_bull_trend', 'big_bull_trend'] },
      { ...base, specialistReports: base.specialistReports.slice(0, 1) },
      { ...base, posture: 'reckless' },
      { ...base, quantRouteDisposition: 'override' },
      {
        ...base,
        primaryTacticId: 'sector_residual_strength',
        secondaryTacticId: null,
        evidenceRefs: override.evidenceRefs,
        counterEvidenceRefs: [],
        quantRouteDisposition: 'override',
      },
    ]
    for (const item of invalid) {
      expect(() => createTacticCommanderDecision(
        route,
        item as unknown as Parameters<typeof createTacticCommanderDecision>[1],
        risk(route),
      )).toThrow()
    }
  })

  it('rejects every malformed independent risk boundary', () => {
    const route = qualifiedRoute()
    const base = risk(route)
    const invalid = [
      { ...base, routeId: '0'.repeat(64) },
      { ...base, approved: 'yes' },
      { ...base, verdict: 'maybe' },
      { ...base, approved: true, verdict: 'veto' },
      { ...base, reasons: [] },
      { ...base, hardLimits: ['duplicate', 'duplicate'] },
      { ...base, invalidationConditions: [' padded '] },
    ]
    for (const item of invalid) {
      expect(() => createTacticCommanderDecision(
        route,
        proposal(route),
        item as unknown as Parameters<typeof createTacticCommanderDecision>[2],
      )).toThrow()
    }
  })

  it('round-trips a canonical decision and rejects malformed or tampered records', () => {
    const route = qualifiedRoute()
    const decision = createTacticCommanderDecision(route, proposal(route), risk(route))
    expect(verifyTacticCommanderDecisionRecord(structuredClone(decision), route)).toEqual(decision)
    for (const value of [null, [], 'decision']) {
      expect(() => verifyTacticCommanderDecisionRecord(value, route)).toThrow(/invalid tactic commander/)
    }
    const malformed = [
      { ...decision, schemaVersion: 'bad' },
      { ...decision, policyVersion: 'bad' },
      { ...decision, decisionId: 1 },
      { ...decision, decisionId: 'bad' },
      { ...decision, proposal: null },
      { ...decision, proposal: 'bad' },
      { ...decision, risk: null },
      { ...decision, risk: 'bad' },
    ]
    for (const value of malformed) {
      expect(() => verifyTacticCommanderDecisionRecord(value, route)).toThrow(/invalid tactic commander/)
    }
    expect(() => verifyTacticCommanderDecisionRecord({ ...decision, decisionId: '0'.repeat(64) }, route))
      .toThrow(/identity mismatch/)
    expect(() => verifyTacticCommanderDecisionRecord({ ...decision, extra: true }, route))
      .toThrow(/identity mismatch/)
  })
})
