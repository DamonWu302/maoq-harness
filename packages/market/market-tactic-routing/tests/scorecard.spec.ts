import { describe, expect, it } from 'vitest'
import {
  advanceTacticScorecard,
  attributeMaturedTacticOutcome,
  createEmptyTacticScorecard,
  createMaturedTacticOutcome,
  findTacticScorecardCell,
  tacticConditionalMetrics,
} from '../src/index.ts'
import {
  outcomes,
  strategicFeatures,
  tacticVersion,
} from './fixtures.ts'
import { deriveTacticRoutingContext } from '../src/context.ts'

describe('conditional tactic scorecard', () => {
  it('folds only newly matured outcomes into exact versioned context cells', () => {
    const context = deriveTacticRoutingContext(strategicFeatures())
    const initial = createEmptyTacticScorecard('2026-01-01T00:00:00.000Z')
    const input = outcomes('regime_signed_breakout_pullback', 8)
    const scorecard = advanceTacticScorecard(initial, input, '2026-02-01T00:00:00.000Z')
    const cell = findTacticScorecardCell(
      scorecard,
      'regime_signed_breakout_pullback',
      tacticVersion('regime_signed_breakout_pullback'),
      context,
    )
    expect(cell).toMatchObject({ sampleCount: 8, netReturnSum: 0.16, recentEffectiveness: 0.02 })
    expect(tacticConditionalMetrics(cell!)).toEqual({
      sampleCount: 8,
      netExpectancy: 0.02,
      expectancyLowerBound: 0.02,
      winRate: 1,
      payoffRatio: null,
      maximumDrawdown: 0.03,
      fillRate: 0.8,
      doubledCostExpectancy: 0.012,
      recentEffectiveness: 0.02,
      lastAvailableAt: '2026-01-17T20:00:00.000Z',
    })
    expect(scorecard.previousScorecardId).toBe(initial.scorecardId)
    expect(scorecard.appliedOutcomeIds).toHaveLength(8)
    expect(Object.isFrozen(scorecard)).toBe(true)
  })

  it('rejects future, repeated, and pre-maturity evidence', () => {
    const initial = createEmptyTacticScorecard('2026-01-01T00:00:00.000Z')
    const future = outcomes('regime_signed_breakout_pullback', 1, {
      maturityDate: '2026-02-02',
      availableAt: '2026-02-02T20:00:00.000Z',
    })[0]!
    expect(() => advanceTacticScorecard(initial, [future], '2026-02-01T00:00:00.000Z'))
      .toThrow('outside the newly visible cutoff interval')
    const valid = outcomes('regime_signed_breakout_pullback', 1)[0]!
    expect(() => advanceTacticScorecard(initial, [valid, valid], '2026-02-01T00:00:00.000Z'))
      .toThrow('duplicate outcome ids')
    expect(() => createMaturedTacticOutcome({
      ...valid,
      availableAt: '2026-01-01T00:00:00.000Z',
    })).toThrow('availableAt must not precede maturityDate')
  })

  it('rejects a tactic version that is not the current catalog trial', () => {
    const valid = outcomes('regime_signed_breakout_pullback', 1)[0]!
    expect(() => createMaturedTacticOutcome({ ...valid, tacticVersion: 'invented-v2' }))
      .toThrow('version does not match the tactic catalog')
  })

  it('fails closed for malformed matured-outcome boundaries', () => {
    const valid = outcomes('regime_signed_breakout_pullback', 1)[0]!
    const input = { ...valid }
    const invalid = [
      { ...input, decisionDate: '02-01-2026' },
      { ...input, maturityDate: '2026-01-01' },
      { ...input, availableAt: 'not-a-time' },
      { ...input, tacticId: 'defensive_no_trade' },
      { ...input, context: { ...input.context, marketRegime: 'invented' } },
      { ...input, netReturn: Number.NaN },
      { ...input, netReturn: -1 },
      { ...input, doubledCostNetReturn: -1 },
      { ...input, maximumDrawdown: -0.01 },
      { ...input, maximumDrawdown: 1.01 },
      { ...input, fillRate: -0.01 },
      { ...input, fillRate: 1.01 },
      { ...input, sourceHashes: [] },
      { ...input, sourceHashes: ['bad'] },
      { ...input, sourceHashes: [input.sourceHashes[0]!, input.sourceHashes[0]!] },
    ]
    for (const value of invalid) {
      expect(() => createMaturedTacticOutcome(value as never)).toThrow()
    }
    expect(() => attributeMaturedTacticOutcome({
      tacticId: 'invented',
      decisionFeatures: strategicFeatures(),
    } as never)).toThrow(/active catalog tactic/)
  })

  it('rejects invalid scorecard progression and outcome identities', () => {
    expect(() => createEmptyTacticScorecard('invalid')).toThrow(/valid ISO timestamp/)
    const initial = createEmptyTacticScorecard('2026-01-01T00:00:00.000Z')
    expect(() => advanceTacticScorecard(initial, [], initial.cutoffTime)).toThrow(/must advance/)
    const valid = outcomes('regime_signed_breakout_pullback', 1)[0]!
    expect(() => advanceTacticScorecard(
      initial,
      [{ ...valid, outcomeId: 'b'.repeat(64) }],
      '2026-02-01T00:00:00.000Z',
    )).toThrow(/invalid matured tactic outcome/)
  })

  it('preserves prior cells and derives conservative one-sample metrics', () => {
    const initial = createEmptyTacticScorecard('2026-01-01T00:00:00.000Z')
    const first = advanceTacticScorecard(
      initial,
      outcomes('regime_signed_breakout_pullback', 1, { netReturn: 0.02 }),
      '2026-01-20T00:00:00.000Z',
    )
    const second = advanceTacticScorecard(first, [], '2026-02-01T00:00:00.000Z')
    expect(second.cells).toEqual(first.cells)
    expect(tacticConditionalMetrics(second.cells[0]!)).toMatchObject({
      sampleCount: 1,
      expectancyLowerBound: 0,
    })
  })

  it('attributes matured results to original strategic facts and the current catalog version', () => {
    const features = strategicFeatures()
    const result = attributeMaturedTacticOutcome({
      tacticId: 'openable_emotion_leader',
      decisionFeatures: features,
      executionQualityBand: 'strong',
      maturityDate: '2026-02-05',
      availableAt: '2026-02-05T20:00:00.000Z',
      netReturn: 0.03,
      doubledCostNetReturn: 0.02,
      maximumDrawdown: 0.01,
      fillRate: 1,
      sourceHashes: ['f'.repeat(64)],
    })
    expect(result).toMatchObject({
      tacticVersion: tacticVersion('openable_emotion_leader'),
      decisionDate: features.tradingDate,
      context: { marketRegime: 'risk_on_trend', emotionCycle: 'startup', executionQualityBand: 'strong' },
    })
  })
})
