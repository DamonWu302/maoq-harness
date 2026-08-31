/** JSON-file adapter for externally acquired MAOQ market facts. @module @deepseek-ai/dsh-market-snapshot-json */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  marketSnapshotIdentityHash,
  type MarketSnapshotAdapter,
  type MarketSnapshotDraft,
  type MarketSnapshotIdentityInput,
} from '@deepseek-ai/dsh-market-snapshot'

/** Adapter name and directory containing identity-addressed JSON drafts. */
export interface Config {
  /** Directory containing `<identity-sha256>.json` draft files. */
  readonly root: string
  /** Registry name used by snapshot build requests; defaults to `json-file`. */
  readonly adapterName?: string
}

/** Cordis plugin name. */
export const name = 'market-snapshot-json'
/** Service required before this adapter can register. */
export const inject = ['marketSnapshots']

/** Loader schema for the JSON draft directory and registry name. */
export const Config: z<Config> = z.object({
  root: z.string().required(),
  adapterName: z.string().default('json-file'),
})

/** Reads one provider-neutral draft selected by its complete versioned identity. */
export class JsonMarketSnapshotAdapter implements MarketSnapshotAdapter {
  readonly name: string
  private readonly root: string

  /**
   * Resolve the import directory once and expose the configured registry name.
   * @param config - Import directory and optional adapter registry name.
   */
  constructor(config: Config) {
    this.name = config.adapterName ?? 'json-file'
    this.root = resolve(config.root)
  }

  /**
   * Read the one draft whose filename matches the complete requested identity.
   * @param identity - Complete versioned identity used to address the JSON file.
   * @returns The parsed provider-neutral draft; the snapshot service performs semantic validation.
   */
  async load(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshotDraft> {
    const path = join(this.root, `${marketSnapshotIdentityHash(identity)}.json`)
    const bytes = await readFile(path, 'utf8')
    return JSON.parse(bytes) as MarketSnapshotDraft
  }
}

/** Register the JSON adapter for this plugin fiber's lifetime. */
export function apply(ctx: Context, config: Config): void {
  const adapter = new JsonMarketSnapshotAdapter(config)
  ctx.effect(() => ctx.marketSnapshots.register(adapter))
}
