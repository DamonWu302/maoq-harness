import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { canonicalJson, marketSnapshotIdentityHash, verifyMarketSnapshot } from './builder.ts'
import type { MarketSnapshot, MarketSnapshotIdentityInput, MarketSnapshotSummary } from './types.ts'

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/

/**
 * Project one validated snapshot into the bounded facts tools may catalog.
 * @param snapshot - Verified immutable market snapshot.
 * @returns Bounded catalog summary without full market rows.
 */
export function summarizeMarketSnapshot(snapshot: MarketSnapshot): MarketSnapshotSummary {
  return {
    tradingDate: snapshot.identity.tradingDate,
    cutoffTime: snapshot.identity.cutoffTime,
    contentHash: snapshot.identity.contentHash,
    stocks: snapshot.stocks.length,
    sectors: snapshot.sectors.length,
    indices: snapshot.breadth.majorIndices.length,
    news: snapshot.news.length,
    warnings: [...snapshot.quality.warnings],
  }
}

/** Immutable identity already points at different market content. */
export class MarketSnapshotConflictError extends Error {
  /** Stable programmatic category for immutable identity or content conflicts. */
  readonly code = 'MARKET_SNAPSHOT_CONFLICT' as const

  constructor(message: string) {
    super(`market snapshot conflict: ${message}`)
    this.name = 'MarketSnapshotConflictError'
  }
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EEXIST'
}

/** Content-addressed, append-only local store for validated snapshots. */
export class MarketSnapshotStore {
  private readonly root: string

  constructor(root: string) {
    if (root.length === 0) throw new TypeError('market snapshot store root must not be empty')
    this.root = resolve(root)
  }

  /**
   * Persist canonical bytes once and bind the immutable identity to their hash.
   * @param snapshot - Already validated snapshot whose identity becomes write-once.
   */
  async put(snapshot: MarketSnapshot): Promise<void> {
    verifyMarketSnapshot(snapshot)
    const bytes = `${canonicalJson(snapshot)}\n`
    const snapshotDir = join(this.root, 'snapshots')
    const identityDir = join(this.root, 'identities')
    await Promise.all([mkdir(snapshotDir, { recursive: true }), mkdir(identityDir, { recursive: true })])
    const snapshotPath = join(snapshotDir, `${snapshot.identity.contentHash}.json`)
    try {
      await writeFile(snapshotPath, bytes, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if (!isExists(error)) throw error
      const existing = await readFile(snapshotPath, 'utf8')
      if (existing !== bytes) throw new MarketSnapshotConflictError(`content address ${snapshot.identity.contentHash} has different bytes`)
    }
    const { contentHash: hash, ...identity } = snapshot.identity
    const referencePath = join(identityDir, `${marketSnapshotIdentityHash(identity)}.ref`)
    try {
      await writeFile(referencePath, `${hash}\n`, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if (!isExists(error)) throw error
      const existing = (await readFile(referencePath, 'utf8')).trim()
      if (existing !== hash) throw new MarketSnapshotConflictError(`identity is already bound to ${existing}, not ${hash}`)
    }
  }

  /**
   * Read and verify one immutable snapshot by its content address.
   * @param hash - Lowercase hexadecimal SHA-256 content address.
   * @returns A deeply frozen snapshot, or `undefined` when the address is absent.
   */
  async getByHash(hash: string): Promise<MarketSnapshot | undefined> {
    if (!CONTENT_HASH_PATTERN.test(hash)) throw new TypeError('market snapshot hash must be lowercase SHA-256')
    let bytes: string
    try {
      bytes = await readFile(join(this.root, 'snapshots', `${hash}.json`), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
      throw error
    }
    const snapshot = JSON.parse(bytes) as MarketSnapshot
    verifyMarketSnapshot(snapshot)
    return deepFreeze(snapshot)
  }

  /**
   * Resolve an exact point-in-time identity without selecting a newer snapshot.
   * @param identity - Complete versioned identity without a content hash.
   * @returns A deeply frozen snapshot, or `undefined` when the identity is absent.
   */
  async getByIdentity(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot | undefined> {
    let hash: string
    try {
      hash = (await readFile(
        join(this.root, 'identities', `${marketSnapshotIdentityHash(identity)}.ref`),
        'utf8',
      )).trim()
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
      throw error
    }
    return this.getByHash(hash)
  }

  /**
   * Verify and summarize every stored snapshot up to a caller-owned scan bound.
   * @param maxFiles - Positive maximum number of content files this scan may open.
   * @returns Newest summaries first, preserving exact cutoff and content hash.
   */
  async listSummaries(maxFiles: number): Promise<readonly MarketSnapshotSummary[]> {
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new TypeError('market snapshot scan bound must be a positive integer')
    let entries: string[]
    try {
      entries = await readdir(join(this.root, 'snapshots'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return []
      throw error
    }
    const hashes = entries
      .filter(entry => entry.endsWith('.json'))
      .map(entry => entry.slice(0, -'.json'.length))
      .filter(hash => CONTENT_HASH_PATTERN.test(hash))
    if (hashes.length > maxFiles) {
      throw new Error(`market snapshot catalog has ${String(hashes.length)} files; scan bound is ${String(maxFiles)}`)
    }
    const snapshots = await Promise.all(hashes.map(hash => this.getByHash(hash)))
    return snapshots
      .filter((snapshot): snapshot is MarketSnapshot => snapshot !== undefined)
      .map(summarizeMarketSnapshot)
      .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate)
        || right.cutoffTime.localeCompare(left.cutoffTime)
        || right.contentHash.localeCompare(left.contentHash))
  }
}
