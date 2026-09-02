import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import type { MarketRegime } from '@deepseek-ai/dsh-market-strategic-state'
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_TACTIC_IDS,
  evaluateTacticEligibility,
  isTacticId,
  TACTIC_IDS,
  tacticDefinitions,
} from '../src/index.ts'

function features(overrides: {
  market?: 'risk_on_trend' | 'rotation' | 'high_volatility_divergence' | 'risk_contraction' | 'repair'
  emotion?: 'startup' | 'acceleration' | 'climax' | 'divergence' | 'ebb' | 'repair'
  unavailable?: boolean
  emptySectors?: boolean
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
    value: overrides.emptySectors ? [] : [{
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
  it('keeps every hard-feasible active candidate in research and tracks preferred-state fit separately', () => {
    const result = evaluateTacticEligibility(features())
    expect(result.researchCandidateIds).toEqual([
      'regime_signed_breakout_pullback',
      'openable_emotion_leader',
      'industry_relative_exhaustion_repair',
      'correlation_cluster_sector_rotation',
      'sector_residual_strength',
      'low_volatility_sector_leader',
    ])
    expect(result.eligibleTacticIds).toEqual(['defensive_no_trade'])
    expect(result.tactics.find(tactic => tactic.tacticId === 'openable_emotion_leader')?.eligibleSectorIds)
      .toEqual(['sw-1'])
    expect(result.tactics.map(tactic => tactic.tacticVersion)).toEqual(tacticDefinitions()
      .map(definition => definition.tacticVersion))
  })

  it('marks industry-relative repair as the preferred-state match in repair-like context', () => {
    const result = evaluateTacticEligibility(features({ market: 'repair', emotion: 'repair' }))
    expect(result.researchCandidateIds).toEqual(ACTIVE_TACTIC_IDS)
    expect(result.tactics.find(tactic => tactic.tacticId === 'industry_relative_exhaustion_repair')?.contextFit)
      .toBe(true)
    expect(result.tactics.find(tactic => tactic.tacticId === 'regime_signed_breakout_pullback')?.status)
      .toBe('research_only')
  })

  it('keeps preferred-state mismatch soft when hard market facts are usable', () => {
    const result = evaluateTacticEligibility(features())
    const repair = result.tactics.find(tactic => tactic.tacticId === 'industry_relative_exhaustion_repair')!
    expect(repair).toMatchObject({
      status: 'research_only',
      contextFit: false,
      eligibleSectorIds: ['sw-1'],
    })
    expect(repair.reasonCodes).toContain('STATE_MISMATCH:market_regime')
    expect(repair.gates.find(gate => gate.gateId === 'market_regime')).toMatchObject({
      kind: 'state_fit',
      passed: false,
    })
    expect(repair.gates.find(gate => gate.gateId === 'positive_sector_battlefield')).toMatchObject({
      kind: 'hard',
      passed: true,
    })
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

  it('fails active tactics closed when no positive sector battlefield exists', () => {
    const result = evaluateTacticEligibility(features({ emptySectors: true }))
    expect(result.researchCandidateIds).toEqual([])
    expect(result.tactics.find(tactic => tactic.tacticId === 'regime_signed_breakout_pullback')?.reasonCodes)
      .toContain('GATE_FAILED:positive_sector_battlefield')
  })

  it('publishes immutable host-owned promotion and execution policy', () => {
    const definitions = tacticDefinitions()
    expect(definitions.map(definition => [definition.tacticId, definition.promotionStatus])).toEqual([
      ['regime_signed_breakout_pullback', 'research'],
      ['openable_emotion_leader', 'research'],
      ['industry_relative_exhaustion_repair', 'research'],
      ['correlation_cluster_sector_rotation', 'research'],
      ['sector_residual_strength', 'research'],
      ['low_volatility_sector_leader', 'research'],
      ['defensive_no_trade', 'eligible'],
    ])
    expect(TACTIC_IDS).toEqual(definitions.map(definition => definition.tacticId))
    expect(ACTIVE_TACTIC_IDS).toEqual(TACTIC_IDS.filter(tacticId => tacticId !== 'defensive_no_trade'))
    expect(isTacticId('sector_residual_strength')).toBe(true)
    expect(isTacticId('invented_tactic')).toBe(false)
    expect(Object.isFrozen(definitions)).toBe(true)
    expect(new Set(definitions.map(definition => definition.tacticVersion)).size).toBe(definitions.length)
    expect(definitions.find(definition => definition.tacticId === 'openable_emotion_leader')?.executionRequirements)
      .toContain('sealed one-price limit is observation only')
  })

  it('covers every market regime with at least one active tactic family', () => {
    const regimes: readonly MarketRegime[] = [
      'risk_on_trend',
      'rotation',
      'high_volatility_divergence',
      'risk_contraction',
      'repair',
    ]
    const active = tacticDefinitions().filter(definition => definition.tacticId !== 'defensive_no_trade')
    for (const regime of regimes) {
      const families = new Set(active
        .filter(definition => definition.eligibleMarketRegimes.includes(regime))
        .map(definition => definition.family))
      expect(families.size, `${regime} has no active tactic family`).toBeGreaterThan(0)
    }
  })
})
