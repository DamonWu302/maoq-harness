import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  TacticLabHistoryService,
  type TacticLabHistoryAdapter,
  type TacticLabHistoryChunk,
} from '../src/index.ts'

function adapter(name: string, chunks: readonly TacticLabHistoryChunk[] = []): TacticLabHistoryAdapter {
  return {
    name,
    async *load() {
      yield* chunks
    },
  }
}

describe('tactic history service', () => {
  it('registers, resolves, streams, sorts, and disposes exact providers', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(TacticLabHistoryService)
    await fiber
    const second = adapter('z-source')
    const first = adapter('a-source')
    const disposeSecond = ctx.marketTacticHistory.register(second)
    const disposeFirst = ctx.marketTacticHistory.register(first)
    expect(ctx.marketTacticHistory.listAdapters()).toEqual(['a-source', 'z-source'])
    expect(ctx.marketTacticHistory.getAdapter('a-source')).toBe(first)
    const values = []
    for await (const value of ctx.marketTacticHistory.load('a-source', {
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      chunkSessions: 2,
      minimumStocks: 1,
    })) values.push(value)
    expect(values).toEqual([])
    disposeFirst()
    disposeSecond()
    expect(ctx.marketTacticHistory.listAdapters()).toEqual([])
    await fiber.dispose()
  })

  it('rejects malformed, duplicate, and missing provider identities', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(TacticLabHistoryService)
    await fiber
    expect(() => ctx.marketTacticHistory.register(adapter('Bad_Name'))).toThrow(/lowercase hyphenated/)
    const first = adapter('same-source')
    const dispose = ctx.marketTacticHistory.register(first)
    expect(() => ctx.marketTacticHistory.register(adapter('same-source'))).toThrow(/already registered/)
    expect(() => ctx.marketTacticHistory.getAdapter('missing')).toThrow(/not registered/)
    expect(() => ctx.marketTacticHistory.load('missing', {
      startDate: '2026-01-01', endDate: '2026-01-02', chunkSessions: 2, minimumStocks: 1,
    })).toThrow(/not registered/)
    dispose()
    dispose()
    await fiber.dispose()
  })
})
