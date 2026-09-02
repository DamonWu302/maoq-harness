import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  canonicalJson,
  contentHash,
} from '@deepseek-ai/dsh-market-snapshot'
import { createMaturedTacticOutcome } from './scorecard.ts'
import { verifyTacticCommanderDecisionRecord } from './commander.ts'
import { verifyTacticRoutingRecord } from './router.ts'
import {
  TACTIC_SCORECARD_SCHEMA_VERSION,
  type MaturedTacticOutcome,
  type TacticCommanderDecisionRecord,
  type TacticRoutingRecord,
  type TacticScorecardRecord,
} from './types.ts'

const HASH_PATTERN = /^[a-f0-9]{64}$/u
const DAY_MS = 24 * 60 * 60 * 1_000

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EEXIST'
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} must be a valid ISO timestamp`)
  return parsed
}

function outcomeDay(availableAt: string): string {
  return new Date(parseTimestamp(availableAt, 'outcome availableAt')).toISOString().slice(0, 10)
}

function verifyOutcome(value: unknown, expectedId: string): MaturedTacticOutcome {
  const record = recordOf(value)
  if (record['outcomeId'] !== expectedId) throw new Error(`invalid matured tactic outcome ${expectedId}`)
  const verified = createMaturedTacticOutcome(value as MaturedTacticOutcome)
  if (verified.outcomeId !== expectedId) throw new Error(`invalid matured tactic outcome ${expectedId}`)
  return value as MaturedTacticOutcome
}

function verifyScorecard(value: unknown, expectedId: string): TacticScorecardRecord {
  const record = recordOf(value)
  const previousScorecardId = record['previousScorecardId']
  if (record['schemaVersion'] !== TACTIC_SCORECARD_SCHEMA_VERSION
    || record['scorecardId'] !== expectedId
    || (previousScorecardId !== null
      && (typeof previousScorecardId !== 'string' || !HASH_PATTERN.test(previousScorecardId)))
    || typeof record['cutoffTime'] !== 'string'
    || !Number.isFinite(Date.parse(record['cutoffTime']))
    || !Array.isArray(record['appliedOutcomeIds'])
    || record['appliedOutcomeIds'].some(id => typeof id !== 'string' || !HASH_PATTERN.test(id))
    || !Array.isArray(record['cells'])) {
    throw new Error(`invalid tactic scorecard ${expectedId}`)
  }
  const { scorecardId: _scorecardId, ...body } = value as TacticScorecardRecord
  if (contentHash(body) !== expectedId) throw new Error(`invalid tactic scorecard ${expectedId}`)
  return value as TacticScorecardRecord
}

async function publishImmutable(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true })
  const bytes = `${canonicalJson(value)}\n`
  try {
    await writeFile(path, bytes, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (!isExists(error)) throw error
    if (await readFile(path, 'utf8') !== bytes) throw new Error(`immutable tactic routing record conflict at ${path}`)
  }
}

/** Append-only local persistence for matured outcomes and immutable scorecard generations. */
export class TacticRoutingStore {
  private readonly root: string

  constructor(root: string) {
    if (root.trim().length === 0) throw new TypeError('tactic routing store root must not be empty')
    this.root = resolve(root)
  }

  /**
   * Publish one content-addressed matured outcome idempotently.
   * @param outcome - Validated outcome produced by `createMaturedTacticOutcome`.
   */
  async publishOutcome(outcome: MaturedTacticOutcome): Promise<void> {
    const verified = verifyOutcome(outcome, outcome.outcomeId)
    await publishImmutable(join(this.root, 'outcomes', outcomeDay(verified.availableAt), `${verified.outcomeId}.json`), verified)
  }

  /**
   * Read one matured outcome by its availability day and content identity.
   * @param availableDay - UTC `YYYY-MM-DD` partition derived from `availableAt`.
   * @param outcomeId - Lowercase SHA-256 outcome identity.
   * @returns Verified outcome, or `undefined` when absent.
   */
  async getOutcome(availableDay: string, outcomeId: string): Promise<MaturedTacticOutcome | undefined> {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(availableDay) || !HASH_PATTERN.test(outcomeId)) {
      throw new TypeError('outcome lookup requires a UTC day and lowercase SHA-256 id')
    }
    try {
      return verifyOutcome(JSON.parse(await readFile(join(this.root, 'outcomes', availableDay, `${outcomeId}.json`), 'utf8')), outcomeId)
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  /**
   * Read only newly visible outcome partitions for an incremental scorecard update.
   * @param afterExclusive - Previous scorecard cutoff.
   * @param atInclusive - New scorecard cutoff.
   * @param maximumCalendarDays - Fail-closed bound on catch-up work.
   * @returns Verified outcomes in deterministic availability and identity order.
   */
  async listOutcomesAvailable(
    afterExclusive: string,
    atInclusive: string,
    maximumCalendarDays: number,
  ): Promise<readonly MaturedTacticOutcome[]> {
    const after = parseTimestamp(afterExclusive, 'afterExclusive')
    const at = parseTimestamp(atInclusive, 'atInclusive')
    if (at <= after) throw new TypeError('outcome range must advance')
    if (!Number.isSafeInteger(maximumCalendarDays) || maximumCalendarDays < 1) {
      throw new TypeError('maximumCalendarDays must be a positive safe integer')
    }
    const startDay = Date.parse(`${new Date(after).toISOString().slice(0, 10)}T00:00:00.000Z`)
    const endDay = Date.parse(`${new Date(at).toISOString().slice(0, 10)}T00:00:00.000Z`)
    const dayCount = Math.floor((endDay - startDay) / DAY_MS) + 1
    if (dayCount > maximumCalendarDays) throw new Error('outcome catch-up range exceeds maximumCalendarDays')
    const outcomes: MaturedTacticOutcome[] = []
    for (let day = startDay; day <= endDay; day += DAY_MS) {
      const partition = new Date(day).toISOString().slice(0, 10)
      let files: string[]
      try {
        files = (await readdir(join(this.root, 'outcomes', partition)))
          .filter(file => /^[a-f0-9]{64}\.json$/u.test(file))
          .sort()
      } catch (error) {
        if (isNotFound(error)) continue
        throw error
      }
      for (const file of files) {
        const outcomeId = file.slice(0, -5)
        const outcome = verifyOutcome(JSON.parse(await readFile(join(this.root, 'outcomes', partition, file), 'utf8')), outcomeId)
        const availableAt = Date.parse(outcome.availableAt)
        if (availableAt > after && availableAt <= at) outcomes.push(outcome)
      }
    }
    return outcomes.sort((left, right) => left.availableAt.localeCompare(right.availableAt)
      || left.outcomeId.localeCompare(right.outcomeId))
  }

  /**
   * Publish one immutable aggregate generation idempotently.
   * @param scorecard - Scorecard produced by `createEmptyTacticScorecard` or `advanceTacticScorecard`.
   */
  async publishScorecard(scorecard: TacticScorecardRecord): Promise<void> {
    const verified = verifyScorecard(scorecard, scorecard.scorecardId)
    await publishImmutable(join(this.root, 'scorecards', `${verified.scorecardId}.json`), verified)
  }

  /**
   * Read one immutable scorecard by exact content identity.
   * @param scorecardId - Lowercase SHA-256 scorecard identity.
   * @returns Verified scorecard, or `undefined` when absent.
   */
  async getScorecard(scorecardId: string): Promise<TacticScorecardRecord | undefined> {
    if (!HASH_PATTERN.test(scorecardId)) throw new TypeError('scorecard id must be lowercase SHA-256')
    try {
      return verifyScorecard(JSON.parse(await readFile(join(this.root, 'scorecards', `${scorecardId}.json`), 'utf8')), scorecardId)
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  /**
   * Return the newest scorecard whose cutoff is visible at a decision cutoff.
   * @param cutoffTime - Inclusive decision evidence boundary.
   * @param maximumFiles - Fail-closed bound on scorecard catalog inspection.
   * @returns Newest verified cutoff-visible scorecard, or `undefined` when none exists.
   */
  async latestScorecardAt(cutoffTime: string, maximumFiles: number): Promise<TacticScorecardRecord | undefined> {
    const cutoff = parseTimestamp(cutoffTime, 'scorecard decision cutoff')
    if (!Number.isSafeInteger(maximumFiles) || maximumFiles < 1) {
      throw new TypeError('maximumFiles must be a positive safe integer')
    }
    let files: string[]
    try {
      files = (await readdir(join(this.root, 'scorecards')))
        .filter(file => /^[a-f0-9]{64}\.json$/u.test(file))
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
    if (files.length > maximumFiles) throw new Error('scorecard catalog exceeds maximumFiles')
    const records = await Promise.all(files.map(async file => this.getScorecard(file.slice(0, -5))))
    return records
      .filter((record): record is TacticScorecardRecord => record !== undefined
        && Date.parse(record.cutoffTime) <= cutoff)
      .sort((left, right) => right.cutoffTime.localeCompare(left.cutoffTime)
        || right.scorecardId.localeCompare(left.scorecardId))[0]
  }

  /**
   * Publish one deterministic route idempotently.
   * @param route - Verified content-addressed route to publish.
   */
  async publishRoute(route: TacticRoutingRecord): Promise<void> {
    const verified = verifyTacticRoutingRecord(route)
    await publishImmutable(join(this.root, 'routes', `${verified.routeId}.json`), verified)
  }

  /**
   * Read one verified deterministic route by exact identity.
   * @param routeId - Lowercase SHA-256 route identity.
   * @returns Verified route, or `undefined` when absent.
   */
  async getRoute(routeId: string): Promise<TacticRoutingRecord | undefined> {
    if (!HASH_PATTERN.test(routeId)) throw new TypeError('route id must be lowercase SHA-256')
    try {
      return verifyTacticRoutingRecord(JSON.parse(await readFile(join(this.root, 'routes', `${routeId}.json`), 'utf8')))
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  /**
   * Publish one host-validated commander decision idempotently.
   * @param decision - Decision whose referenced route already exists.
   */
  async publishDecision(decision: TacticCommanderDecisionRecord): Promise<void> {
    const route = await this.getRoute(decision.routeId)
    if (route === undefined) throw new Error(`commander decision route ${decision.routeId} is not persisted`)
    const verified = verifyTacticCommanderDecisionRecord(decision, route)
    await publishImmutable(join(this.root, 'decisions', `${verified.decisionId}.json`), verified)
  }

  /**
   * Read one commander decision and verify it against its persisted route.
   * @param decisionId - Lowercase SHA-256 decision identity.
   * @returns Verified decision, or `undefined` when absent.
   */
  async getDecision(decisionId: string): Promise<TacticCommanderDecisionRecord | undefined> {
    if (!HASH_PATTERN.test(decisionId)) throw new TypeError('commander decision id must be lowercase SHA-256')
    try {
      const value = JSON.parse(await readFile(join(this.root, 'decisions', `${decisionId}.json`), 'utf8')) as unknown
      const routeId = recordOf(value)['routeId']
      if (typeof routeId !== 'string') throw new Error(`invalid tactic commander decision ${decisionId}`)
      const route = await this.getRoute(routeId)
      if (route === undefined) throw new Error(`missing tactic route ${routeId}`)
      return verifyTacticCommanderDecisionRecord(value, route)
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }
}
