import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, contentHash } from '@deepseek-ai/dsh-market-snapshot'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { MaoqAnalysisMode } from './index.ts'

const HASH_PATTERN = /^[a-f0-9]{64}$/
export const STRATEGIC_DECISION_SCHEMA_VERSION = 1 as const
export const STRATEGIC_WORKFLOW_VERSION = 'maoq-strategic-workflow-v1' as const

/** Exact inputs that make one strategic decision reusable. */
export interface StrategicDecisionInput {
  readonly objective: string
  readonly snapshotHash: string
  readonly historySnapshotHashes: readonly string[]
  readonly decisionTime: string
  readonly maximumAgeHours: number
  readonly specialists: readonly string[]
  readonly analysisMode: MaoqAnalysisMode
  readonly subagentProvider: string
  readonly providerSettingsFingerprint: string
  readonly featureEngineVersion: string
  readonly workflowVersion: typeof STRATEGIC_WORKFLOW_VERSION
}

/** Persisted result returned by the strategic analysis tool. */
export interface StrategicDecisionResult {
  readonly runId: string
  readonly agentsStarted: number
  readonly analysisMode: MaoqAnalysisMode
  readonly status: 'approved' | 'vetoed'
  readonly actionable: boolean
  readonly features: JsonValue
  readonly reports: JsonValue
  readonly interpretation: JsonValue
  readonly risk: JsonValue
  readonly tokenUsage: JsonValue
}

/** One immutable daily strategic decision mirror. */
export interface StrategicDecisionRecord {
  readonly schemaVersion: typeof STRATEGIC_DECISION_SCHEMA_VERSION
  readonly decisionId: string
  readonly createdAt: string
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly input: StrategicDecisionInput
  readonly result: StrategicDecisionResult
}

/** Small historical projection used by list queries. */
export interface StrategicDecisionSummary {
  readonly decisionId: string
  readonly createdAt: string
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly analysisMode: MaoqAnalysisMode
  readonly status: 'approved' | 'vetoed'
  readonly actionable: boolean
  readonly principalContradiction: string
  readonly leastResistanceBattlefield: string
  readonly eligiblePosture: string
  readonly riskVerdict: string
}

export const STRATEGIC_STATE_STALE_REASONS = [
  'maximum_age_exceeded',
  'current_snapshot_unverified',
  'snapshot_changed',
  'feature_engine_changed',
  'workflow_changed',
  'analysis_mode_changed',
  'provider_route_changed',
  'provider_settings_changed',
] as const

/** Machine-readable reasons why a persisted mirror is historical rather than current. */
export type StrategicStateStaleReason = typeof STRATEGIC_STATE_STALE_REASONS[number]

/** Current-use verdict kept outside the immutable historical decision. */
export interface StrategicStateFreshness {
  readonly status: 'fresh' | 'stale'
  readonly currentUseAllowed: boolean
  readonly evaluatedAt: string
  readonly expiresAt: string
  readonly reasons: readonly StrategicStateStaleReason[]
}

/** Runtime facts that can invalidate an otherwise valid persisted mirror. */
export interface StrategicStateFreshnessContext {
  readonly evaluatedAt: string
  readonly currentSnapshotVerified: boolean
  readonly currentSnapshotHash?: string
  readonly featureEngineVersion: string
  readonly workflowVersion: string
  readonly analysisMode: MaoqAnalysisMode
  readonly subagentProvider: string
  readonly providerSettingsFingerprint: string
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EEXIST'
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

function verifyRecord(value: unknown, expectedId: string): StrategicDecisionRecord {
  const record = recordOf(value)
  const input = recordOf(record['input'])
  const result = recordOf(record['result'])
  if (record['schemaVersion'] !== STRATEGIC_DECISION_SCHEMA_VERSION
    || record['decisionId'] !== expectedId
    || typeof record['createdAt'] !== 'string'
    || typeof record['tradingDate'] !== 'string'
    || typeof record['cutoffTime'] !== 'string'
    || typeof input['objective'] !== 'string'
    || typeof input['snapshotHash'] !== 'string'
    || !Array.isArray(input['historySnapshotHashes'])
    || typeof input['decisionTime'] !== 'string'
    || typeof input['maximumAgeHours'] !== 'number'
    || !Array.isArray(input['specialists'])
    || (input['analysisMode'] !== 'quick' && input['analysisMode'] !== 'deep')
    || typeof input['subagentProvider'] !== 'string'
    || typeof input['providerSettingsFingerprint'] !== 'string'
    || typeof input['featureEngineVersion'] !== 'string'
    || input['workflowVersion'] !== STRATEGIC_WORKFLOW_VERSION
    || strategicDecisionId(input as unknown as StrategicDecisionInput) !== expectedId
    || typeof result['runId'] !== 'string'
    || !Number.isSafeInteger(result['agentsStarted'])
    || (result['analysisMode'] !== 'quick' && result['analysisMode'] !== 'deep')
    || (result['status'] !== 'approved' && result['status'] !== 'vetoed')
    || typeof result['actionable'] !== 'boolean') {
    throw new Error(`invalid strategic decision record ${expectedId}`)
  }
  return value as StrategicDecisionRecord
}

/** Derive the immutable identity for an exact strategic request. */
export function strategicDecisionId(input: StrategicDecisionInput): string {
  return contentHash({ schemaVersion: STRATEGIC_DECISION_SCHEMA_VERSION, input })
}

/** Project a full decision mirror into a bounded history row. */
export function summarizeStrategicDecision(record: StrategicDecisionRecord): StrategicDecisionSummary {
  const interpretation = recordOf(record.result.interpretation)
  const risk = recordOf(record.result.risk)
  return {
    decisionId: record.decisionId,
    createdAt: record.createdAt,
    tradingDate: record.tradingDate,
    cutoffTime: record.cutoffTime,
    analysisMode: record.result.analysisMode,
    status: record.result.status,
    actionable: record.result.actionable,
    principalContradiction: stringField(interpretation, 'principalContradiction'),
    leastResistanceBattlefield: stringField(interpretation, 'leastResistanceBattlefield'),
    eligiblePosture: stringField(interpretation, 'eligiblePosture'),
    riskVerdict: stringField(risk, 'verdict'),
  }
}

/** Decide whether an immutable mirror may still inform a current decision. */
export function evaluateStrategicStateFreshness(
  record: StrategicDecisionRecord,
  context: StrategicStateFreshnessContext,
): StrategicStateFreshness {
  const evaluatedAt = Date.parse(context.evaluatedAt)
  const cutoffTime = Date.parse(record.cutoffTime)
  if (!Number.isFinite(evaluatedAt)) throw new TypeError('strategic state evaluation time must be a valid ISO timestamp')
  if (!Number.isFinite(cutoffTime)) throw new Error(`strategic decision ${record.decisionId} has an invalid cutoff time`)
  const expiresAtMs = cutoffTime + record.input.maximumAgeHours * 60 * 60 * 1_000
  const reasons: StrategicStateStaleReason[] = []
  if (evaluatedAt > expiresAtMs) reasons.push('maximum_age_exceeded')
  if (!context.currentSnapshotVerified) reasons.push('current_snapshot_unverified')
  if (context.currentSnapshotHash !== undefined && context.currentSnapshotHash !== record.input.snapshotHash) reasons.push('snapshot_changed')
  if (context.featureEngineVersion !== record.input.featureEngineVersion) reasons.push('feature_engine_changed')
  if (context.workflowVersion !== record.input.workflowVersion) reasons.push('workflow_changed')
  if (context.analysisMode !== record.input.analysisMode) reasons.push('analysis_mode_changed')
  if (context.subagentProvider !== record.input.subagentProvider) reasons.push('provider_route_changed')
  if (context.providerSettingsFingerprint !== record.input.providerSettingsFingerprint) reasons.push('provider_settings_changed')
  return {
    status: reasons.length === 0 ? 'fresh' : 'stale',
    currentUseAllowed: reasons.length === 0,
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    reasons,
  }
}

/** Append-only local store for replayable MAOQ strategic decision mirrors. */
export class StrategicDecisionStore {
  private readonly root: string

