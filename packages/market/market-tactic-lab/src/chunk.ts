import { canonicalJson, contentHash } from '@deepseek-ai/dsh-market-snapshot'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_LAB_HISTORY_CHUNK_SCHEMA_VERSION,
  type TacticLabHistoryChunk,
  type TacticLabHistoryChunkDraft,
} from './types.ts'

/** Rejected history chunk. */
export class TacticLabHistoryChunkError extends Error {
  /** Stable machine-readable category. */
  readonly code = 'MAOQ_TACTIC_HISTORY_CHUNK_REJECTED' as const

  constructor(message: string) {
    super(`MAOQ tactic history chunk rejected: ${message}`)
    this.name = 'TacticLabHistoryChunkError'
  }
}

function validateDraft(draft: TacticLabHistoryChunkDraft): readonly string[] {
  if (draft.adapterVersion.length === 0) throw new TacticLabHistoryChunkError('adapterVersion must not be empty')
  if (draft.featureSessions.length === 0) throw new TacticLabHistoryChunkError('featureSessions must not be empty')
  if (draft.featureSessions.length !== draft.executionSessions.length) {
    throw new TacticLabHistoryChunkError('feature and execution session counts differ')
  }
  const dates: string[] = []
  for (let index = 0; index < draft.featureSessions.length; index += 1) {
    const feature = draft.featureSessions[index]
    const execution = draft.executionSessions[index]
    if (feature === undefined || execution === undefined) throw new TacticLabHistoryChunkError('session pairing is incomplete')
    const date = feature.identity.tradingDate
    if (date !== execution.tradingDate) throw new TacticLabHistoryChunkError(`feature and execution dates differ at index ${String(index)}`)
    const previousDate = dates.at(-1)
    if (previousDate !== undefined && previousDate >= date) {
      throw new TacticLabHistoryChunkError('session dates are not strictly ascending')
    }
    if (!/^[a-f0-9]{64}$/u.test(feature.identity.contentHash) || !/^[a-f0-9]{64}$/u.test(execution.contentHash)) {
      throw new TacticLabHistoryChunkError(`${date} contains an invalid session hash`)
    }
    dates.push(date)
  }
  return dates
}

/**
 * Validate, canonicalize, hash, and freeze one bounded history chunk.
 * @param draft - Complete paired adjusted-feature and raw-execution sessions.
 * @returns Immutable content-addressed chunk with sorted source versions.
 */
export function buildTacticLabHistoryChunk(draft: TacticLabHistoryChunkDraft): TacticLabHistoryChunk {
  const dates = validateDraft(draft)
  const body = {
    schemaVersion: TACTIC_LAB_HISTORY_CHUNK_SCHEMA_VERSION,
    adapterVersion: draft.adapterVersion,
    sourceVersions: [...draft.sourceVersions].sort(),
    startDate: dates[0] as string,
    endDate: dates.at(-1) as string,
    featureSessions: [...draft.featureSessions],
    executionSessions: [...draft.executionSessions],
  }
  return deepFreeze({ ...body, contentHash: contentHash(body) })
}

/**
 * Verify that a persisted history chunk still matches its canonical content address.
 * @param chunk - Candidate chunk read from storage or supplied by an adapter.
 */
export function verifyTacticLabHistoryChunk(chunk: TacticLabHistoryChunk): void {
  const { contentHash: claimed, ...draft } = chunk
  const rebuilt = buildTacticLabHistoryChunk(draft)
  if (claimed !== rebuilt.contentHash || canonicalJson(chunk) !== canonicalJson({ ...rebuilt, contentHash: claimed })) {
    throw new TacticLabHistoryChunkError(`content hash mismatch: expected ${rebuilt.contentHash}, received ${claimed}`)
  }
}
