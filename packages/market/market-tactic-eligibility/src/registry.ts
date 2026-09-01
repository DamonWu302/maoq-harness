import type { StrategicComponent, StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_ELIGIBILITY_ENGINE_VERSION,
  TACTIC_ELIGIBILITY_SCHEMA_VERSION,
  type TacticDefinition,
  type TacticEligibilityRecord,
  type TacticEligibilityResult,
  type TacticGateResult,
  type TacticId,
} from './types.ts'

const DEFINITIONS: readonly TacticDefinition[] = deepFreeze([
  {
    tacticId: 'regime_signed_breakout_pullback',
    family: 'trend',
    promotionStatus: 'research',
    evidenceGrade: 'A',
    requiredHistorySessions: 252,
    maximumHoldingSessions: 20,
    maximumPaperPositionPct: 10,
    entryPolicy: ['sector-confirmed first breakout or controlled pullback', 'protection distance and liquidity must pass P4'],
    exitPolicy: ['exit on failed breakout or platform loss', 'reduce when sector breadth or market regime deteriorates'],
    invalidationPolicy: ['market-state transition', 'sector breadth collapse', 'breakout failure'],
    executionRequirements: ['T+1', 'board-specific price limit', 'no fill at an untradeable limit', 'cost and capacity model'],
  },
  {
    tacticId: 'openable_emotion_leader',
    family: 'emotion',
    promotionStatus: 'research',
    evidenceGrade: 'B',
    requiredHistorySessions: 20,
    maximumHoldingSessions: 5,
    maximumPaperPositionPct: 6,
    entryPolicy: ['startup or acceleration only', 'core status and a next-session executable price are mandatory'],
    exitPolicy: ['exit on leader break or promotion collapse', 'no averaging after a failed board'],
    invalidationPolicy: ['loss-effect expansion', 'promotion-rate collapse', 'no executable fill'],
    executionRequirements: ['T+1', 'sealed one-price limit is observation only', 'queue and slippage model', 'capacity ceiling'],
  },
  {
    tacticId: 'industry_relative_exhaustion_repair',
    family: 'reversal',
    promotionStatus: 'research',
    evidenceGrade: 'A',
    requiredHistorySessions: 60,
    maximumHoldingSessions: 10,
    maximumPaperPositionPct: 8,
    entryPolicy: ['negative stock residual versus sector peers', 'exhaustion plus stabilization or reclaim'],
    exitPolicy: ['exit on renewed-volume low or failed reclaim', 'time exit when repair does not propagate'],
    invalidationPolicy: ['sector repair failure', 'renewed-volume new low', 'trading-status deterioration'],
    executionRequirements: ['T+1', 'long-only validation', 'point-in-time sector peers', 'cost and liquidity stress'],
  },
  {
    tacticId: 'defensive_no_trade',
    family: 'defense',
    promotionStatus: 'eligible',
    evidenceGrade: 'control',
    requiredHistorySessions: 0,
    maximumHoldingSessions: 0,
    maximumPaperPositionPct: 0,
    entryPolicy: ['hold cash or retain no new paper position'],
    exitPolicy: ['leave defense only after another promoted tactic passes every deterministic gate'],
    invalidationPolicy: ['none; defense remains an available fallback'],
    executionRequirements: ['no order', 'no model override'],
  },
])

/**
 * Return the immutable, host-owned P3 tactic catalog.
 * @returns Stable source-controlled tactic definitions.
 */
export function tacticDefinitions(): readonly TacticDefinition[] {
  return DEFINITIONS
}

function labelOf<T extends { readonly label: string }>(component: StrategicComponent<T>): string {
  return component.status === 'ready' ? component.value.label : 'unavailable'
}

function refsOf<T>(component: StrategicComponent<T>): readonly string[] {
  return component.evidenceRefs
}

function labelGate(
  gateId: string,
  actual: string,
  allowed: readonly string[],
  evidenceRefs: readonly string[],
): TacticGateResult {
  return {
    gateId,
    passed: allowed.includes(actual),
    actual,
    expected: allowed.join('|'),
    evidenceRefs,
  }
}

function availabilityGate(features: StrategicFeatureRecord): TacticGateResult {
  const ready = features.marketRegime.status === 'ready'
    && features.emotionCycle.status === 'ready'
    && features.sectorBattlefields.status === 'ready'
  return {
    gateId: 'strategic_components_ready',
    passed: ready,
    actual: ready ? 'ready' : 'unavailable',
    expected: 'ready',
    evidenceRefs: [
      ...features.marketRegime.evidenceRefs,
      ...features.emotionCycle.evidenceRefs,
      ...features.sectorBattlefields.evidenceRefs,
    ],
  }
}

