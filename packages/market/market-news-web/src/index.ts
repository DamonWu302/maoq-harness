/** Cutoff-safe web policy and news acquisition for MAOQ. */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { NewsEvidence } from '@deepseek-ai/dsh-market-snapshot'
import type { WebSearchResult } from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-web'
import {
  MARKET_NEWS_BATCH_SCHEMA_VERSION,
  MarketNewsEvidenceError,
  MarketNewsEvidenceStore,
  type MarketNewsAcquireInput,
  type MarketNewsBatch,
  type MarketNewsQuery,
} from './store.ts'

export {
  MARKET_NEWS_BATCH_SCHEMA_VERSION,
  MarketNewsEvidenceError,
  MarketNewsEvidenceStore,
} from './store.ts'
export type { MarketNewsAcquireInput, MarketNewsBatch, MarketNewsQuery } from './store.ts'

/** Filesystem location for immutable evidence batches. */
export interface Config {
  /** Directory containing content-addressed web evidence batches. */
  readonly root: string
}

export const name = 'market-news-web'
export const inject = ['web']

/** Storage configuration for acquired evidence. */
export const Config: z<Config> = z.object({ root: z.string().required() })

declare module '@deepseek-ai/cordis' {
  interface Context {
    marketNews: MarketNewsWebService
  }
}

function requireText(value: string, field: string): void {
  if (value.length === 0 || value.trim() !== value) throw new MarketNewsEvidenceError(`${field} must be non-blank and trimmed`)
}

function validateInput(input: MarketNewsAcquireInput): void {
  requireText(input.tradingDate, 'tradingDate')
  requireText(input.queryVersion, 'queryVersion')
  if (!Number.isFinite(Date.parse(input.cutoffTime))) throw new MarketNewsEvidenceError('cutoffTime must be an ISO timestamp')
  if (input.queries.length === 0) throw new MarketNewsEvidenceError('queries must not be empty')
  for (const [index, query] of input.queries.entries()) {
    requireText(query.query, `queries[${String(index)}].query`)
    if (!Number.isFinite(query.confidence) || query.confidence < 0 || query.confidence > 1) {
      throw new MarketNewsEvidenceError(`queries[${String(index)}].confidence must be between 0 and 1`)
    }
  }
}

function publisherOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    throw new MarketNewsEvidenceError(`source URL is invalid: ${url}`)
  }
}

function sourceId(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function mapResult(
  result: WebSearchResult,
  query: MarketNewsQuery,
  queryVersion: string,
  fetchedAt: string,
  cutoff: number,
): NewsEvidence[] {
  return result.sources.map((item) => {
    if (item.title === undefined || item.publishedAt === undefined) {
      throw new MarketNewsEvidenceError(`source ${item.url} lacks title or publishedAt`)
    }
    const published = Date.parse(item.publishedAt)
    if (!Number.isFinite(published)) throw new MarketNewsEvidenceError(`source ${item.url} has invalid publishedAt`)
    if (published > cutoff) throw new MarketNewsEvidenceError(`source ${item.url} was published after the cutoff`)
    const id = sourceId(item.url)
    return {
      id,
      title: item.title.trim(),
      url: item.url,
      publisher: publisherOf(item.url),
      publishedAt: item.publishedAt,
      fetchedAt,
      eventAt: item.publishedAt,
      affectedSectors: [...query.affectedSectors].sort(),
      confidence: query.confidence,
      provenance: {
        source: {
          adapter: 'web-search',
          dataset: query.query,
          version: queryVersion,
          retrievedAt: fetchedAt,
          recordId: id,
        },
        transforms: ['publisher=url-hostname', 'event-time=publication-time', 'sector-and-confidence=query-policy'],
      },
    }
  })
}

function mergeDuplicates(evidence: readonly NewsEvidence[]): NewsEvidence[] {
  const byUrl = new Map<string, NewsEvidence>()
  for (const item of evidence) {
    const current = byUrl.get(item.url)
    if (current === undefined) {
      byUrl.set(item.url, item)
      continue
    }
    if (current.title !== item.title || current.publishedAt !== item.publishedAt) {
      throw new MarketNewsEvidenceError(`conflicting search metadata for ${item.url}`)
    }
    byUrl.set(item.url, {
      ...current,
      affectedSectors: [...new Set([...current.affectedSectors, ...item.affectedSectors])].sort(),
      confidence: Math.min(current.confidence, item.confidence),
      provenance: {
        ...current.provenance,
        transforms: [...current.provenance.transforms, 'duplicate-url=merged-sectors-and-min-confidence'],
      },
    })
  }
  return [...byUrl.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Acquires before cutoff, freezes once, and replays only by content hash. */
export class MarketNewsWebService extends Service {
  private readonly store: MarketNewsEvidenceStore

  constructor(ctx: Context, config: Config, private readonly clock: () => Date = () => new Date()) {
    super(ctx, 'marketNews')
    this.store = new MarketNewsEvidenceStore(config.root)
  }

  /** Search all versioned questions and persist one immutable evidence batch. */
  async acquire(input: MarketNewsAcquireInput, signal?: AbortSignal): Promise<MarketNewsBatch> {
    validateInput(input)
    const cutoff = Date.parse(input.cutoffTime)
    if (this.clock().getTime() > cutoff) throw new MarketNewsEvidenceError('acquisition started after the cutoff')
    const results = await Promise.all(input.queries.map(query => this.ctx.web.search({
      query: query.query,
      maxResults: input.maxResults ?? 10,
    }, signal)))
    const fetchedAt = this.clock().toISOString()
    if (Date.parse(fetchedAt) > cutoff) throw new MarketNewsEvidenceError('acquisition completed after the cutoff')
    const evidence = mergeDuplicates(results.flatMap((result, index) => {
      const query = input.queries[index]
      if (query === undefined) throw new MarketNewsEvidenceError(`search result ${String(index)} has no query`)
      return mapResult(result, query, input.queryVersion, fetchedAt, cutoff)
    }))
    return this.store.put({
      schemaVersion: MARKET_NEWS_BATCH_SCHEMA_VERSION,
      tradingDate: input.tradingDate,
      cutoffTime: input.cutoffTime,
      queryVersion: input.queryVersion,
      fetchedAt,
      evidence,
    })
  }

  /** Read and verify one exact frozen batch without performing network access. */
  get(hash: string): Promise<MarketNewsBatch> {
    return this.store.get(hash)
  }
}

export default MarketNewsWebService
