import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, type Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dailyRefreshStartMinutes, MaoqDailyRefreshRuntime } from '../src/daily-runtime.ts'

function shanghaiInstant(value: string): Date {
  return new Date(`${value}+08:00`)
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  let status: 'idle' | 'running' = 'idle'
  let idle = Promise.withResolvers<undefined>()
  idle.resolve(undefined)
  const agent = {
    id: SessionId('maoq-daily-runtime'),
    session: { id: SessionId('maoq-daily-runtime') },
    ctx: new Context(),
    get status() { return status },
    whenIdle: () => idle.promise,
    runMaintenance: <T>(task: (signal: AbortSignal) => Promise<T>) => {
      if (status !== 'idle') throw new Error('agent already has active work')
      return task(new AbortController().signal)
    },
  } as unknown as Agent
  const unregister = ctx.agents.register(agent)
  return {
    ctx,
    agent,
    setBusy() {
      status = 'running'
      idle = Promise.withResolvers<undefined>()
    },
    setIdle() {
      status = 'idle'
      idle.resolve(undefined)
    },
    unregister,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(shanghaiInstant('2026-09-01T15:35:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MAOQ automatic daily refresh runtime', () => {
  it('refreshes one current snapshot revision and detects a revised hash without repeated analysis', async () => {
    const test = await harness()
    let snapshotHash = 'snapshot-a'
    const refresh = vi.fn((_agent: Agent, _signal: AbortSignal, _selection: unknown) => Promise.resolve())
    const runtime = new MaoqDailyRefreshRuntime(test.ctx, {
      policy: () => ({ enabled: true, time: '15:35', retryMinutes: 15, windowMinutes: 120 }),
      select: () => Promise.resolve({ tradingDate: '2026-09-01', snapshotHash, payload: snapshotHash }),
      refresh,
    })

    runtime.adopt(test.agent)
    await vi.waitFor(() => { expect(refresh).toHaveBeenCalledTimes(1) })
    expect(refresh.mock.calls[0]?.[2]).toMatchObject({ snapshotHash: 'snapshot-a' })

    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(refresh).toHaveBeenCalledTimes(1)

    snapshotHash = 'snapshot-b'
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    await vi.waitFor(() => { expect(refresh).toHaveBeenCalledTimes(2) })
    expect(refresh.mock.calls[1]?.[2]).toMatchObject({ snapshotHash: 'snapshot-b' })

    await runtime.dispose()
    await vi.advanceTimersByTimeAsync(3 * 60 * 60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    test.unregister()
  })

  it('waits for an exact busy owner to become idle before starting maintenance', async () => {
    vi.setSystemTime(shanghaiInstant('2026-09-01T18:00:00'))
    const test = await harness()
    test.setBusy()
    const refresh = vi.fn((_agent: Agent, _signal: AbortSignal, _selection: unknown) => Promise.resolve())
    const runtime = new MaoqDailyRefreshRuntime(test.ctx, {
      policy: () => ({ enabled: true, time: '15:35', retryMinutes: 15, windowMinutes: 120 }),
      select: () => Promise.resolve({ tradingDate: '2026-09-01', snapshotHash: 'snapshot-a', payload: null }),
      refresh,
    })

    runtime.adopt(test.agent)
    await vi.waitFor(() => { expect(test.agent.status).toBe('running') })
    expect(refresh).not.toHaveBeenCalled()
    test.setIdle()
    await vi.waitFor(() => { expect(refresh).toHaveBeenCalledTimes(1) })

    await runtime.dispose()
    test.unregister()
  })

  it('validates the configured Shanghai clock time', () => {
    expect(dailyRefreshStartMinutes('15:35')).toBe(15 * 60 + 35)
    expect(() => dailyRefreshStartMinutes('24:00')).toThrow('real 24-hour')
    expect(() => dailyRefreshStartMinutes('9:30')).toThrow('HH:mm')
  })
})
