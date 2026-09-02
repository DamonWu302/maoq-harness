import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import {
  isTacticId,
  type TacticId,
} from '@deepseek-ai/dsh-market-tactic-eligibility'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { verifyTacticRoutingRecord } from './router.ts'
import {
  TACTIC_COMMANDER_POLICY_VERSION,
  TACTIC_COMMANDER_SCHEMA_VERSION,
  type TacticCommanderDecisionRecord,
  type TacticCommanderProposalInput,
  type TacticCommanderRiskInput,
  type TacticCommanderScope,
  type TacticRouteCandidate,
  type TacticRoutingRecord,
} from './types.ts'

const HASH_PATTERN = /^[a-f0-9]{64}$/u

function normalizedStrings(values: readonly string[], field: string, allowEmpty: boolean): readonly string[] {
  const untrusted: unknown = values
  if (!Array.isArray(untrusted)) {
    throw new TypeError(`${field} must contain unique normalized non-empty strings`)
  }
  const items = untrusted as unknown[]
  const result: string[] = []
  for (const item of items) {
    if (typeof item !== 'string' || item.trim().length === 0 || item !== item.trim()) {
      throw new TypeError(`${field} must contain unique normalized non-empty strings`)
    }
    result.push(item)
  }
  if ((!allowEmpty && result.length === 0) || new Set(result).size !== result.length) {
    throw new TypeError(`${field} must contain unique normalized non-empty strings`)
  }
  return result
}

function candidate(route: TacticRoutingRecord, tacticId: TacticId): TacticRouteCandidate {
  const found = tacticId === 'defensive_no_trade'
    ? route.defensiveFallback
    : route.slate.find(item => item.tacticId === tacticId)
  if (found === undefined) throw new Error(`commander tactic ${tacticId} is outside deterministic route ${route.routeId}`)
  return found
}

function scopeOf(selected: readonly TacticRouteCandidate[]): TacticCommanderScope {
  if (selected[0]?.tacticId === 'defensive_no_trade') return 'defense'
  if (selected.some(item => item.scope === 'research')) return 'research'
  if (selected.some(item => item.scope === 'watch')) return 'watch'
  return 'paper'
}

function normalizeProposal(
  route: TacticRoutingRecord,
  input: TacticCommanderProposalInput,
): { readonly proposal: TacticCommanderProposalInput; readonly selected: readonly TacticRouteCandidate[] } {
  if (input.routeId !== route.routeId || !HASH_PATTERN.test(input.routeId)) {
    throw new Error('commander proposal does not target the deterministic route')
  }
  const untrustedPrimary: unknown = input.primaryTacticId
  const untrustedSecondary: unknown = input.secondaryTacticId
  if (!isTacticId(untrustedPrimary)
    || (untrustedSecondary !== null && !isTacticId(untrustedSecondary))) {
    throw new TypeError('commander proposal contains an unregistered tactic')
  }
  if (input.secondaryTacticId === input.primaryTacticId) {
    throw new TypeError('commander primary and secondary tactics must differ')
  }
  if (input.primaryTacticId === 'defensive_no_trade' && input.secondaryTacticId !== null) {
    throw new TypeError('defensive no-trade cannot have a secondary tactic')
  }
  if (input.secondaryTacticId === 'defensive_no_trade') {
    throw new TypeError('defensive no-trade cannot be a secondary tactic')
  }
  const selected = [
    candidate(route, input.primaryTacticId),
    ...input.secondaryTacticId === null ? [] : [candidate(route, input.secondaryTacticId)],
  ]
  const evidenceRefs = normalizedStrings(input.evidenceRefs, 'commander evidenceRefs', false)
  const allowedEvidence = new Set(selected.flatMap(item => item.evidenceRefs))
  if (evidenceRefs.some(ref => !allowedEvidence.has(ref))) {
    throw new Error('commander proposal cites evidence outside its selected routed tactics')
  }
  const counterEvidenceRefs = normalizedStrings(input.counterEvidenceRefs, 'commander counterEvidenceRefs', true)
  const routeEvidence = new Set([
    ...route.slate.flatMap(item => item.evidenceRefs),
    ...route.defensiveFallback.evidenceRefs,
  ])
  if (counterEvidenceRefs.some(ref => !routeEvidence.has(ref))) {
    throw new Error('commander proposal cites counter-evidence outside the deterministic route')
  }
  if (typeof input.thesis !== 'string' || input.thesis.trim().length === 0 || input.thesis !== input.thesis.trim()) {
    throw new TypeError('commander thesis must be a normalized non-empty string')
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new TypeError('commander confidence must be between zero and one')
  }
  const invalidationConditions = normalizedStrings(
    input.invalidationConditions,
    'commander invalidationConditions',
    false,
  )
  return {
    proposal: {
      routeId: route.routeId,
      primaryTacticId: input.primaryTacticId,
      secondaryTacticId: input.secondaryTacticId,
      thesis: input.thesis,
      evidenceRefs,
      counterEvidenceRefs,
      confidence: input.confidence,
      invalidationConditions,
    },
    selected,
  }
}

