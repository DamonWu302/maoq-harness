import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { describe, expect, it } from 'vitest'
import {
  evaluateTacticEligibility,
  tacticDefinitions,
} from '../src/index.ts'

function features(overrides: {
  market?: 'risk_on_trend' | 'rotation' | 'high_volatility_divergence' | 'risk_contraction' | 'repair'
  emotion?: 'startup' | 'acceleration' | 'climax' | 'divergence' | 'ebb' | 'repair'
  unavailable?: boolean
} = {}): StrategicFeatureRecord {
  const unavailable = { status: 'unavailable' as const, reasonCodes: ['fixture'], evidenceRefs: [] }
  const market = {
    status: 'ready' as const,
    value: {
      label: overrides.market ?? 'risk_on_trend',
      advanceRatio: 0.65,
      meanIndexChangePct: 0.01,
      limitBalance: 0.5,
      brokenLimitPressure: 0.1,
      lossEffectRate: 0.05,
    },
    evidenceRefs: ['snapshot:a#breadth'],
  }
  const emotion = {
    status: 'ready' as const,
    value: {
      label: overrides.emotion ?? 'startup',
      boardHeight: 3,
      promotionRate: 0.4,
      brokenLimitRate: 0.1,
      lossEffectRate: 0.05,
      advanceRatio: 0.65,
    },
    evidenceRefs: ['snapshot:a#emotion'],
  }
  const sectors = {
    status: 'ready' as const,
    value: [{
      sectorId: 'sw-1',
      name: 'Sector',
      strength: 0.8,
      persistence: 0.7,
      capacity: 0.6,
      catalystSupport: 0,
      internalBreadth: 0.7,
      leaderQuality: 0.8,
      crowding: 0.2,
      resistance: 0.2,
      compositeScore: 0.6,
      evidenceRefs: ['snapshot:a#sector'],
    }],
    evidenceRefs: ['snapshot:a#sector'],
  }
  return {
    schemaVersion: 1,
    engineVersion: 'maoq-strategic-v1',
    inputSnapshotHashes: ['a'],
    currentSnapshotHash: 'a'.repeat(64),
    tradingDate: '2026-09-01',
    cutoffTime: '2026-09-01T19:15:00+08:00',
    evidence: [],
    marketRegime: overrides.unavailable ? unavailable : market,
    emotionCycle: overrides.unavailable ? unavailable : emotion,
    sectorBattlefields: overrides.unavailable ? unavailable : sectors,
    eligibleForInterpretation: !overrides.unavailable,
  }
}

describe('P3 tactic eligibility', () => {
  it('keeps active candidates in research even when their context fits', () => {
    const result = evaluateTacticEligibility(features())
    expect(result.researchCandidateIds).toEqual([
      'regime_signed_breakout_pullback',
      'openable_emotion_leader',
    ])
    expect(result.eligibleTacticIds).toEqual(['defensive_no_trade'])
    expect(result.tactics.find(tactic => tactic.tacticId === 'openable_emotion_leader')?.eligibleSectorIds)
      .toEqual(['sw-1'])
  })

  it('matches industry-relative repair only to repair-like context', () => {
    const result = evaluateTacticEligibility(features({ market: 'repair', emotion: 'repair' }))
    expect(result.researchCandidateIds).toEqual(['industry_relative_exhaustion_repair'])
    expect(result.tactics.find(tactic => tactic.tacticId === 'regime_signed_breakout_pullback')?.status)
      .toBe('ineligible')
  })

  it('fails active tactics closed when strategic facts are unavailable', () => {
    const result = evaluateTacticEligibility(features({ unavailable: true }))
    expect(result.researchCandidateIds).toEqual([])
    expect(result.eligibleTacticIds).toEqual(['defensive_no_trade'])
    expect(result.tactics
      .filter(tactic => tactic.tacticId !== 'defensive_no_trade')
      .every(tactic => tactic.status === 'ineligible'))
      .toBe(true)
  })

  it('publishes immutable host-owned promotion and execution policy', () => {
    const definitions = tacticDefinitions()
    expect(definitions.map(definition => [definition.tacticId, definition.promotionStatus])).toEqual([
      ['regime_signed_breakout_pullback', 'research'],
      ['openable_emotion_leader', 'research'],
      ['industry_relative_exhaustion_repair', 'research'],
      ['defensive_no_trade', 'eligible'],
    ])
    expect(Object.isFrozen(definitions)).toBe(true)
    expect(definitions.find(definition => definition.tacticId === 'openable_emotion_leader')?.executionRequirements)
      .toContain('sealed one-price limit is observation only')
  })
})