  constructor(root: string) {
    if (root.trim().length === 0) throw new TypeError('strategic decision store root must not be empty')
    this.root = resolve(root)
  }

  /** Read one decision by its deterministic identity. */
  async get(decisionId: string): Promise<StrategicDecisionRecord | undefined> {
    if (!HASH_PATTERN.test(decisionId)) throw new TypeError('strategic decision id must be lowercase SHA-256')
    try {
      return verifyRecord(JSON.parse(await readFile(join(this.root, 'records', `${decisionId}.json`), 'utf8')), decisionId)
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  /** Resolve an exact prior request without starting any agents. */
  getByInput(input: StrategicDecisionInput): Promise<StrategicDecisionRecord | undefined> {
    return this.get(strategicDecisionId(input))
  }

  /** Persist the first completed result for an exact request and return the authoritative record. */
  async put(
    input: StrategicDecisionInput,
    result: StrategicDecisionResult,
    tradingDate: string,
    cutoffTime: string,
  ): Promise<StrategicDecisionRecord> {
    const decisionId = strategicDecisionId(input)
    const existing = await this.get(decisionId)
    if (existing !== undefined) return existing
    const record: StrategicDecisionRecord = {
      schemaVersion: STRATEGIC_DECISION_SCHEMA_VERSION,
      decisionId,
      createdAt: new Date().toISOString(),
      tradingDate,
      cutoffTime,
      input,
      result,
    }
    const directory = join(this.root, 'records')
    await mkdir(directory, { recursive: true })
    const path = join(directory, `${decisionId}.json`)
    try {
      await writeFile(path, `${canonicalJson(record)}\n`, { encoding: 'utf8', flag: 'wx' })
      return record
    } catch (error) {
      if (!isExists(error)) throw error
      const concurrent = await this.get(decisionId)
      if (concurrent === undefined) throw error
      return concurrent
    }
  }

  /** List newest decision mirrors first with a caller-owned scan bound. */
  async list(limit: number, maxFiles: number): Promise<readonly StrategicDecisionRecord[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('strategic decision list limit must be a positive integer')
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new TypeError('strategic decision scan bound must be a positive integer')
    let entries: string[]
    try {
      entries = await readdir(join(this.root, 'records'))
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }
    const ids = entries
      .filter(entry => entry.endsWith('.json'))
      .map(entry => entry.slice(0, -'.json'.length))
      .filter(id => HASH_PATTERN.test(id))
    if (ids.length > maxFiles) {
      throw new Error(`strategic decision catalog has ${String(ids.length)} files; scan bound is ${String(maxFiles)}`)
    }
    const records = await Promise.all(ids.map(id => this.get(id)))
    return records
      .filter((record): record is StrategicDecisionRecord => record !== undefined)
      .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate)
        || right.cutoffTime.localeCompare(left.cutoffTime)
        || right.createdAt.localeCompare(left.createdAt)
        || right.decisionId.localeCompare(left.decisionId))
      .slice(0, limit)
  }

  /** Return the newest persisted decision mirror. */
  async latest(maxFiles: number): Promise<StrategicDecisionRecord | undefined> {
    return (await this.list(1, maxFiles))[0]
  }
}
