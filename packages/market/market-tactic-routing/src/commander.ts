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
  type TacticSpecialistReportInput,
  type TacticSpecialistRole,
  type TacticRouteCandidate,
  type TacticRoutingRecord,
} from './types.ts'

const HASH_PATTERN = /^[a-f0-9]{64}$/u

/** Fixed expert registry available to the model-led tactic planner. */
export const TACTIC_SPECIALIST_ROLES: readonly TacticSpecialistRole[] = deepFreeze([
  'short_sentiment',
  'big_bull_trend',
  'short_fast',
  'oversold_reversal',
  'sector_rotation',
])

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

function routedCandidate(route: TacticRoutingRecord, tacticId: TacticId): TacticRouteCandidate | undefined {
  const found = tacticId === 'defensive_no_trade'
    ? route.defensiveFallback
    : route.slate.find(item => item.tacticId === tacticId)
  return found
}

function advisoryCandidate(route: TacticRoutingRecord, tacticId: TacticId) {
  const found = route.advisoryUniverse.find(item => item.tacticId === tacticId)
  if (found === undefined) throw new Error(`commander tactic ${tacticId} is outside the hard-feasible advisory universe`)
  return found
}

function scopeOf(selected: readonly (TacticRouteCandidate | undefined)[]): TacticCommanderScope {
  if (selected.some(item => item === undefined)) return 'research'
  const routed = selected.filter((item): item is TacticRouteCandidate => item !== undefined)
  if (routed[0]?.tacticId === 'defensive_no_trade') return 'defense'
  if (routed.some(item => item.scope === 'research')) return 'research'
  if (routed.some(item => item.scope === 'watch')) return 'watch'
  return 'paper'
}

function normalizedText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    throw new TypeError(`${field} must be a normalized non-empty string`)
  }
  return value
}

function normalizeSpecialistReports(
  route: TacticRoutingRecord,
  selectedRoles: readonly TacticSpecialistRole[],
  value: readonly TacticSpecialistReportInput[],
): readonly TacticSpecialistReportInput[] {
  const untrusted: unknown = value
  if (!Array.isArray(untrusted) || untrusted.length !== selectedRoles.length) {
    throw new TypeError('specialist reports must exactly match the selected specialist set')
  }
  const reports: readonly TacticSpecialistReportInput[] = value
  const allowedEvidence = new Set(route.advisoryUniverse.flatMap(item => item.evidenceRefs))
  const allowedTactics = new Set(route.advisoryUniverse.map(item => item.tacticId))
  return reports.map((report, index) => {
    if (report.role !== selectedRoles[index]
      || !['support', 'oppose', 'conditional'].includes(report.verdict)
      || !Array.isArray(report.preferredTacticIds)
      || report.preferredTacticIds.some(tacticId => !isTacticId(tacticId) || !allowedTactics.has(tacticId))) {
      throw new TypeError('specialist report is outside the selected role or advisory universe')
    }
    const supportingEvidenceRefs = normalizedStrings(report.supportingEvidenceRefs, 'specialist supportingEvidenceRefs', true)
    const counterEvidenceRefs = normalizedStrings(report.counterEvidenceRefs, 'specialist counterEvidenceRefs', true)
    if ([...supportingEvidenceRefs, ...counterEvidenceRefs].some(ref => !allowedEvidence.has(ref))) {
      throw new Error('specialist report cites evidence outside the advisory universe')
    }
    if (!Number.isFinite(report.confidence) || report.confidence < 0 || report.confidence > 1) {
      throw new TypeError('specialist confidence must be between zero and one')
    }
    return {
      role: report.role,
      verdict: report.verdict,
      preferredTacticIds: report.preferredTacticIds,
      analysis: normalizedText(report.analysis, 'specialist analysis'),
      supportingEvidenceRefs,
      counterEvidenceRefs,
      confidence: report.confidence,
      invalidationConditions: normalizedStrings(report.invalidationConditions, 'specialist invalidationConditions', false),
    }
  })
}

