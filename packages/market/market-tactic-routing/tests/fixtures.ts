import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { tacticDefinitions } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  createMaturedTacticOutcome,
  deriveTacticRoutingContext,
  type MaturedTacticOutcome,
  type MaturedTacticOutcomeInput,
} from '../src/index.ts'

export const HASH = 'a'.repeat(64)

export function strategicFeatures(overrides: {
  market?: 'risk_on_trend' | 'rotation' | 'high_volatility_divergence' | 'risk_contraction' | 'repair'
  emotion?: 'startup' | 'acceleration' | 'climax' | 'divergence' | 'ebb' | 'repair'
  crowding?: number
  internalBreadth?: number
  persistence?: number
} = {}): StrategicFeatureRecord {
  return {
    schemaVersion: 1,
    engineVersion: 'maoq-strategic-v1',
    inputSnapshotHashes: [HASH],
    currentSnapshotHash: HASH,
    tradingDate: '2026-02-02',
    cutoffTime: '2026-02-02T19:15:00+08:00',
    evidence: [],
    marketRegime: {
      status: 'ready',
      value: {
        label: overrides.market ?? 'risk_on_trend',
        advanceRatio: 0.65,
        meanIndexChangePct: 0.01,
        limitBalance: 0.5,
        brokenLimitPressure: 0.1,
        lossEffectRate: 0.05,
      },
      evidenceRefs: ['snapshot:a#market'],
    },
    emotionCycle: {
      status: 'ready',
      value: {
        label: overrides.emotion ?? 'startup',
        boardHeight: 3,
        promotionRate: 0.4,
        brokenLimitRate: 0.1,
        lossEffectRate: 0.05,
        advanceRatio: 0.65,
      },
      evidenceRefs: ['snapshot:a#emotion'],
    },
    sectorBattlefields: {
      status: 'ready',
      value: [{
        sectorId: 'sector-a',
        name: 'Sector A',
        strength: 0.8,
        persistence: overrides.persistence ?? 0.7,
        capacity: 0.8,
        catalystSupport: 0,
        internalBreadth: overrides.internalBreadth ?? 0.7,
        leaderQuality: 0.8,
        crowding: overrides.crowding ?? 0.2,
        resistance: 0.2,
        compositeScore: 0.6,
        evidenceRefs: ['snapshot:a#sector'],
      }],
      evidenceRefs: ['snapshot:a#sector'],
    },
    eligibleForInterpretation: true,
  }
}

export function tacticVersion(tacticId: MaturedTacticOutcome['tacticId']): string {
  return tacticDefinitions().find(definition => definition.tacticId === tacticId)!.tacticVersion
}

export function outcomes(
  tacticId: MaturedTacticOutcome['tacticId'],
  count: number,
  overrides: Partial<MaturedTacticOutcomeInput> = {},
): MaturedTacticOutcome[] {
  const context = deriveTacticRoutingContext(strategicFeatures())
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 2).padStart(2, '0')
    const maturityDay = String(index + 10).padStart(2, '0')
    return createMaturedTacticOutcome({
      tacticId,
      tacticVersion: tacticVersion(tacticId),
      decisionDate: `2026-01-${day}`,
      maturityDate: `2026-01-${maturityDay}`,
      availableAt: `2026-01-${maturityDay}T20:00:00.000Z`,
      context,
      netReturn: 0.02,
      doubledCostNetReturn: 0.012,
      maximumDrawdown: 0.03,
      fillRate: 0.8,
      sourceHashes: [index.toString(16).padStart(64, '0')],
      ...overrides,
    })
  })
}
