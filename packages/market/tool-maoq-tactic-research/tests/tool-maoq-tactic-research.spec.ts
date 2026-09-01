import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import TacticLabHistoryService from '@deepseek-ai/dsh-market-tactic-lab'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import * as ToolMaoqTacticResearch from '../src/index.ts'
import { fixtureHistoryAdapter } from './fixtures.ts'

async function setup(maxRangeDays = 365) {
  const requests: unknown[] = []
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(TacticLabHistoryService)
  ctx.marketTacticHistory.register(fixtureHistoryAdapter(undefined, requests))
  await ctx.plugin(ToolMaoqTacticResearch, {
    allowedAdapters: ['fixture-history'],
    minimumStocks: 10,
    chunkSessions: 32,
    maxRangeDays,
    evaluationTimeoutMs: 10_000,
    recentSignalLimit: 2,
  })
  const agent = { id: SessionId('maoq-tactic-tool-test'), options: {} } as unknown as Agent
  const execute = (name: string, args: Record<string, unknown>, signal = new AbortController().signal) => ctx.tools.execute({
    signal,
    callId: ToolCallId(`${name}-call`),
    name,
    arguments: args,
    agent,
  })
  return { ctx, execute, requests }
}

describe('MAOQ tactic research tools', () => {
  it('lists exact sources and runs one bounded immutable tactic trial', async () => {
    const { ctx, execute, requests } = await setup()
    const sources = await execute('maoq_tactic_research_sources', {})
    expect(sources.isError).toBe(false)
    if (sources.isError) throw new Error('expected source result')
    expect(sources.value).toMatchObject({
      sources: [{ adapterName: 'fixture-history', evaluationAllowed: true, minimumStocks: 10, chunkSessions: 32 }],
    })
    const tactics = (sources.value as {
      tactics: { tacticId: string; publicEvidence: { evidenceId: string; decisionUse: string }[] }[]
    }).tactics
    expect(tactics).toHaveLength(6)
    expect(tactics[0]).toMatchObject({ tacticId: 'regime_signed_breakout_pullback' })
    expect(tactics[0]?.publicEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceId: 'china-factor-momentum-jef-2024', decisionUse: 'architecture-benchmark' }),
      expect.objectContaining({ evidenceId: 'bigquant-industry-state-rotation-2026', decisionUse: 'hypothesis' }),
    ]))
    expect(tactics[1]?.publicEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceId: 'easyquant-highest-board-negative-control-2026', decisionUse: 'negative-control' }),
      expect.objectContaining({ evidenceId: 'easyquant-first-board-low-open-2026', decisionUse: 'rejected' }),
    ]))

    const evaluated = await execute('maoq_tactic_backtest', {
      adapterName: 'fixture-history',
      tacticId: 'regime_signed_breakout_pullback',
      startDate: '2026-01-01',
      endDate: '2026-03-05',
    })
    expect(evaluated.isError).toBe(false)
    if (evaluated.isError) throw new Error('expected evaluation result')
    expect(requests).toEqual([{
      startDate: '2026-01-01', endDate: '2026-03-05', chunkSessions: 32, minimumStocks: 10,
    }])
    const report = (evaluated.value as { report: {
      source: { adapterName: string; historyChunkHashes: unknown[]; executionSessionCount: number; executionSessionHashes?: unknown }
      trial: { tacticId: string; tacticVersion: string }
      counts: { sessions: number; candidateSignalSessions: number }
      promotion: { decision: string; blockers: string[] }
    } }).report
    expect(report.source.adapterName).toBe('fixture-history')
    expect(report.source.historyChunkHashes).toHaveLength(2)
    expect(report.source.executionSessionCount).toBe(64)
    expect(report.source.executionSessionHashes).toBeUndefined()
    expect(report.trial).toMatchObject({
      tacticId: 'regime_signed_breakout_pullback', tacticVersion: 'regime-signed-breakout-pullback-v1',
    })
    expect(report.counts).toMatchObject({ sessions: 64, candidateSignalSessions: 4 })
    expect(report.promotion.decision).toBe('research')
    expect(report.promotion.blockers).toContain('deflated_sharpe_not_computed')
    expect((await ctx.systemPrompt.assemble()).sections.find(section => section.name === 'tool:maoq-tactic-research')?.text)
      .toContain('maoq_tactic_backtest')
    expect(ctx.tools.get('maoq_tactic_research_sources')?.presentCall?.({})).toEqual({
      card: 'generic', title: 'MAOQ tactic research sources',
    })
    expect(ctx.tools.get('maoq_tactic_backtest')?.presentCall?.({
      adapterName: 'fixture-history', tacticId: 'regime_signed_breakout_pullback',
      startDate: '2026-01-01', endDate: '2026-03-05',
    })).toEqual({ card: 'generic', title: 'Run MAOQ tactic backtest' })
    expect(ctx.tools.get('maoq_tactic_backtest')?.presentResult?.({
      adapterName: 'fixture-history', tacticId: 'regime_signed_breakout_pullback',
      startDate: '2026-01-01', endDate: '2026-03-05',
    }, { content: [], isError: false }))
      .toEqual({ card: 'generic' })
  })

  it('enforces deployment source and range policy before reading history', async () => {
    const { execute, requests } = await setup(30)
    const disallowed = await execute('maoq_tactic_backtest', {
      adapterName: 'other-history', tacticId: 'openable_emotion_leader', startDate: '2026-01-01', endDate: '2026-01-02',
    })
    expect(disallowed.isError).toBe(true)
    const oversized = await execute('maoq_tactic_backtest', {
      adapterName: 'fixture-history', tacticId: 'openable_emotion_leader', startDate: '2026-01-01', endDate: '2026-02-01',
    })
    expect(oversized.isError).toBe(true)
    const reversed = await execute('maoq_tactic_backtest', {
      adapterName: 'fixture-history', tacticId: 'openable_emotion_leader', startDate: '2026-01-02', endDate: '2026-01-01',
    })
    expect(reversed.isError).toBe(true)
    const malformed = await execute('maoq_tactic_backtest', {
      adapterName: 'fixture-history', tacticId: 'openable_emotion_leader', startDate: 'not-a-date', endDate: '2026-01-01',
    })
    expect(malformed.isError).toBe(true)
    const impossible = await execute('maoq_tactic_backtest', {
      adapterName: 'fixture-history', tacticId: 'openable_emotion_leader', startDate: '2026-02-31', endDate: '2026-03-02',
    })
    expect(impossible.isError).toBe(true)
    expect(requests).toEqual([])
  })

  it('rejects invalid direct config and honors pre-aborted evaluation calls', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(TacticLabHistoryService)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { allowedAdapters: [] }) }).toThrow(/allowedAdapters/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { allowedAdapters: ['same', 'same'] }) }).toThrow(/allowedAdapters/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { allowedAdapters: ['Bad_Name'] }) }).toThrow(/allowedAdapters/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { minimumStocks: Number.NaN }) }).toThrow(/minimumStocks/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { chunkSessions: 0 }) }).toThrow(/chunkSessions/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { maxRangeDays: 3654 }) }).toThrow(/maxRangeDays/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { evaluationTimeoutMs: 0 }) }).toThrow(/evaluationTimeoutMs/)
    expect(() => { ToolMaoqTacticResearch.apply(ctx, { recentSignalLimit: 31 }) }).toThrow(/recentSignalLimit/)

    const defaults = new Context()
    await defaults.plugin(SystemPrompt)
    await defaults.plugin(ToolRuntime)
    await defaults.plugin(TacticLabHistoryService)
    ToolMaoqTacticResearch.apply(defaults, {})
    expect(defaults.tools.get('maoq_tactic_backtest')).toBeDefined()

    const { execute, requests } = await setup()
    const controller = new AbortController()
    controller.abort()
    const aborted = await execute('maoq_tactic_backtest', {
      adapterName: 'fixture-history', tacticId: 'openable_emotion_leader', startDate: '2026-01-01', endDate: '2026-01-02',
    }, controller.signal)
    expect(aborted.isError).toBe(true)
    expect(requests).toEqual([])
  })
})
