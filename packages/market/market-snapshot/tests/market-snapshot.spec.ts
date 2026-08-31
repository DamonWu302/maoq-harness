import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  buildMarketSnapshot,
  canonicalJson,
  MarketSnapshotConflictError,
  MarketSnapshotService,
  MarketSnapshotStore,
  MarketSnapshotValidationError,
  type MarketSnapshotAdapter,
} from '../src/index.ts'
import { identity, normalDraft, provenance, stock } from './fixtures.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'maoq-market-snapshot-'))
  roots.push(root)
  return root
}

describe('deterministic construction', () => {
  it('normalizes unordered inputs into the same content hash and bytes', () => {
    const first = normalDraft()
    const base = normalDraft()
    const second = {
      ...base,
      identity: { ...base.identity, sourceVersions: [...base.identity.sourceVersions].reverse() },
      stocks: [...base.stocks].reverse(),
      sectors: base.sectors.map(sector => ({ ...sector, members: [...sector.members].reverse() })),
      breadth: { ...base.breadth, majorIndices: [...base.breadth.majorIndices].reverse() },
      emotion: {
        ...base.emotion,
        consecutiveBoardCounts: [...base.emotion.consecutiveBoardCounts].reverse(),
      },
    }
    const left = buildMarketSnapshot(first)
    const right = buildMarketSnapshot(second)
    expect(right.identity.contentHash).toBe(left.identity.contentHash)
    expect(canonicalJson(right)).toBe(canonicalJson(left))
    expect(Object.isFrozen(left)).toBe(true)
    expect(Object.isFrozen(left.stocks)).toBe(true)
  })

  it('retains explicit suspended-stock semantics', () => {
    const base = normalDraft()
    const draft = { ...base, stocks: [...base.stocks, stock({
      symbol: '000002.SZ',
      open: 8,
      high: 8,
      low: 8,
      close: 8,
      volume: 0,
      amount: 0,
      turnoverRate: 0,
      tradingStatus: 'suspended',
    })] }
    expect(buildMarketSnapshot(draft).stocks.find(item => item.symbol === '000002.SZ'))
      .toMatchObject({ tradingStatus: 'suspended', volume: 0, amount: 0 })
  })

  it('retains explicit newly-listed semantics', () => {
    const base = normalDraft()
    const draft = {
      ...base,
      stocks: [...base.stocks, stock({ symbol: '001234.SZ', listingDays: 3, qualityFlags: ['new-listing'] })],
    }
    expect(buildMarketSnapshot(draft).stocks.find(item => item.symbol === '001234.SZ'))
      .toMatchObject({ listingDays: 3, qualityFlags: ['new-listing'] })
  })

  it('retains explicit delisting-path semantics', () => {
    const base = normalDraft()
    const draft = {
      ...base,
      stocks: [...base.stocks, stock({
        symbol: '000999.SZ',
        tradingStatus: 'delisting',
        qualityFlags: ['delisting-period'],
      })],
    }
    expect(buildMarketSnapshot(draft).stocks.find(item => item.symbol === '000999.SZ'))
      .toMatchObject({ tradingStatus: 'delisting', qualityFlags: ['delisting-period'] })
  })

  it('retains limit-up and limit-down constraints without inference', () => {
    const base = normalDraft()
    const draft = {
      ...base,
      stocks: [
        ...base.stocks,
        stock({ symbol: '300001.SZ', limitStatus: 'limit-up' }),
        stock({ symbol: '300002.SZ', limitStatus: 'limit-down' }),
      ],
    }
    const snapshot = buildMarketSnapshot(draft)
    expect(snapshot.stocks.find(item => item.symbol === '300001.SZ')?.limitStatus).toBe('limit-up')
    expect(snapshot.stocks.find(item => item.symbol === '300002.SZ')?.limitStatus).toBe('limit-down')
  })

  it('rejects sector membership that is not effective on the trading date', () => {
    const base = normalDraft()
    const sector = base.sectors[0]!
    const draft = {
      ...base,
      sectors: [{
        ...sector,
        members: [
          { symbol: '600000.SH', effectiveFrom: '2026-08-29', effectiveTo: null },
          ...sector.members.slice(1),
        ],
      }],
    }
    expect(() => buildMarketSnapshot(draft)).toThrow(/not effective/)
  })

  it('rejects missing critical facts instead of inventing defaults', () => {
    const draft = { ...normalDraft(), stocks: [] }
    expect(() => buildMarketSnapshot(draft)).toThrow(MarketSnapshotValidationError)
  })

  it('rejects conflicting records for one symbol', () => {
    const base = normalDraft()
    const draft = { ...base, stocks: [...base.stocks, stock()] }
    expect(() => buildMarketSnapshot(draft)).toThrow(/conflicting duplicate/)
  })

  it('excludes news published or fetched after the decision cutoff', () => {
    const base = normalDraft()
    const draft = { ...base, news: [...base.news, {
      ...base.news[0]!,
      id: 'published-after',
      publishedAt: '2026-08-28T15:31:00+08:00',
      provenance: provenance('news', 'published-after'),
    }, {
      ...base.news[0]!,
      id: 'fetched-after',
      fetchedAt: '2026-08-28T15:31:00+08:00',
      provenance: provenance('news', 'fetched-after'),
    }] }
    expect(buildMarketSnapshot(draft).news.map(item => item.id)).toEqual(['policy-before-cutoff'])
  })
})

