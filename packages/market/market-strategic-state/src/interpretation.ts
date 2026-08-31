import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { resolveMaoMethodApplication } from './mao-methods.ts'
import type { StrategicFeatureRecord, StrategicInterpretationDraft, StrategicStateRecord } from './types.ts'

/** Rejection at the deterministic/model interpretation boundary. */
export class StrategicInterpretationValidationError extends Error {
  /** Stable programmatic category for an interpretation that cannot become actionable. */
  readonly code = 'STRATEGIC_INTERPRETATION_INVALID' as const

  constructor(message: string) {
    super(`strategic interpretation invalid: ${message}`)
    this.name = 'StrategicInterpretationValidationError'
  }
}

function requireText(value: string, field: string): void {
  if (value.length === 0 || value.trim() !== value) throw new StrategicInterpretationValidationError(`${field} must be non-blank and trimmed`)
}

function requireRefs(refs: readonly string[], field: string, available: ReadonlySet<string>): void {
  if (refs.length === 0) throw new StrategicInterpretationValidationError(`${field} must not be empty`)
  if (new Set(refs).size !== refs.length) throw new StrategicInterpretationValidationError(`${field} contains duplicates`)
  for (const ref of refs) {
    if (!available.has(ref)) throw new StrategicInterpretationValidationError(`${field} cites unknown evidence ${JSON.stringify(ref)}`)
  }
}

/**
 * Validate model interpretation against deterministic evidence and enrich Maoist method attribution.
 * @param features - Frozen deterministic facts that the model was allowed to inspect.
 * @param draft - Structured model interpretation containing evidence references, not free facts.
 * @param decisionTime - Explicit replay time used for staleness checks; no ambient clock is read.
 * @param maximumAgeHours - Maximum allowed age before any actionable posture is rejected.
 * @returns A deeply frozen final record; incomplete inputs can only produce `no_trade`.
 */
export function buildStrategicStateRecord(
  features: StrategicFeatureRecord,
  draft: StrategicInterpretationDraft,
  decisionTime: string,
  maximumAgeHours: number,
): StrategicStateRecord {
  requireText(draft.principalContradiction, 'principalContradiction')
  requireText(draft.leastResistanceBattlefield, 'leastResistanceBattlefield')
  if (!Number.isFinite(draft.confidence) || draft.confidence < 0 || draft.confidence > 1) {
    throw new StrategicInterpretationValidationError('confidence must be from 0 to 1')
  }
  if (!Number.isFinite(maximumAgeHours) || maximumAgeHours < 0) {
    throw new StrategicInterpretationValidationError('maximumAgeHours must be finite and non-negative')
  }
  if (draft.transitionConditions.length === 0) throw new StrategicInterpretationValidationError('transitionConditions must not be empty')
  draft.transitionConditions.forEach((value, index) => {
    requireText(value, `transitionConditions[${String(index)}]`)
  })
  const available = new Set(features.evidence.map(item => item.ref))
  requireRefs(draft.supportingEvidenceRefs, 'supportingEvidenceRefs', available)
  requireRefs(draft.counterEvidenceRefs, 'counterEvidenceRefs', available)
  if (draft.maoMethodApplications.length === 0) throw new StrategicInterpretationValidationError('maoMethodApplications must not be empty')
  for (const [index, application] of draft.maoMethodApplications.entries()) {
    requireText(application.application, `maoMethodApplications[${String(index)}].application`)
    requireText(application.limitation, `maoMethodApplications[${String(index)}].limitation`)
    requireRefs(application.evidenceRefs, `maoMethodApplications[${String(index)}].evidenceRefs`, available)
  }
  const cutoff = Date.parse(features.cutoffTime)
  const at = Date.parse(decisionTime)
  if (!Number.isFinite(cutoff) || !Number.isFinite(at)) throw new StrategicInterpretationValidationError('decisionTime and cutoffTime must be ISO timestamps')
  const stale = at < cutoff || at - cutoff > maximumAgeHours * 3_600_000
  const forcedNoTrade = !features.eligibleForInterpretation || stale
  if (forcedNoTrade && draft.eligiblePosture !== 'no_trade') {
    throw new StrategicInterpretationValidationError(stale
      ? 'stale or time-inconsistent features require no_trade'
      : 'unavailable deterministic components require no_trade')
  }
  return deepFreeze({
    features,
    interpretation: {
      ...draft,
      maoMethodApplications: draft.maoMethodApplications.map(resolveMaoMethodApplication),
    },
    actionable: !forcedNoTrade && draft.eligiblePosture !== 'no_trade' && draft.confidence >= 0.5,
  })
}
