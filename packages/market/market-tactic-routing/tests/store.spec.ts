import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { evaluateTacticEligibility } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  createTacticCommanderDecision,
  routeEligibleTactics,
  TacticRoutingStore,
  type TacticRoutingRecord,
} from '../src/index.ts'
import { outcomes, strategicFeatures } from './fixtures.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function qualifiedRoute(): TacticRoutingRecord {
  const features = strategicFeatures()
  const scorecard = advanceTacticScorecard(createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'), [
    ...outcomes('regime_signed_breakout_pullback', 8, { netReturn: 0.04, doubledCostNetReturn: 0.03 }),
    ...outcomes('openable_emotion_leader', 8, { netReturn: 0.03, doubledCostNetReturn: 0.02 }),
  ], '2026-02-01T00:00:00.000Z')
  return routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
}

function commanderDecision(route: TacticRoutingRecord) {
  return createTacticCommanderDecision(route, {
    routeId: route.routeId,
    selectedSpecialists: ['big_bull_trend', 'short_sentiment'],
    specialistReports: ['big_bull_trend', 'short_sentiment'].map(role => ({
      role: role as 'big_bull_trend' | 'short_sentiment',
      verdict: 'oppose' as const,
      preferredTacticIds: ['defensive_no_trade' as const],
      analysis: 'Current resistance favors preserving optionality.',
      supportingEvidenceRefs: route.defensiveFallback.evidenceRefs,
      counterEvidenceRefs: route.slate.flatMap(item => item.evidenceRefs),
      confidence: 0.7,
      invalidationConditions: ['A routed tactic gains a stronger evidence margin.'],
    })),
    marketPhase: 'Qualified but high-resistance attack state',
    principalContradiction: 'Nominal qualification versus weak payoff asymmetry.',
    rewardedStyle: 'Cash and optionality',
    posture: 'no_trade',
    quantRouteDisposition: route.slate.some(item => item.tacticId === 'defensive_no_trade') ? 'follow' : 'override',
    quantRouteAssessment: 'The routed evidence is qualified but insufficiently asymmetric.',
    primaryTacticId: 'defensive_no_trade',
    secondaryTacticId: null,
    stockMissions: ['Wait for stronger evidence.'],
    thesis: 'Preserve capital while the routed attack evidence remains insufficient.',
    evidenceRefs: route.defensiveFallback.evidenceRefs,
    counterEvidenceRefs: route.slate.some(item => item.tacticId === 'defensive_no_trade')
      ? []
      : route.slate.flatMap(item => item.evidenceRefs),
    confidence: 0.8,
    invalidationConditions: ['A routed tactic gains a stronger evidence margin.'],
  }, {
    routeId: route.routeId,
    approved: true,
    verdict: 'approve',
    reasons: ['Defense is always within the deterministic route.'],
    hardLimits: ['No order may be created.'],
    invalidationConditions: ['A new route requires a new review.'],
  })
}

