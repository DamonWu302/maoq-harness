/** Deterministic point-in-time market snapshot service for MAOQ. @module @deepseek-ai/dsh-market-snapshot */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { buildMarketSnapshot, marketSnapshotIdentityHash } from './builder.ts'
import { MarketSnapshotStore } from './store.ts'
import type {
  MarketSnapshot,
  MarketSnapshotAdapter,
  MarketSnapshotDiscoveryRequest,
  MarketSnapshotIdentityInput,
  MarketSnapshotSummary,
} from './types.ts'

export * from './builder.ts'
export * from './store.ts'
export * from './types.ts'

/** Filesystem location for immutable snapshot artifacts. */
export interface Config {
  /** Directory containing content-addressed snapshots and immutable identity references. */
  readonly root: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    marketSnapshots: MarketSnapshotService
  }
}

/** Builds, persists and queries one authoritative set of daily market facts. */
export class MarketSnapshotService extends Service {
  static Config: z<Config> = z.object({ root: z.string().required() })

  private readonly store: MarketSnapshotStore
  private readonly adapters = new Map<string, MarketSnapshotAdapter>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'marketSnapshots')
    this.store = new MarketSnapshotStore(config.root)
  }

  /**
   * Register one provider-neutral adapter until its contributor disposes the returned effect.
   * @param adapter - Adapter with a unique lowercase-hyphenated registry name.
   * @returns A disposer that removes this exact adapter registration.
   */
  register(adapter: MarketSnapshotAdapter): () => void {
    if (!/^[a-z][a-z0-9-]*$/.test(adapter.name)) {
      throw new TypeError(`market snapshot adapter name ${JSON.stringify(adapter.name)} must be lowercase hyphenated`)
    }
    if (this.adapters.has(adapter.name)) throw new Error(`market snapshot adapter "${adapter.name}" is already registered`)
    this.adapters.set(adapter.name, adapter)
    return () => {
      if (this.adapters.get(adapter.name) === adapter) this.adapters.delete(adapter.name)
    }
  }

  /**
   * Return registered adapter names in deterministic order.
   * @returns A sorted snapshot of the current registry names.
   */
  listAdapters(): readonly string[] {
    return [...this.adapters.keys()].sort()
  }

  /**
   * Return registered sources and whether each can discover recent audited sessions.
   * @returns Deterministically sorted source capabilities.
   */
  describeAdapters(): readonly { readonly name: string; readonly supportsRecentDiscovery: boolean }[] {
    return [...this.adapters.values()]
      .map(adapter => ({ name: adapter.name, supportsRecentDiscovery: adapter.discoverRecent !== undefined }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  /**
   * Ask one named source for exact recent identities without loading market rows.
   * @param adapterName - Registered source name.
   * @param request - Explicit date ceiling, evidence cutoff, and bounded count.
   * @returns Exact identities in ascending trading-date order.
   */
  async discoverRecent(
    adapterName: string,
    request: MarketSnapshotDiscoveryRequest,
  ): Promise<readonly MarketSnapshotIdentityInput[]> {
    const adapter = this.adapters.get(adapterName)
    if (adapter === undefined) throw new Error(`market snapshot adapter "${adapterName}" is not registered`)
    if (adapter.discoverRecent === undefined) throw new Error(`market snapshot adapter "${adapterName}" does not support recent discovery`)
    if (!Number.isInteger(request.limit) || request.limit < 1) throw new TypeError('market snapshot discovery limit must be a positive integer')
    const identities = await adapter.discoverRecent(request)
    if (identities.length !== request.limit) {
      throw new Error(`market snapshot adapter "${adapterName}" returned ${String(identities.length)} identities, expected ${String(request.limit)}`)
    }
    for (const [index, identity] of identities.entries()) {
      if (identity.tradingDate > request.beforeOrOn) throw new Error(`market snapshot adapter "${adapterName}" returned a date after the requested ceiling`)
      if (identity.cutoffTime !== request.cutoffTime) throw new Error(`market snapshot adapter "${adapterName}" changed the requested cutoff`)
      const previous = identities[index - 1]
      if (previous !== undefined && previous.tradingDate >= identity.tradingDate) {
        throw new Error(`market snapshot adapter "${adapterName}" did not return strictly ascending trading dates`)
      }
    }
    return identities
  }

  /**
   * Load normalized facts from a named adapter, validate them, and persist canonical bytes.
   * @param adapterName - Exact registered adapter name.
   * @param identity - Complete requested identity that the adapter must preserve.
   * @returns The validated immutable snapshot written to the content-addressed store.
   */
  async build(adapterName: string, identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot> {
    const adapter = this.adapters.get(adapterName)
    if (adapter === undefined) throw new Error(`market snapshot adapter "${adapterName}" is not registered`)
    const draft = await adapter.load(identity)
    if (marketSnapshotIdentityHash(draft.identity) !== marketSnapshotIdentityHash(identity)) {
      throw new Error(`market snapshot adapter "${adapterName}" returned a different identity`)
    }
    const snapshot = buildMarketSnapshot(draft)
    await this.store.put(snapshot)
    return snapshot
  }

  /**
   * Read one immutable snapshot by content hash.
   * @param hash - Lowercase hexadecimal SHA-256 content address.
   * @returns A deeply frozen snapshot, or `undefined` when the address is absent.
   */
  getByHash(hash: string): Promise<MarketSnapshot | undefined> {
    return this.store.getByHash(hash)
  }

  /**
   * Read the snapshot for one exact versioned cutoff identity.
   * @param identity - Complete versioned identity without a content hash.
   * @returns A deeply frozen snapshot, or `undefined` when the identity is absent.
   */
  getByIdentity(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot | undefined> {
    return this.store.getByIdentity(identity)
  }

  /**
   * Verify and list stored content references under an explicit filesystem scan bound.
   * @param maxFiles - Maximum number of stored content files to inspect.
   * @returns Newest exact summaries first.
   */
  listSummaries(maxFiles: number): Promise<readonly MarketSnapshotSummary[]> {
    return this.store.listSummaries(maxFiles)
  }
}

export default MarketSnapshotService
