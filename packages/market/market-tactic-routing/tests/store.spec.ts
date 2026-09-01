import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  TacticRoutingStore,
} from '../src/index.ts'
import { outcomes } from './fixtures.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

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
})
