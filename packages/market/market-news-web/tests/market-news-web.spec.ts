import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { type WebSearchProvider, type WebSearchResult } from '@deepseek-ai/dsh-web'
import {
  MarketNewsEvidenceError,
  MarketNewsWebService,
  type MarketNewsAcquireInput,
} from '../src/index.ts'

const roots: string[] = []
const BEFORE = new Date('2026-08-28T10:00:00.000Z')
const CUTOFF = '2026-08-28T19:00:00+08:00'

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function input(): MarketNewsAcquireInput {
  return {
    tradingDate: '2026-08-28',
    cutoffTime: CUTOFF,
    queryVersion: 'maoq-policy-queries-v1',
    queries: [
      { query: '中国 货币政策 2026-08-28', affectedSectors: ['801780.SI'], confidence: 0.8 },
      { query: '中国 产业政策 2026-08-28', affectedSectors: ['801080.SI'], confidence: 0.6 },
    ],
  }
}

async function fixture(
  result: WebSearchResult,
  clock: () => Date = () => BEFORE,
): Promise<{ service: MarketNewsWebService; calls: string[]; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'maoq-market-news-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(WebRuntime)
  const calls: string[] = []
  const provider: WebSearchProvider = {
    id: 'fixture',
    available: () => true,
    search: ({ query }) => {
      calls.push(query)
      return Promise.resolve(result)
    },
  }
  ctx.web.registerSearchProvider(provider)
  return { service: new MarketNewsWebService(ctx, { root }, clock), calls, root }
}

const completeResult: WebSearchResult = {
  sources: [{
    url: 'https://www.gov.cn/zhengce/example',
    title: '政策事实',
    publishedAt: '2026-08-28T09:00:00+08:00',
  }],
  truncated: false,
}

describe('market news web evidence', () => {
  it('freezes pre-cutoff searches and replays them by exact content hash', async () => {
    const { service, calls } = await fixture(completeResult)
    const batch = await service.acquire(input())
    const replay = await service.get(batch.contentHash)

    expect(calls).toEqual(['中国 货币政策 2026-08-28', '中国 产业政策 2026-08-28'])
    expect(replay).toEqual(batch)
    expect(replay.evidence).toHaveLength(1)
    expect(replay.evidence[0]).toMatchObject({
      publisher: 'www.gov.cn',
      eventAt: '2026-08-28T09:00:00+08:00',
      affectedSectors: ['801080.SI', '801780.SI'],
      confidence: 0.6,
    })
    expect(Object.isFrozen(replay.evidence[0]?.provenance.source)).toBe(true)
  })

  it('rejects acquisition started or completed after cutoff', async () => {
    const lateStart = await fixture(completeResult, () => new Date('2026-08-28T11:01:00.000Z'))
    await expect(lateStart.service.acquire(input())).rejects.toThrow(/started after the cutoff/)
    expect(lateStart.calls).toEqual([])

    const times = [BEFORE, new Date('2026-08-28T11:01:00.000Z')]
    const lateFinish = await fixture(completeResult, () => times.shift()!)
    await expect(lateFinish.service.acquire(input())).rejects.toThrow(/completed after the cutoff/)
  })

  it('rejects missing publication evidence and post-cutoff publication', async () => {
    const missing = await fixture({ sources: [{ url: 'https://example.com', title: 'unknown time' }], truncated: false })
    await expect(missing.service.acquire(input())).rejects.toThrow(/lacks title or publishedAt/)

    const future = await fixture({
      sources: [{ url: 'https://example.com', title: 'future', publishedAt: '2026-08-28T20:00:00+08:00' }],
      truncated: false,
    })
    await expect(future.service.acquire(input())).rejects.toThrow(/published after the cutoff/)
  })

  it('detects persisted-byte corruption on replay', async () => {
    const { service, root } = await fixture(completeResult)
    const batch = await service.acquire(input())
    await writeFile(join(root, `${batch.contentHash}.json`), JSON.stringify({ ...batch, queryVersion: 'tampered' }), 'utf8')
    await expect(service.get(batch.contentHash)).rejects.toThrow(MarketNewsEvidenceError)
  })
})
