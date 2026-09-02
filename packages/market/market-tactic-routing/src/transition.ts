import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import type { TacticId } from '@deepseek-ai/dsh-market-tactic-eligibility'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_TRANSITION_POLICY_VERSION,
  type TacticRouteCandidate,
  type TacticRoutingRecord,
  type TacticTransitionDecision,
  type TacticTransitionReason,
  type TacticTransitionState,
} from './types.ts'

/** Preregistered minimum hold and challenger advantage for deterministic tactic changes. */
export const TACTIC_TRANSITION_POLICY = deepFreeze({
  minimumHoldRoutableSessions: 5,
  minimumChallengerScoreAdvantage: 0.03,
})

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function heldSessions(tacticId: TacticId, previous: number): number {
  return tacticId === 'defensive_no_trade' ? 0 : previous + 1
}

function candidate(route: TacticRoutingRecord, tacticId: TacticId): TacticRouteCandidate | undefined {
  return route.slate.find(item => item.tacticId === tacticId)
}

function decision(
  route: TacticRoutingRecord,
  state: TacticTransitionState | undefined,
  selectedTacticId: TacticId,
  challengerTacticId: TacticId,
  heldRoutableSessions: number,
  scoreAdvantage: number | null,
  reason: TacticTransitionReason,
): TacticTransitionDecision {
  const body: Omit<TacticTransitionDecision, 'transitionId'> = {
    transitionPolicyVersion: TACTIC_TRANSITION_POLICY_VERSION,
    routeId: route.routeId,
    priorTacticId: state?.tacticId ?? null,
    challengerTacticId,
    selectedTacticId,
    heldRoutableSessions,
    scoreAdvantage,
    reason,
  }
  return deepFreeze({ ...body, transitionId: contentHash(body) })
}

/**
 * Select one tactic from a deterministic route while suppressing unsupported discretionary switches.
 * @param route - Current content-addressed route and defensive fallback.
 * @param state - Previous selected tactic and completed routable holding sessions, when available.
 * @returns Content-addressed selected tactic, updated hold count, score advantage, and transition reason.
 */
export function selectTacticTransition(
  route: TacticRoutingRecord,
  state?: TacticTransitionState,
): TacticTransitionDecision {
  const challenger = route.slate[0] as TacticRouteCandidate
  if (state === undefined) {
    return decision(route, state, challenger.tacticId, challenger.tacticId,
      heldSessions(challenger.tacticId, 0), null, 'initial_selection')
  }
  if (challenger.tacticId === state.tacticId) {
    return decision(route, state, state.tacticId, challenger.tacticId,
      heldSessions(state.tacticId, state.heldRoutableSessions), 0, 'retain_leader')
  }
  if (state.tacticId === 'defensive_no_trade') {
    return decision(route, state, challenger.tacticId, challenger.tacticId,
      heldSessions(challenger.tacticId, 0), challenger.routeScore, 'enter_from_defense')
  }
  const incumbent = candidate(route, state.tacticId)
  if (incumbent === undefined) {
    return decision(route, state, challenger.tacticId, challenger.tacticId,
      heldSessions(challenger.tacticId, 0), null, 'incumbent_unavailable')
  }
  const advantage = rounded(challenger.routeScore - incumbent.routeScore)
  if (state.heldRoutableSessions < TACTIC_TRANSITION_POLICY.minimumHoldRoutableSessions) {
    return decision(route, state, state.tacticId, challenger.tacticId,
      heldSessions(state.tacticId, state.heldRoutableSessions), advantage, 'retain_minimum_hold')
  }
  if (advantage < TACTIC_TRANSITION_POLICY.minimumChallengerScoreAdvantage) {
    return decision(route, state, state.tacticId, challenger.tacticId,
      heldSessions(state.tacticId, state.heldRoutableSessions), advantage, 'retain_score_margin')
  }
  return decision(route, state, challenger.tacticId, challenger.tacticId,
    heldSessions(challenger.tacticId, 0), advantage, 'switch_challenger')
}