function normalizeRisk(route: TacticRoutingRecord, input: TacticCommanderRiskInput): TacticCommanderRiskInput {
  if (input.routeId !== route.routeId) throw new Error('risk review does not target the deterministic route')
  const untrustedApproved: unknown = input.approved
  const untrustedVerdict: unknown = input.verdict
  if (typeof untrustedApproved !== 'boolean'
    || (untrustedVerdict !== 'approve' && untrustedVerdict !== 'veto')) {
    throw new TypeError('risk verdict must be approve or veto')
  }
  if (untrustedApproved !== (untrustedVerdict === 'approve')) {
    throw new Error('risk review has an inconsistent verdict')
  }
  return {
    routeId: route.routeId,
    approved: input.approved,
    verdict: input.verdict,
    reasons: normalizedStrings(input.reasons, 'risk reasons', false),
    hardLimits: normalizedStrings(input.hardLimits, 'risk hardLimits', false),
    invalidationConditions: normalizedStrings(input.invalidationConditions, 'risk invalidationConditions', false),
  }
}

/**
 * Apply host-owned route membership, promotion scope, and final risk veto to one model proposal.
 * @param routeInput - Exact content-addressed deterministic top-three route.
 * @param proposalInput - Model proposal limited to at most one primary and one secondary tactic.
 * @param riskInput - Independent review whose veto replaces the final action with defense.
 * @returns Immutable P2 decision record suitable for replay and attribution.
 */
export function createTacticCommanderDecision(
  routeInput: TacticRoutingRecord,
  proposalInput: TacticCommanderProposalInput,
  riskInput: TacticCommanderRiskInput,
): TacticCommanderDecisionRecord {
  const route = verifyTacticRoutingRecord(routeInput)
  const { proposal, selected } = normalizeProposal(route, proposalInput)
  const risk = normalizeRisk(route, riskInput)
  const status = risk.approved ? 'approved' : 'vetoed'
  const finalPrimaryTacticId = risk.approved ? proposal.primaryTacticId : route.defensiveFallback.tacticId
  const finalSecondaryTacticId = risk.approved ? proposal.secondaryTacticId : null
  const finalSelected = risk.approved ? selected : [route.defensiveFallback]
  const scope = risk.approved ? scopeOf(selected) : 'defense'
  const maximumPaperPositionPct = finalSelected.reduce((sum, item) => sum + item.maximumPaperPositionPct, 0)
  const body: Omit<TacticCommanderDecisionRecord, 'decisionId'> = {
    schemaVersion: TACTIC_COMMANDER_SCHEMA_VERSION,
    policyVersion: TACTIC_COMMANDER_POLICY_VERSION,
    routeId: route.routeId,
    tradingDate: route.tradingDate,
    cutoffTime: route.cutoffTime,
    status,
    scope,
    proposal,
    risk,
    finalPrimaryTacticId,
    finalSecondaryTacticId,
    maximumPaperPositionPct,
    cashFloorPct: Math.max(route.cashFloorPct, 100 - maximumPaperPositionPct),
  }
  return deepFreeze({ ...body, decisionId: contentHash(body) })
}

/**
 * Verify a serialized commander decision against its exact deterministic route.
 * @param value - Untrusted parsed decision.
 * @param route - Verified route referenced by the decision.
 * @returns Canonical immutable decision when every derived field and identity matches.
 */
export function verifyTacticCommanderDecisionRecord(
  value: unknown,
  route: TacticRoutingRecord,
): TacticCommanderDecisionRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('invalid tactic commander decision record')
  }
  const record = value as Record<string, unknown>
  if (record['schemaVersion'] !== TACTIC_COMMANDER_SCHEMA_VERSION
    || record['policyVersion'] !== TACTIC_COMMANDER_POLICY_VERSION
    || typeof record['decisionId'] !== 'string'
    || !HASH_PATTERN.test(record['decisionId'])
    || typeof record['proposal'] !== 'object'
    || record['proposal'] === null
    || typeof record['risk'] !== 'object'
    || record['risk'] === null) {
    throw new TypeError('invalid tactic commander decision record')
  }
  const canonical = createTacticCommanderDecision(
    route,
    record['proposal'] as unknown as TacticCommanderProposalInput,
    record['risk'] as unknown as TacticCommanderRiskInput,
  )
  if (canonical.decisionId !== record['decisionId'] || contentHash(value) !== contentHash(canonical)) {
    throw new Error('tactic commander decision identity mismatch')
  }
  return canonical
}
