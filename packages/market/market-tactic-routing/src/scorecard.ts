import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import {
  isTacticId,
  tacticDefinitions,
} from '@deepseek-ai/dsh-market-tactic-eligibility'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  deriveTacticRoutingContext,
  tacticRoutingContextKey,
} from './context.ts'
import {
  TACTIC_CONTEXT_VERSION,
  TACTIC_OUTCOME_SCHEMA_VERSION,
  TACTIC_SCORECARD_SCHEMA_VERSION,
  type MaturedTacticOutcome,
  type MaturedTacticAttributionInput,
  type MaturedTacticOutcomeInput,
  type TacticConditionalMetrics,
  type TacticEvidenceScope,
  type TacticRoutingContext,
  type TacticScorecardEvidence,
  type TacticScorecardCell,
  type TacticScorecardRecord,
} from './types.ts'

const HASH_PATTERN = /^[a-f0-9]{64}$/u
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const RECENT_EFFECTIVENESS_ALPHA = 0.2
const Z_95 = 1.96

const CATALOG_VERSION = new Map(tacticDefinitions().map(definition => [definition.tacticId, definition.tacticVersion]))

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} must be a valid ISO timestamp`)
  return parsed
}

function validateDate(value: string, field: string): void {
  if (!DATE_PATTERN.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new TypeError(`${field} must use YYYY-MM-DD`)
  }
}

function validateContext(context: TacticRoutingContext): void {
  const untrustedContextVersion: unknown = context.contextVersion
  if (untrustedContextVersion !== TACTIC_CONTEXT_VERSION
    || !['risk_on_trend', 'rotation', 'high_volatility_divergence', 'risk_contraction', 'repair'].includes(context.marketRegime)
    || !['startup', 'acceleration', 'climax', 'divergence', 'ebb', 'repair'].includes(context.emotionCycle)
    || !['broad', 'balanced', 'narrow'].includes(context.sectorStructure)
    || !['low', 'normal', 'high'].includes(context.volatilityBand)
    || !['low', 'medium', 'high'].includes(context.crowdingBand)
    || !['unknown', 'weak', 'normal', 'strong'].includes(context.executionQualityBand)) {
    throw new TypeError('matured tactic outcome has an invalid routing context')
  }
}

function normalizedOutcomeInput(input: MaturedTacticOutcomeInput): MaturedTacticOutcomeInput {
  const untrustedTacticId: unknown = input.tacticId
  if (!isTacticId(untrustedTacticId) || untrustedTacticId === 'defensive_no_trade') {
    throw new TypeError('matured tactic outcome requires an active catalog tactic')
  }
  if (CATALOG_VERSION.get(input.tacticId) !== input.tacticVersion) {
    throw new TypeError('matured tactic outcome version does not match the tactic catalog')
  }
  validateDate(input.decisionDate, 'decisionDate')
  validateDate(input.maturityDate, 'maturityDate')
  if (input.maturityDate < input.decisionDate) throw new TypeError('maturityDate must not precede decisionDate')
  const availableAt = timestamp(input.availableAt, 'availableAt')
  if (availableAt < Date.parse(`${input.maturityDate}T00:00:00.000Z`)) {
    throw new TypeError('availableAt must not precede maturityDate')
  }
  validateContext(input.context)
  for (const [field, value] of [
    ['netReturn', input.netReturn],
    ['doubledCostNetReturn', input.doubledCostNetReturn],
    ['maximumDrawdown', input.maximumDrawdown],
    ['fillRate', input.fillRate],
  ] as const) {
    if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite`)
  }
  if (input.netReturn <= -1 || input.doubledCostNetReturn <= -1) {
    throw new TypeError('matured tactic returns must be greater than -1')
  }
  if (input.maximumDrawdown < 0 || input.maximumDrawdown > 1) {
    throw new TypeError('maximumDrawdown must be between zero and one')
  }
  if (input.fillRate < 0 || input.fillRate > 1) throw new TypeError('fillRate must be between zero and one')
  if (input.sourceHashes.length === 0
    || new Set(input.sourceHashes).size !== input.sourceHashes.length
    || input.sourceHashes.some(hash => !HASH_PATTERN.test(hash))) {
    throw new TypeError('sourceHashes must contain unique lowercase SHA-256 values')
  }
  return {
    tacticId: input.tacticId,
    tacticVersion: input.tacticVersion,
    decisionDate: input.decisionDate,
    maturityDate: input.maturityDate,
    availableAt: input.availableAt,
    context: { ...input.context },
    netReturn: input.netReturn,
    doubledCostNetReturn: input.doubledCostNetReturn,
    maximumDrawdown: input.maximumDrawdown,
    fillRate: input.fillRate,
    sourceHashes: [...input.sourceHashes].sort(),
  }
}

