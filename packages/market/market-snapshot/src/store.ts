import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { canonicalJson, marketSnapshotIdentityHash, verifyMarketSnapshot } from './builder.ts'
import type { MarketSnapshot, MarketSnapshotIdentityInput } from './types.ts'

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/

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
}
