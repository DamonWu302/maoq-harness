import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_CONTEXT_VERSION,
  type CrowdingBand,
  type ExecutionQualityBand,
  type SectorStructureBand,
  type TacticRoutingContext,
  type VolatilityBand,
} from './types.ts'

function sectorStructure(internalBreadth: number, persistence: number, crowding: number): SectorStructureBand {
  if (internalBreadth >= 0.6 && persistence >= 0.5 && crowding < 0.65) return 'broad'
  if (internalBreadth < 0.4 || crowding >= 0.65) return 'narrow'
  return 'balanced'
}

function volatilityBand(
  market: TacticRoutingContext['marketRegime'],
  emotion: TacticRoutingContext['emotionCycle'],
): VolatilityBand {
  if (market === 'high_volatility_divergence' || emotion === 'climax' || emotion === 'divergence') return 'high'
  if (market === 'risk_contraction' && emotion === 'ebb') return 'low'
  return 'normal'
}

function crowdingBand(crowding: number): CrowdingBand {
  if (crowding < 0.35) return 'low'
  if (crowding < 0.65) return 'medium'
  return 'high'
}

/**
 * Derive the versioned routing context from ready strategic facts.
 * @param features - One deterministic strategic-state record.
 * @param executionQualityBand - Recent execution condition from cutoff-correct execution evidence.
 * @returns Frozen context used for both outcome attribution and current routing.
 * @throws When a strategic component or positive top-sector battlefield is unavailable.
 */
export function deriveTacticRoutingContext(
  features: StrategicFeatureRecord,
  executionQualityBand: ExecutionQualityBand = 'unknown',
): TacticRoutingContext {
  if (features.marketRegime.status !== 'ready'
    || features.emotionCycle.status !== 'ready'
    || features.sectorBattlefields.status !== 'ready') {
    throw new Error('tactic routing context requires ready strategic components')
  }
  const top = features.sectorBattlefields.value[0]
  if (top === undefined || top.compositeScore <= 0) {
    throw new Error('tactic routing context requires a positive top-sector battlefield')
  }
  return deepFreeze({
    contextVersion: TACTIC_CONTEXT_VERSION,
    marketRegime: features.marketRegime.value.label,
    emotionCycle: features.emotionCycle.value.label,
    sectorStructure: sectorStructure(top.internalBreadth, top.persistence, top.crowding),
    volatilityBand: volatilityBand(features.marketRegime.value.label, features.emotionCycle.value.label),
    crowdingBand: crowdingBand(top.crowding),
    executionQualityBand,
  })
}

/**
 * Return the stable exact-match key for one versioned routing context.
 * @param context - Validated bounded routing context.
 * @returns Canonical field-order key.
 */
export function tacticRoutingContextKey(context: TacticRoutingContext): string {
  return [
    context.contextVersion,
    context.marketRegime,
    context.emotionCycle,
    context.sectorStructure,
    context.volatilityBand,
    context.crowdingBand,
    context.executionQualityBand,
  ].join('|')
}