function sectorGate(features: StrategicFeatureRecord): TacticGateResult {
  if (features.sectorBattlefields.status === 'unavailable') {
    return {
      gateId: 'positive_sector_battlefield',
      passed: false,
      actual: 'unavailable',
      expected: 'top-sector-composite-score>0',
      evidenceRefs: features.sectorBattlefields.evidenceRefs,
    }
  }
  const top = features.sectorBattlefields.value[0]
  return {
    gateId: 'positive_sector_battlefield',
    passed: top !== undefined && top.compositeScore > 0,
    actual: top === undefined ? 'none' : `${top.sectorId}:${top.compositeScore}`,
    expected: 'top-sector-composite-score>0',
    evidenceRefs: top?.evidenceRefs ?? features.sectorBattlefields.evidenceRefs,
  }
}

function activeGates(tacticId: Exclude<TacticId, 'defensive_no_trade'>, features: StrategicFeatureRecord): readonly TacticGateResult[] {
  const common = availabilityGate(features)
  const market = labelOf(features.marketRegime)
  const emotion = labelOf(features.emotionCycle)
  const marketRefs = refsOf(features.marketRegime)
  const emotionRefs = refsOf(features.emotionCycle)
  const sector = sectorGate(features)
  if (tacticId === 'regime_signed_breakout_pullback') {
    return [
      common,
      labelGate('market_regime', market, ['risk_on_trend', 'rotation'], marketRefs),
      labelGate('emotion_cycle', emotion, ['startup', 'acceleration', 'repair'], emotionRefs),
      sector,
    ]
  }
  if (tacticId === 'openable_emotion_leader') {
    return [
      common,
      labelGate('market_regime', market, ['risk_on_trend', 'rotation'], marketRefs),
      labelGate('emotion_cycle', emotion, ['startup', 'acceleration'], emotionRefs),
      sector,
    ]
  }
  return [
    common,
    labelGate('market_regime', market, ['repair', 'rotation', 'high_volatility_divergence'], marketRefs),
    labelGate('emotion_cycle', emotion, ['repair', 'ebb', 'divergence'], emotionRefs),
    sector,
  ]
}

function topSectorIds(features: StrategicFeatureRecord): readonly string[] {
  if (features.sectorBattlefields.status === 'unavailable') return []
  return features.sectorBattlefields.value
    .filter(sector => sector.compositeScore > 0)
    .slice(0, 3)
    .map(sector => sector.sectorId)
}

function evaluateDefinition(definition: TacticDefinition, features: StrategicFeatureRecord): TacticEligibilityResult {
  if (definition.tacticId === 'defensive_no_trade') {
    return {
      tacticId: definition.tacticId,
      promotionStatus: definition.promotionStatus,
      status: 'eligible',
      contextFit: true,
      eligibleSectorIds: [],
      reasonCodes: ['SAFE_DEFAULT'],
      gates: [],
      evidenceRefs: [],
    }
  }
  const gates = activeGates(definition.tacticId, features)
  const contextFit = gates.every(gate => gate.passed)
  const status = !contextFit
    ? 'ineligible'
    : definition.promotionStatus === 'research'
      ? 'research_only'
      : definition.promotionStatus === 'paper'
        ? 'watch_only'
        : 'eligible'
  const reasonCodes = [
    ...gates.filter(gate => !gate.passed).map(gate => `GATE_FAILED:${gate.gateId}`),
    ...definition.promotionStatus === 'research' && contextFit ? ['RESEARCH_NOT_PROMOTED'] : [],
    ...definition.promotionStatus === 'paper' && contextFit ? ['PAPER_ONLY'] : [],
  ]
  return {
    tacticId: definition.tacticId,
    promotionStatus: definition.promotionStatus,
    status,
    contextFit,
    eligibleSectorIds: contextFit ? topSectorIds(features) : [],
    reasonCodes,
    gates,
    evidenceRefs: [...new Set(gates.flatMap(gate => gate.evidenceRefs))].sort(),
  }
}

/**
 * Evaluate every registered tactic before any stock ranking or model selection.
 * Research and paper tactics cannot appear in `eligibleTacticIds` even when their market context fits.
 * @param features - Replay-stable P2 strategic facts for one immutable current snapshot.
 * @returns Frozen P3 gate results with promotion and context fit kept separate.
 */
export function evaluateTacticEligibility(features: StrategicFeatureRecord): TacticEligibilityRecord {
  const tactics = DEFINITIONS.map(definition => evaluateDefinition(definition, features))
  return deepFreeze({
    schemaVersion: TACTIC_ELIGIBILITY_SCHEMA_VERSION,
    engineVersion: TACTIC_ELIGIBILITY_ENGINE_VERSION,
    strategicEngineVersion: features.engineVersion,
    currentSnapshotHash: features.currentSnapshotHash,
    tradingDate: features.tradingDate,
    tactics,
    eligibleTacticIds: tactics.filter(tactic => tactic.status === 'eligible').map(tactic => tactic.tacticId),
    researchCandidateIds: tactics.filter(tactic => tactic.status === 'research_only').map(tactic => tactic.tacticId),
  })
}