function normalizeProposal(
  route: TacticRoutingRecord,
  input: TacticCommanderProposalInput,
): { readonly proposal: TacticCommanderProposalInput; readonly selected: readonly (TacticRouteCandidate | undefined)[] } {
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
  const selectedAdvisory = [
    advisoryCandidate(route, input.primaryTacticId),
    ...input.secondaryTacticId === null ? [] : [advisoryCandidate(route, input.secondaryTacticId)],
  ]
  const selected = [
    routedCandidate(route, input.primaryTacticId),
    ...input.secondaryTacticId === null ? [] : [routedCandidate(route, input.secondaryTacticId)],
  ]
  const activeAdvisory = route.advisoryUniverse.some(item => item.tacticId !== 'defensive_no_trade')
  const selectedSpecialists = normalizedStrings(input.selectedSpecialists, 'commander selectedSpecialists', !activeAdvisory)
  if (selectedSpecialists.length !== (activeAdvisory ? 2 : 0)
    || selectedSpecialists.some(role => !TACTIC_SPECIALIST_ROLES.includes(role as TacticSpecialistRole))) {
    throw new TypeError('commander specialist selection does not match the advisory universe')
  }
  const roles = selectedSpecialists as readonly TacticSpecialistRole[]
  const specialistReports = normalizeSpecialistReports(route, roles, input.specialistReports)
  const evidenceRefs = normalizedStrings(input.evidenceRefs, 'commander evidenceRefs', false)
  const allowedEvidence = new Set(selectedAdvisory.flatMap(item => item.evidenceRefs))
  if (evidenceRefs.some(ref => !allowedEvidence.has(ref))) {
    throw new Error('commander proposal cites evidence outside its selected advisory tactics')
  }
  const counterEvidenceRefs = normalizedStrings(input.counterEvidenceRefs, 'commander counterEvidenceRefs', true)
  const routeEvidence = new Set(route.advisoryUniverse.flatMap(item => item.evidenceRefs))
  if (counterEvidenceRefs.some(ref => !routeEvidence.has(ref))) {
    throw new Error('commander proposal cites counter-evidence outside the deterministic route')
  }
  const routeRecommendation = new Set(route.slate.map(item => item.tacticId))
  const followsRoute = selectedAdvisory.every(item => routeRecommendation.has(item.tacticId))
  if (input.quantRouteDisposition !== (followsRoute ? 'follow' : 'override')) {
    throw new Error('commander quant route disposition does not match the selected tactics')
  }
  if (!followsRoute && counterEvidenceRefs.length === 0) {
    throw new Error('commander override requires counter-evidence against the quantitative route')
  }
  if (!['no_trade', 'observe', 'probe', 'attack'].includes(input.posture)) {
    throw new TypeError('commander posture is not registered')
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
      selectedSpecialists: roles,
      specialistReports,
      marketPhase: normalizedText(input.marketPhase, 'commander marketPhase'),
      principalContradiction: normalizedText(input.principalContradiction, 'commander principalContradiction'),
      rewardedStyle: normalizedText(input.rewardedStyle, 'commander rewardedStyle'),
      posture: input.posture,
      quantRouteDisposition: input.quantRouteDisposition,
      quantRouteAssessment: normalizedText(input.quantRouteAssessment, 'commander quantRouteAssessment'),
      primaryTacticId: input.primaryTacticId,
      secondaryTacticId: input.secondaryTacticId,
      stockMissions: normalizedStrings(input.stockMissions, 'commander stockMissions', false),
      thesis: normalizedText(input.thesis, 'commander thesis'),
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
 * Apply host-owned advisory membership, promotion scope, and final risk veto to one model proposal.
 * @param routeInput - Exact content-addressed quantitative route and hard-feasible advisory universe.
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
  const maximumPaperPositionPct = finalSelected.reduce((sum, item) => sum + (item?.maximumPaperPositionPct ?? 0), 0)
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