describe('immutable persistence and service', () => {
  it('persists byte-stable canonical output and reads it by hash or exact identity', async () => {
    const root = await temporaryRoot()
    const store = new MarketSnapshotStore(root)
    const snapshot = buildMarketSnapshot(normalDraft())
    await store.put(snapshot)
    await store.put(snapshot)
    const bytes = await readFile(join(root, 'snapshots', `${snapshot.identity.contentHash}.json`), 'utf8')
    expect(bytes).toBe(`${canonicalJson(snapshot)}\n`)
    await expect(store.getByHash(snapshot.identity.contentHash)).resolves.toEqual(snapshot)
    await expect(store.getByIdentity(identity)).resolves.toEqual(snapshot)
    await expect(store.listSummaries(1)).resolves.toEqual([{
      tradingDate: snapshot.identity.tradingDate,
      cutoffTime: snapshot.identity.cutoffTime,
      contentHash: snapshot.identity.contentHash,
      stocks: snapshot.stocks.length,
      sectors: snapshot.sectors.length,
      indices: snapshot.breadth.majorIndices.length,
      news: snapshot.news.length,
      warnings: [],
    }])
    await expect(store.listSummaries(0)).rejects.toThrow(/positive integer/)
  })

  it('rejects a non-hash lookup before resolving a filesystem path', async () => {
    const store = new MarketSnapshotStore(await temporaryRoot())
    await expect(store.getByHash('../identity')).rejects.toThrow(/lowercase SHA-256/)
  })

  it('refuses to rebind one exact identity to different content', async () => {
    const root = await temporaryRoot()
    const store = new MarketSnapshotStore(root)
    await store.put(buildMarketSnapshot(normalDraft()))
    const base = normalDraft()
    const changed = {
      ...base,
      stocks: base.stocks.map((item, index) => index === 0 ? { ...item, close: 10.7 } : item),
    }
    await expect(store.put(buildMarketSnapshot(changed))).rejects.toThrow(MarketSnapshotConflictError)
  })

  it('builds only through a provider-neutral adapter and returns frozen reads', async () => {
    const root = await temporaryRoot()
    const ctx = new Context()
    const fiber = ctx.plugin(MarketSnapshotService, { root })
    await fiber
    const adapter: MarketSnapshotAdapter = {
      name: 'offline-fixture',
      load: requested => Promise.resolve({ ...normalDraft(), identity: requested }),
      discoverRecent: () => Promise.resolve([identity]),
    }
    const disposeAdapter = ctx.marketSnapshots.register(adapter)
    expect(ctx.marketSnapshots.listAdapters()).toEqual(['offline-fixture'])
    expect(ctx.marketSnapshots.describeAdapters()).toEqual([{
      name: 'offline-fixture', supportsRecentDiscovery: true,
    }])
    await expect(ctx.marketSnapshots.discoverRecent('offline-fixture', {
      beforeOrOn: identity.tradingDate,
      cutoffTime: identity.cutoffTime,
      limit: 1,
    })).resolves.toEqual([identity])
    const snapshot = await ctx.marketSnapshots.build('offline-fixture', identity)
    const loaded = await ctx.marketSnapshots.getByHash(snapshot.identity.contentHash)
    expect(loaded).toEqual(snapshot)
    expect(Object.isFrozen(loaded)).toBe(true)
    disposeAdapter()
    expect(ctx.marketSnapshots.listAdapters()).toEqual([])
    await fiber.dispose()
  })

  it('refuses duplicate, missing, and identity-changing adapters', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(MarketSnapshotService, { root: await temporaryRoot() })
    await fiber
    const adapter: MarketSnapshotAdapter = {
      name: 'fixture',
      load: () => Promise.resolve(normalDraft()),
    }
    const dispose = ctx.marketSnapshots.register(adapter)
    expect(() => ctx.marketSnapshots.register(adapter)).toThrow(/already registered/)
    await expect(ctx.marketSnapshots.build('missing', identity)).rejects.toThrow(/not registered/)
    await expect(ctx.marketSnapshots.discoverRecent('fixture', {
      beforeOrOn: identity.tradingDate,
      cutoffTime: identity.cutoffTime,
      limit: 1,
    })).rejects.toThrow(/does not support/)
    const changedIdentity = { ...identity, cutoffTime: '2026-08-28T15:31:00+08:00' }
    await expect(ctx.marketSnapshots.build('fixture', changedIdentity)).rejects.toThrow(/different identity/)
    dispose()
    await fiber.dispose()
  })
})
