import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import MarketSnapshotService, {
  type MarketSnapshotAdapter,
  type MarketSnapshotDiscoveryRequest,
  type MarketSnapshotDraft,
  type MarketSnapshotIdentityInput,
} from '@deepseek-ai/dsh-market-snapshot'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { normalDraft } from '../../market-snapshot/tests/fixtures.ts'
import * as ToolMaoqSnapshot from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function draftFor(identity: MarketSnapshotIdentityInput): MarketSnapshotDraft {
  const base = normalDraft()
  const provenance = (value: typeof base.breadth.provenance) => ({
    ...value,
    source: { ...value.source, retrievedAt: identity.cutoffTime, recordId: `${value.source.recordId}-${identity.tradingDate}` },
  })
  return {
    ...base,
    identity,
    stocks: base.stocks.map(item => ({ ...item, tradingDate: identity.tradingDate, provenance: provenance(item.provenance) })),
    sectors: base.sectors.map(item => ({ ...item, tradingDate: identity.tradingDate, provenance: provenance(item.provenance) })),
    breadth: { ...base.breadth, provenance: provenance(base.breadth.provenance) },
    emotion: { ...base.emotion, provenance: provenance(base.emotion.provenance) },
    news: [],
  }
}

class FixtureAdapter implements MarketSnapshotAdapter {
  readonly name = 'fixture-source'
  readonly dates = ['2026-08-26', '2026-08-27', '2026-08-28']

  discoverRecent(request: MarketSnapshotDiscoveryRequest): Promise<readonly MarketSnapshotIdentityInput[]> {
    const dates = this.dates.filter(date => date <= request.beforeOrOn).slice(-request.limit)
    return Promise.resolve(dates.map(date => ({
      tradingDate: date,
      cutoffTime: request.cutoffTime,
      calendarVersion: 'fixture-calendar-v1',
      adjustmentVersion: `fixture-qfq-${date}`,
      sectorClassificationVersion: 'fixture-sector-v1',
      sourceVersions: [`fixture-daily-${date}`],
    })))
  }

  load(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshotDraft> {
    return Promise.resolve(draftFor(identity))
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'maoq-snapshot-tool-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(MarketSnapshotService, { root })
  ctx.marketSnapshots.register(new FixtureAdapter())
  await ctx.plugin(ToolMaoqSnapshot, {
    allowedAdapters: ['fixture-source'],
    maxGenerateCount: 3,
    maxListCount: 10,
    maxScanFiles: 20,
    generateTimeoutMs: 10_000,
  })
  const agent = { id: SessionId('maoq-snapshot-test'), options: {} } as unknown as Agent
  const execute = (name: string, args: Record<string, unknown>) => ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`${name}-call`),
    name,
    arguments: args,
    agent,
  })
  return { ctx, execute }
}

describe('MAOQ snapshot tools', () => {
  it('discovers, generates, lists, and inspects exact immutable snapshots', async () => {
    const { execute } = await setup()
    const sources = await execute('maoq_snapshot_sources', {})
    expect(sources.isError).toBe(false)
    if (sources.isError) throw new Error('expected source result')
    expect(sources.value).toEqual({
      sources: [{ name: 'fixture-source', supportsRecentDiscovery: true, generationAllowed: true }],
    })

    const generated = await execute('maoq_snapshot_generate', {
      adapterName: 'fixture-source',
      beforeOrOn: '2026-08-28',
      cutoffTime: '2026-08-28T15:30:00+08:00',
      count: 3,
    })
    expect(generated.isError).toBe(false)
    if (generated.isError) throw new Error('expected generation result')
    const value = generated.value as { generated: { contentHash: string }[]; currentHash: string; historyHashes: string[] }
    expect(value.generated).toHaveLength(3)
    expect(value.currentHash).toBe(value.generated[2]!.contentHash)
    expect(value.historyHashes).toEqual(value.generated.slice(0, 2).map(item => item.contentHash))

    const listed = await execute('maoq_snapshot_list', { limit: 2 })
    expect(listed.isError).toBe(false)
    if (listed.isError) throw new Error('expected list result')
    expect(listed.value).toMatchObject({ truncated: true, snapshots: [{ tradingDate: '2026-08-28' }, { tradingDate: '2026-08-27' }] })

    const inspected = await execute('maoq_snapshot_inspect', { hash: value.currentHash })
    expect(inspected.isError).toBe(false)
    if (inspected.isError) throw new Error('expected inspect result')
    expect(inspected.value).toMatchObject({ summary: { tradingDate: '2026-08-28' }, quality: { status: 'complete' } })
  })

  it('enforces the source allowlist and generation bound outside model control', async () => {
    const { execute } = await setup()
    const disallowed = await execute('maoq_snapshot_generate', {
      adapterName: 'other-source',
      beforeOrOn: '2026-08-28',
      cutoffTime: '2026-08-28T15:30:00+08:00',
      count: 1,
    })
    expect(disallowed.isError).toBe(true)
    const oversized = await execute('maoq_snapshot_generate', {
      adapterName: 'fixture-source',
      beforeOrOn: '2026-08-28',
      cutoffTime: '2026-08-28T15:30:00+08:00',
      count: 4,
    })
    expect(oversized.isError).toBe(true)
  })
})
