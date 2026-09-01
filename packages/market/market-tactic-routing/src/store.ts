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
import {
  TACTIC_SCORECARD_SCHEMA_VERSION,
  type MaturedTacticOutcome,
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
}