/**
 * Validate and content-address one completed tactic observation.
 * @param input - Completed outcome, exact decision context, and source identities.
 * @returns Frozen immutable outcome that becomes visible only at `availableAt`.
 */
export function createMaturedTacticOutcome(input: MaturedTacticOutcomeInput): MaturedTacticOutcome {
  const normalized = normalizedOutcomeInput(input)
  const outcomeId = contentHash({ schemaVersion: TACTIC_OUTCOME_SCHEMA_VERSION, input: normalized })
  return deepFreeze({
    schemaVersion: TACTIC_OUTCOME_SCHEMA_VERSION,
    outcomeId,
    ...normalized,
  })
}

/**
 * Attribute one completed result to the strategic facts knowable at its original decision cutoff.
 * @param input - Outcome facts, original strategic record, and exact source identities.
 * @returns Catalog-versioned immutable outcome with a host-derived context.
 */
export function attributeMaturedTacticOutcome(input: MaturedTacticAttributionInput): MaturedTacticOutcome {
  const tacticVersion = CATALOG_VERSION.get(input.tacticId)
  if (tacticVersion === undefined) throw new TypeError('matured tactic attribution requires an active catalog tactic')
  return createMaturedTacticOutcome({
    tacticId: input.tacticId,
    tacticVersion,
    decisionDate: input.decisionFeatures.tradingDate,
    maturityDate: input.maturityDate,
    availableAt: input.availableAt,
    context: deriveTacticRoutingContext(input.decisionFeatures, input.executionQualityBand),
    netReturn: input.netReturn,
    doubledCostNetReturn: input.doubledCostNetReturn,
    maximumDrawdown: input.maximumDrawdown,
    fillRate: input.fillRate,
    sourceHashes: input.sourceHashes,
  })
}

function scorecardIdentity(record: Omit<TacticScorecardRecord, 'scorecardId'>): string {
  return contentHash(record)
}

/**
 * Create an empty immutable scorecard generation at one cutoff.
 * @param cutoffTime - First exclusive visibility boundary for later outcomes.
 * @returns Frozen empty scorecard.
 */
export function createEmptyTacticScorecard(cutoffTime: string): TacticScorecardRecord {
  timestamp(cutoffTime, 'scorecard cutoffTime')
  const body: Omit<TacticScorecardRecord, 'scorecardId'> = {
    schemaVersion: TACTIC_SCORECARD_SCHEMA_VERSION,
    previousScorecardId: null,
    cutoffTime,
    appliedOutcomeIds: [],
    cells: [],
  }
  return deepFreeze({ ...body, scorecardId: scorecardIdentity(body) })
}

function cellKey(cell: Pick<TacticScorecardCell, 'tacticId' | 'tacticVersion' | 'context'>): string {
  return `${cell.tacticId}|${cell.tacticVersion}|${tacticRoutingContextKey(cell.context)}`
}

function updateCell(previous: TacticScorecardCell | undefined, outcome: MaturedTacticOutcome): TacticScorecardCell {
  const sampleCount = (previous?.sampleCount ?? 0) + 1
  return {
    tacticId: outcome.tacticId,
    tacticVersion: outcome.tacticVersion,
    context: { ...outcome.context },
    sampleCount,
    netReturnSum: rounded((previous?.netReturnSum ?? 0) + outcome.netReturn),
    netReturnSquaredSum: rounded((previous?.netReturnSquaredSum ?? 0) + outcome.netReturn ** 2),
    positiveCount: (previous?.positiveCount ?? 0) + Number(outcome.netReturn > 0),
    positiveReturnSum: rounded((previous?.positiveReturnSum ?? 0) + Math.max(0, outcome.netReturn)),
    negativeReturnAbsSum: rounded((previous?.negativeReturnAbsSum ?? 0) + Math.abs(Math.min(0, outcome.netReturn))),
    maximumDrawdown: rounded(Math.max(previous?.maximumDrawdown ?? 0, outcome.maximumDrawdown)),
    fillRateSum: rounded((previous?.fillRateSum ?? 0) + outcome.fillRate),
    doubledCostReturnSum: rounded((previous?.doubledCostReturnSum ?? 0) + outcome.doubledCostNetReturn),
    recentEffectiveness: rounded(previous === undefined
      ? outcome.netReturn
      : RECENT_EFFECTIVENESS_ALPHA * outcome.netReturn + (1 - RECENT_EFFECTIVENESS_ALPHA) * previous.recentEffectiveness),
    lastAvailableAt: outcome.availableAt,
  }
}

