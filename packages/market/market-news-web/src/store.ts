import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, contentHash, type NewsEvidence } from '@deepseek-ai/dsh-market-snapshot'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'

/** Current persisted web-evidence batch schema. */
export const MARKET_NEWS_BATCH_SCHEMA_VERSION = 1 as const

/** One versioned search question and its deterministic sector mapping policy. */
export interface MarketNewsQuery {
  readonly query: string
  readonly affectedSectors: readonly string[]
  readonly confidence: number
}

/** Inputs for one pre-cutoff acquisition run. */
export interface MarketNewsAcquireInput {
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly queryVersion: string
  readonly queries: readonly MarketNewsQuery[]
  readonly maxResults?: number
}

/** Immutable, content-addressed evidence collected in one acquisition run. */
export interface MarketNewsBatch {
  readonly schemaVersion: typeof MARKET_NEWS_BATCH_SCHEMA_VERSION
  readonly tradingDate: string
  readonly cutoffTime: string
  readonly queryVersion: string
  readonly fetchedAt: string
  readonly evidence: readonly NewsEvidence[]
  readonly contentHash: string
}

/** Rejected or corrupted news evidence. */
export class MarketNewsEvidenceError extends Error {
  /** Stable machine-readable category. */
  readonly code = 'MARKET_NEWS_EVIDENCE_REJECTED' as const

  constructor(message: string) {
    super(`market news evidence rejected: ${message}`)
    this.name = 'MarketNewsEvidenceError'
  }
}

/** Append-only content-addressed storage for frozen web evidence batches. */
export class MarketNewsEvidenceStore {
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  /** Persist a batch once and return the verified immutable value. */
  async put(body: Omit<MarketNewsBatch, 'contentHash'>): Promise<MarketNewsBatch> {
    const batch: MarketNewsBatch = { ...body, contentHash: contentHash(body) }
    await mkdir(this.root, { recursive: true })
    const path = join(this.root, `${batch.contentHash}.json`)
    try {
      await writeFile(path, canonicalJson(batch), { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existing = await this.get(batch.contentHash)
      if (canonicalJson(existing) !== canonicalJson(batch)) {
        throw new MarketNewsEvidenceError(`content address ${batch.contentHash} is already bound to different bytes`)
      }
    }
    return this.get(batch.contentHash)
  }

  /** Read one exact hash and verify that its bytes still match the address. */
  async get(hash: string): Promise<MarketNewsBatch> {
    const parsed = JSON.parse(await readFile(join(this.root, `${hash}.json`), 'utf8')) as MarketNewsBatch
    if (parsed.schemaVersion !== MARKET_NEWS_BATCH_SCHEMA_VERSION) {
      throw new MarketNewsEvidenceError(`unsupported schema version ${String(parsed.schemaVersion)}`)
    }
    const { contentHash: declared, ...body } = parsed
    const actual = contentHash(body)
    if (declared !== hash || actual !== hash) throw new MarketNewsEvidenceError(`content hash mismatch for ${hash}`)
    return deepFreeze(parsed)
  }
}
