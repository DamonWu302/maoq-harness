/** Deterministic point-in-time market snapshot service for MAOQ. @module @deepseek-ai/dsh-market-snapshot */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { buildMarketSnapshot } from './builder.ts'
import { MarketSnapshotStore } from './store.ts'
import type { MarketSnapshot, MarketSnapshotAdapter, MarketSnapshotIdentityInput } from './types.ts'

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

  constructor(ctx: Context, config: Config) {
    super(ctx, 'marketSnapshots')
    this.store = new MarketSnapshotStore(config.root)
  }

  /** Load normalized facts from an adapter, validate them, and persist canonical bytes. */
  async build(adapter: MarketSnapshotAdapter, identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot> {
    const draft = await adapter.load(identity)
    const snapshot = buildMarketSnapshot(draft)
    await this.store.put(snapshot)
    return snapshot
  }

  /** Read one immutable snapshot by content hash. */
  getByHash(hash: string): Promise<MarketSnapshot | undefined> {
    return this.store.getByHash(hash)
  }

  /** Read the snapshot for one exact versioned cutoff identity. */
  getByIdentity(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot | undefined> {
    return this.store.getByIdentity(identity)
  }
}

export default MarketSnapshotService