/**
 * Advance one scorecard using only outcomes newly visible in the open-closed cutoff interval.
 * @param previous - Previous immutable aggregate generation.
 * @param outcomes - Outcomes whose `availableAt` is after the previous cutoff and at or before the new cutoff.
 * @param cutoffTime - New inclusive observation cutoff.
 * @returns Frozen next generation with sufficient statistics, not raw market history.
 */
export function advanceTacticScorecard(
  previous: TacticScorecardRecord,
  outcomes: readonly MaturedTacticOutcome[],
  cutoffTime: string,
): TacticScorecardRecord {
  const previousCutoff = timestamp(previous.cutoffTime, 'previous scorecard cutoffTime')
  const nextCutoff = timestamp(cutoffTime, 'scorecard cutoffTime')
  if (nextCutoff <= previousCutoff) throw new TypeError('scorecard cutoffTime must advance')
  const ordered = [...outcomes].sort((left, right) => (
    left.availableAt.localeCompare(right.availableAt) || left.outcomeId.localeCompare(right.outcomeId)
  ))
  if (new Set(ordered.map(outcome => outcome.outcomeId)).size !== ordered.length) {
    throw new TypeError('scorecard update contains duplicate outcome ids')
  }
  for (const outcome of ordered) {
    const verified = createMaturedTacticOutcome(outcome)
    if (verified.outcomeId !== outcome.outcomeId) throw new TypeError(`invalid matured tactic outcome ${outcome.outcomeId}`)
    const availableAt = timestamp(outcome.availableAt, 'outcome availableAt')
    if (availableAt <= previousCutoff || availableAt > nextCutoff) {
      throw new TypeError('scorecard outcome falls outside the newly visible cutoff interval')
    }
  }
  const cells = new Map(previous.cells.map(cell => [cellKey(cell), { ...cell, context: { ...cell.context } }]))
  for (const outcome of ordered) {
    const key = cellKey(outcome)
    cells.set(key, updateCell(cells.get(key), outcome))
  }
  const body: Omit<TacticScorecardRecord, 'scorecardId'> = {
    schemaVersion: TACTIC_SCORECARD_SCHEMA_VERSION,
    previousScorecardId: previous.scorecardId,
    cutoffTime,
    appliedOutcomeIds: ordered.map(outcome => outcome.outcomeId),
    cells: [...cells.values()].sort((left, right) => cellKey(left).localeCompare(cellKey(right))),
  }
  return deepFreeze({ ...body, scorecardId: scorecardIdentity(body) })
}

function metricsFromCells(cells: readonly TacticScorecardCell[]): TacticConditionalMetrics {
  const sampleCount = cells.reduce((sum, cell) => sum + cell.sampleCount, 0)
  const netReturnSum = cells.reduce((sum, cell) => sum + cell.netReturnSum, 0)
  const netReturnSquaredSum = cells.reduce((sum, cell) => sum + cell.netReturnSquaredSum, 0)
  const mean = netReturnSum / sampleCount
  const sampleVariance = sampleCount < 2
    ? 0
    : Math.max(0, (netReturnSquaredSum - netReturnSum ** 2 / sampleCount) / (sampleCount - 1))
  const lowerBound = sampleCount < 2
    ? Math.min(0, mean)
    : mean - Z_95 * Math.sqrt(sampleVariance / sampleCount)
  const positiveCount = cells.reduce((sum, cell) => sum + cell.positiveCount, 0)
  const positiveReturnSum = cells.reduce((sum, cell) => sum + cell.positiveReturnSum, 0)
  const negativeReturnAbsSum = cells.reduce((sum, cell) => sum + cell.negativeReturnAbsSum, 0)
  return deepFreeze({
    sampleCount,
    netExpectancy: rounded(mean),
    expectancyLowerBound: rounded(lowerBound),
    winRate: rounded(positiveCount / sampleCount),
    payoffRatio: negativeReturnAbsSum === 0 ? null : rounded(positiveReturnSum / negativeReturnAbsSum),
    maximumDrawdown: rounded(Math.max(...cells.map(cell => cell.maximumDrawdown))),
    fillRate: rounded(cells.reduce((sum, cell) => sum + cell.fillRateSum, 0) / sampleCount),
    doubledCostExpectancy: rounded(cells.reduce((sum, cell) => sum + cell.doubledCostReturnSum, 0) / sampleCount),
    recentEffectiveness: rounded(cells.reduce((sum, cell) => (
      sum + cell.recentEffectiveness * cell.sampleCount
    ), 0) / sampleCount),
    lastAvailableAt: cells.map(cell => cell.lastAvailableAt).sort().at(-1) as string,
  })
}