describe('tactic routing persistence', () => {
  it('publishes outcomes by availability partition and reads only a bounded cutoff interval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-routing-'))
    roots.push(root)
    const store = new TacticRoutingStore(root)
    const input = outcomes('regime_signed_breakout_pullback', 2)
    await Promise.all(input.map(outcome => store.publishOutcome(outcome)))
    await store.publishOutcome(input[0]!)
    expect(await store.getOutcome('2026-01-10', input[0]!.outcomeId)).toEqual(input[0])
    const visible = await store.listOutcomesAvailable(
      '2026-01-10T20:00:00.000Z',
      '2026-01-11T20:00:00.000Z',
      2,
    )
    expect(visible.map(item => item.outcomeId)).toEqual([input[1]!.outcomeId])
    await expect(store.listOutcomesAvailable(
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      2,
    )).rejects.toThrow('exceeds maximumCalendarDays')
  })

  it('round-trips immutable scorecards and rejects corrupted content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-routing-'))
    roots.push(root)
    const store = new TacticRoutingStore(root)
    const scorecard = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('regime_signed_breakout_pullback', 1),
      '2026-02-01T00:00:00.000Z',
    )
    await store.publishScorecard(scorecard)
    expect(await store.getScorecard(scorecard.scorecardId)).toEqual(scorecard)
    const path = join(root, 'scorecards', `${scorecard.scorecardId}.json`)
    const corrupted = (await readFile(path, 'utf8')).replace('"sampleCount":1', '"sampleCount":2')
    await writeFile(path, corrupted, 'utf8')
    await expect(store.getScorecard(scorecard.scorecardId)).rejects.toThrow('invalid tactic scorecard')
  })

  it('selects the newest cutoff-visible scorecard under a bounded catalog scan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-routing-'))
    roots.push(root)
    const store = new TacticRoutingStore(root)
    expect(await store.latestScorecardAt('2026-02-01T00:00:00.000Z', 10)).toBeUndefined()
    await expect(store.latestScorecardAt('invalid', 10)).rejects.toThrow(/valid ISO/)
    for (const maximumFiles of [0, 1.5]) {
      await expect(store.latestScorecardAt('2026-02-01T00:00:00.000Z', maximumFiles)).rejects.toThrow(/positive safe integer/)
    }

    const first = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('regime_signed_breakout_pullback', 1),
      '2026-02-01T00:00:00.000Z',
    )
    const tied = advanceTacticScorecard(
      createEmptyTacticScorecard('2026-01-01T00:00:00.000Z'),
      outcomes('openable_emotion_leader', 1),
      '2026-02-01T00:00:00.000Z',
    )
    const future = createEmptyTacticScorecard('2026-03-01T00:00:00.000Z')
    await Promise.all([first, tied, future].map(item => store.publishScorecard(item)))
    const selected = await store.latestScorecardAt('2026-02-15T00:00:00.000Z', 3)
    expect(selected?.cutoffTime).toBe('2026-02-01T00:00:00.000Z')
    expect(selected?.scorecardId).toBe([first.scorecardId, tied.scorecardId].sort().reverse()[0])
    await expect(store.latestScorecardAt('2026-04-01T00:00:00.000Z', 2)).rejects.toThrow(/maximumFiles/)

    const original = store.getScorecard.bind(store)
    let firstRead = true
    store.getScorecard = async (id) => {
      if (firstRead) {
        firstRead = false
        return undefined
      }
      return original(id)
    }
    await expect(store.latestScorecardAt('2026-04-01T00:00:00.000Z', 3)).resolves.toBeDefined()
  })

  it('surfaces non-missing scorecard catalog filesystem failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-routing-'))
    roots.push(root)
    await writeFile(join(root, 'scorecards'), 'not-a-directory')
    await expect(new TacticRoutingStore(root).latestScorecardAt('2026-02-01T00:00:00.000Z', 1)).rejects.toThrow()
  })

  it('round-trips routes and commander decisions and rejects every missing or corrupt dependency', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maoq-routing-'))
    roots.push(root)
    const store = new TacticRoutingStore(root)
    const route = qualifiedRoute()
    const decision = commanderDecision(route)
    await expect(store.publishDecision(decision)).rejects.toThrow(/is not persisted/)
    await store.publishRoute(route)
    await store.publishRoute(route)
    expect(await store.getRoute(route.routeId)).toEqual(route)
    expect(await store.getRoute('0'.repeat(64))).toBeUndefined()
    await expect(store.getRoute('bad')).rejects.toThrow(/lowercase SHA-256/)

    await store.publishDecision(decision)
    await store.publishDecision(decision)
    expect(await store.getDecision(decision.decisionId)).toEqual(decision)
    expect(await store.getDecision('0'.repeat(64))).toBeUndefined()
    await expect(store.getDecision('bad')).rejects.toThrow(/lowercase SHA-256/)

    const malformedId = 'c'.repeat(64)
    await writeFile(join(root, 'decisions', `${malformedId}.json`), '{}')
    await expect(store.getDecision(malformedId)).rejects.toThrow(/invalid tactic commander/)
    const missingRouteId = 'd'.repeat(64)
    await writeFile(join(root, 'decisions', `${missingRouteId}.json`), JSON.stringify({ routeId: 'e'.repeat(64) }))
    await expect(store.getDecision(missingRouteId)).rejects.toThrow(/missing tactic route/)

    await writeFile(join(root, 'routes', `${route.routeId}.json`), '{}')
    await expect(store.getRoute(route.routeId)).rejects.toThrow(/invalid deterministic tactic routing/)
  })
})
