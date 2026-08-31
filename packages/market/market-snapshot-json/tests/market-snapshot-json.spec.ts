import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  MarketSnapshotService,
  marketSnapshotIdentityHash,
} from '@deepseek-ai/dsh-market-snapshot'
import { apply, inject, JsonMarketSnapshotAdapter } from '../src/index.ts'
import { identity, normalDraft } from '../../market-snapshot/tests/fixtures.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'maoq-json-adapter-'))
  roots.push(root)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, `${marketSnapshotIdentityHash(identity)}.json`), JSON.stringify(normalDraft()), 'utf8')
  return root
}

describe('JSON market snapshot adapter', () => {
  it('loads the exact identity-addressed provider-neutral draft', async () => {
    const adapter = new JsonMarketSnapshotAdapter({ root: await fixtureRoot() })
    await expect(adapter.load(identity)).resolves.toEqual(normalDraft())
  })

  it('registers and disposes through a real Cordis composition', async () => {
    const ctx = new Context()
    const service = ctx.plugin(MarketSnapshotService, { root: join(await fixtureRoot(), 'snapshots') })
    await service
    const provider = ctx.plugin({ inject: [...inject], apply }, { root: roots[0]!, adapterName: 'audited-json' })
    await provider
    expect(ctx.marketSnapshots.listAdapters()).toEqual(['audited-json'])
    await expect(ctx.marketSnapshots.build('audited-json', identity)).resolves.toMatchObject({
      identity: { tradingDate: identity.tradingDate },
    })
    await provider.dispose()
    expect(ctx.marketSnapshots.listAdapters()).toEqual([])
    await service.dispose()
  })
})
