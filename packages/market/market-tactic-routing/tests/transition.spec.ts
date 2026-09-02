import { describe, expect, it } from 'vitest'
import { evaluateTacticEligibility } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  routeEligibleTactics,
  selectTacticTransition,
  TACTIC_TRANSITION_POLICY,
  type TacticRoutingRecord,
} from '../src/index.ts'
import { outcomes, strategicFeatures } from './fixtures.ts'

function route(scores: readonly [Parameters<typeof outcomes>[0], number][]): TacticRoutingRecord {
  const features = strategicFeatures()
  const scorecard = advanceTacticScorecard(
    createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
    scores.flatMap(([tacticId, netReturn]) => outcomes(tacticId, 8, {
      netReturn,
      doubledCostNetReturn: netReturn * 0.8,
    })),
    '2026-02-01T00:00:00.000Z',
  )
  return routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
}

describe('deterministic tactic transition policy', () => {
  it('creates an initial selection and retains the current leader deterministically', () => {
    const active = route([['regime_signed_breakout_pullback', 0.04]])
    const initial = selectTacticTransition(active)
    expect(initial).toMatchObject({
      priorTacticId: null,
      selectedTacticId: 'regime_signed_breakout_pullback',
      reason: 'initial_selection',
      heldRoutableSessions: 1,
    })
    expect(selectTacticTransition(active, {
      tacticId: initial.selectedTacticId,
      heldRoutableSessions: initial.heldRoutableSessions,
    })).toMatchObject({
      priorTacticId: 'regime_signed_breakout_pullback',
      selectedTacticId: 'regime_signed_breakout_pullback',
      reason: 'retain_leader',
      heldRoutableSessions: 2,
    })
  })

  it('enters from defense and exits immediately when the incumbent disappears', () => {
    const active = route([['regime_signed_breakout_pullback', 0.04]])
    const entered = selectTacticTransition(active, {
      tacticId: 'defensive_no_trade',
      heldRoutableSessions: 0,
    })
    expect(entered).toMatchObject({
      selectedTacticId: 'regime_signed_breakout_pullback',
      reason: 'enter_from_defense',
      heldRoutableSessions: 1,
    })
    const defense = route([])
    expect(selectTacticTransition(defense, {
      tacticId: 'regime_signed_breakout_pullback',
      heldRoutableSessions: 2,
    })).toMatchObject({
      selectedTacticId: 'defensive_no_trade',
      reason: 'incumbent_unavailable',
      heldRoutableSessions: 0,
    })
  })

  it('retains during the minimum hold and until the challenger clears the score margin', () => {
    const close = route([
      ['openable_emotion_leader', 0.04],
      ['regime_signed_breakout_pullback', 0.039],
    ])
    const incumbent = close.slate.find(item => item.tacticId !== close.slate[0]!.tacticId)!
    expect(selectTacticTransition(close, {
      tacticId: incumbent.tacticId,
      heldRoutableSessions: TACTIC_TRANSITION_POLICY.minimumHoldRoutableSessions - 1,
    })).toMatchObject({
      selectedTacticId: incumbent.tacticId,
      reason: 'retain_minimum_hold',
    })
    expect(selectTacticTransition(close, {
      tacticId: incumbent.tacticId,
      heldRoutableSessions: TACTIC_TRANSITION_POLICY.minimumHoldRoutableSessions,
    })).toMatchObject({
      selectedTacticId: incumbent.tacticId,
      reason: 'retain_score_margin',
    })
  })

  it('switches after the hold when the challenger has a sufficient score advantage', () => {
    const decisive = route([
      ['openable_emotion_leader', 0.08],
      ['regime_signed_breakout_pullback', 0.02],
    ])
    const incumbent = decisive.slate.find(item => item.tacticId === 'regime_signed_breakout_pullback')!
    const decision = selectTacticTransition(decisive, {
      tacticId: incumbent.tacticId,
      heldRoutableSessions: TACTIC_TRANSITION_POLICY.minimumHoldRoutableSessions,
    })
    expect(decision).toMatchObject({
      selectedTacticId: 'openable_emotion_leader',
      reason: 'switch_challenger',
      heldRoutableSessions: 1,
    })
    expect(decision.transitionId).toMatch(/^[a-f0-9]{64}$/u)
  })
})