/**
 * Derive router-facing metrics from one sufficient-statistics cell.
 * @param cell - One exact tactic-version and context aggregate.
 * @returns Frozen metrics including a conservative 95% expectancy lower bound.
 */
export function tacticConditionalMetrics(cell: TacticScorecardCell): TacticConditionalMetrics {
  return metricsFromCells([cell])
}

function matchingEvidenceCells(
  scorecard: TacticScorecardRecord,
  tacticId: MaturedTacticOutcome['tacticId'],
  tacticVersion: string,
  context: TacticRoutingContext,
  scope: TacticEvidenceScope,
): readonly TacticScorecardCell[] {
  return scorecard.cells.filter((cell) => {
    if (cell.tacticId !== tacticId
      || cell.tacticVersion !== tacticVersion
      || cell.context.marketRegime !== context.marketRegime) return false
    if (scope === 'market_regime') return true
    if (cell.context.emotionCycle !== context.emotionCycle) return false
    return scope === 'regime_emotion' || tacticRoutingContextKey(cell.context) === tacticRoutingContextKey(context)
  })
}

/**
 * Select the narrowest sufficiently populated evidence tier without crossing the current market regime.
 * @param scorecard - Immutable bounded aggregate.
 * @param tacticId - Active tactic identity.
 * @param tacticVersion - Exact catalog version.
 * @param context - Current routing context whose market regime is never relaxed.
 * @param minimumSamples - Matured sample floor used to advance through the evidence ladder.
 * @returns Selected aggregate, or `undefined` when this tactic has no same-regime evidence.
 */
export function selectTacticScorecardEvidence(
  scorecard: TacticScorecardRecord,
  tacticId: MaturedTacticOutcome['tacticId'],
  tacticVersion: string,
  context: TacticRoutingContext,
  minimumSamples: number,
): TacticScorecardEvidence | undefined {
  const scopes: readonly TacticEvidenceScope[] = ['exact_context', 'regime_emotion', 'market_regime']
  const candidates = scopes.map((scope): TacticScorecardEvidence | undefined => {
    const cells = matchingEvidenceCells(scorecard, tacticId, tacticVersion, context, scope)
    return cells.length === 0 ? undefined : {
      scope,
      cellCount: cells.length,
      metrics: metricsFromCells(cells),
    }
  }).filter((evidence): evidence is TacticScorecardEvidence => evidence !== undefined)
  return candidates.find(evidence => evidence.metrics.sampleCount >= minimumSamples) ?? candidates.at(-1)
}

/**
 * Find one exact conditional cell without scanning matured outcomes.
 * @param scorecard - Immutable bounded aggregate.
 * @param tacticId - Active tactic identity.
 * @param tacticVersion - Exact catalog version.
 * @param context - Current exact-match routing context.
 * @returns Matching cell, or `undefined` when no comparable outcome has matured.
 */
export function findTacticScorecardCell(
  scorecard: TacticScorecardRecord,
  tacticId: MaturedTacticOutcome['tacticId'],
  tacticVersion: string,
  context: TacticRoutingContext,
): TacticScorecardCell | undefined {
  const key = `${tacticId}|${tacticVersion}|${tacticRoutingContextKey(context)}`
  return scorecard.cells.find(cell => cellKey(cell) === key)
}
