/** Disposable post-close refresh runtime for the canonical MAOQ daily state. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1_000

/** Deployment policy read afresh before every scheduling decision. */
export interface DailyRefreshPolicy {
  readonly enabled: boolean
  readonly time: string
  readonly retryMinutes: number
  readonly windowMinutes: number
}

/** Canonical input identity selected before a refresh starts. */
export interface DailyRefreshSelection<T = unknown> {
  readonly tradingDate: string
  readonly snapshotHash: string
  readonly payload: T
}

interface ChinaClock {
  readonly tradingDate: string
  readonly weekday: number
  readonly minutes: number
  readonly year: number
  readonly month: number
  readonly day: number
}

interface RuntimeOptions<T> {
  readonly policy: () => DailyRefreshPolicy
  readonly select: () => Promise<DailyRefreshSelection<T>>
  readonly refresh: (agent: Agent, signal: AbortSignal, selection: DailyRefreshSelection<T>) => Promise<void>
}

function chinaClock(now: number): ChinaClock {
  const shifted = new Date(now + CHINA_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth() + 1
  const day = shifted.getUTCDate()
  return {
    tradingDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    year,
    month,
    day,
  }
}

function parseTime(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (match === null) throw new TypeError('dailyRefreshTime must use HH:mm')
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new TypeError('dailyRefreshTime must be a real 24-hour clock time')
  return hour * 60 + minute
}

/**
 * Validate and normalize one configured Shanghai-market refresh time.
 * @param value - Exact `HH:mm` 24-hour clock text.
 * @returns Minutes after Shanghai midnight.
 */
export function dailyRefreshStartMinutes(value: string): number {
  return parseTime(value)
}

function localEpoch(clock: ChinaClock, dayOffset: number, minutes: number): number {
  return Date.UTC(clock.year, clock.month - 1, clock.day + dayOffset, 0, minutes) - CHINA_OFFSET_MS
}

function nextWeekdayStart(clock: ChinaClock, startMinutes: number): number {
  for (let offset = 1; offset <= 7; offset += 1) {
    const weekday = (clock.weekday + offset) % 7
    if (weekday !== 0 && weekday !== 6) return localEpoch(clock, offset, startMinutes)
  }
  throw new Error('MAOQ daily refresh could not resolve the next weekday')
}

function isWeekday(clock: ChinaClock): boolean {
  return clock.weekday >= 1 && clock.weekday <= 5
}

function renderThrown(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

/** One process-local timer owner that refreshes only from an exact live root Agent. */
export class MaoqDailyRefreshRuntime<T = unknown> {
  private readonly stop = Promise.withResolvers<void>()
  private owner: Agent | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private run: Promise<void> | undefined
  private idleWait: Promise<void> | undefined
  private activeAbort: AbortController | undefined
  private requested = false
  private stopping = false
  private completedSnapshotHash: string | undefined
  private afterWindowAttemptDate: string | undefined
  private lastWarning: string | undefined

  /**
   * Construct an inactive runtime.
   * @param ctx - Global Agent and logging context.
   * @param options - Live policy plus canonical selection and refresh operations.
   */
  constructor(
    private readonly ctx: Context,
    private readonly options: RuntimeOptions<T>,
  ) {}

  /**
   * Adopt the first future live root Agent and begin scheduling.
   * @param agent - Candidate exact live root Agent.
   */
  adopt(agent: Agent): void {
    if (this.stopping || this.owner !== undefined || !this.ctx.agents.roots().includes(agent)) return
    this.owner = agent
    this.requestDrive()
  }

  /**
   * Release an exact departed owner and transfer to another live root when available.
   * @param agent - Exact Agent reported by the disposal event.
   */
  depart(agent: Agent): void {
    if (this.owner !== agent) return
    this.activeAbort?.abort('MAOQ daily refresh owner departed')
    this.owner = undefined
    const successor = this.ctx.agents.roots().find(candidate => candidate !== agent)
    if (successor !== undefined) this.owner = successor
    this.requestDrive()
  }

  /** Recompute timing after startup, owner changes, or live settings changes. */
  requestDrive(): void {
    if (this.stopping) return
    this.clearTimer()
    this.requested = true
    if (this.run !== undefined) return
    const run = this.driveRequested()
    this.run = run
    void run.then(
      () => { this.retire(run) },
      (error: unknown) => {
        if (!this.stopping) this.ctx.logger.warn(`maoq daily refresh runtime failed: ${renderThrown(error)}`)
        this.retire(run)
      },
    )
  }

  /** Forget the completed input after a settings change and recompute from current policy. */
  invalidate(): void {
    this.completedSnapshotHash = undefined
    this.afterWindowAttemptDate = undefined
    this.activeAbort?.abort('MAOQ daily refresh settings changed')
    this.requestDrive()
  }

  /** Cancel timers and active analysis, then await runtime quiescence. */
  async dispose(): Promise<void> {
    if (this.stopping) return
    this.stopping = true
    this.requested = false
    this.clearTimer()
    this.activeAbort?.abort('MAOQ daily refresh plugin disposed')
    this.stop.resolve()
    await Promise.allSettled([this.run, this.idleWait].filter((value): value is Promise<void> => value !== undefined))
  }

  private async driveRequested(): Promise<void> {
    while (this.requested && !this.stopping) {
      this.requested = false
      await this.driveOnce()
    }
  }

  private retire(run: Promise<void>): void {
    if (this.run !== run) return
    this.run = undefined
    if (this.requested && !this.stopping) this.requestDrive()
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private arm(target: number): void {
    if (this.stopping) return
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.requestDrive()
    }, Math.max(0, target - Date.now()))
  }

  private waitForIdle(agent: Agent): void {
    if (this.idleWait !== undefined) return
    const wait = Promise.race([agent.whenIdle(), this.stop.promise])
    this.idleWait = wait
    const settled = (): void => {
      if (this.idleWait === wait) this.idleWait = undefined
      this.requestDrive()
    }
    void wait.then(settled, (error: unknown) => {
      if (!this.stopping && this.isLive(agent)) {
        this.ctx.logger.warn(`maoq daily refresh idle wait failed: ${renderThrown(error)}`)
      }
      settled()
    })
  }

  private isLive(agent: Agent): boolean {
    return this.owner === agent
      && this.ctx.agents.get(agent.id) === agent
      && this.ctx.agents.roots().includes(agent)
  }

  private armRetryOrNext(clock: ChinaClock, policy: DailyRefreshPolicy, start: number): void {
    const retryAt = Date.now() + policy.retryMinutes * 60_000
    const windowEnd = localEpoch(clock, 0, start + policy.windowMinutes)
    this.arm(retryAt <= windowEnd ? retryAt : nextWeekdayStart(clock, start))
  }

  private warnOnce(clock: ChinaClock, error: unknown): void {
    const warning = `${clock.tradingDate}:${renderThrown(error)}`
    if (warning === this.lastWarning) return
    this.lastWarning = warning
    this.ctx.logger.warn(`maoq daily refresh deferred: ${renderThrown(error)}`)
  }

  private async driveOnce(): Promise<void> {
    const policy = this.options.policy()
    if (!policy.enabled) return
    const agent = this.owner
    if (agent === undefined || !this.isLive(agent)) return
    const start = parseTime(policy.time)
    const now = Date.now()
    const clock = chinaClock(now)
    if (!isWeekday(clock)) {
      this.arm(nextWeekdayStart(clock, start))
      return
    }
    if (clock.minutes < start) {
      this.arm(localEpoch(clock, 0, start))
      return
    }
    const windowEnd = start + policy.windowMinutes
    const afterWindow = clock.minutes > windowEnd
    if (afterWindow && this.afterWindowAttemptDate === clock.tradingDate) {
      this.arm(nextWeekdayStart(clock, start))
      return
    }

    let selection: DailyRefreshSelection<T>
    try {
      selection = await this.options.select()
    } catch (error: unknown) {
      this.warnOnce(clock, error)
      if (afterWindow) {
        this.afterWindowAttemptDate = clock.tradingDate
        this.arm(nextWeekdayStart(clock, start))
      }
      else this.armRetryOrNext(clock, policy, start)
      return
    }
    if (selection.tradingDate !== clock.tradingDate || selection.snapshotHash === this.completedSnapshotHash) {
      if (afterWindow) {
        this.afterWindowAttemptDate = clock.tradingDate
        this.arm(nextWeekdayStart(clock, start))
      }
      else this.armRetryOrNext(clock, policy, start)
      return
    }
    if (agent.status !== 'idle') {
      this.waitForIdle(agent)
      return
    }

    const abort = new AbortController()
    this.activeAbort = abort
    try {
      await this.ctx.agents.withInitiator(agent, () => agent.runMaintenance(async (maintenanceSignal) => {
        const signal = AbortSignal.any([abort.signal, maintenanceSignal])
        await this.options.refresh(agent, signal, selection)
      }))
      if (this.isLive(agent)) {
        this.completedSnapshotHash = selection.snapshotHash
        this.lastWarning = undefined
      }
    } catch (error: unknown) {
      if (!this.stopping && this.isLive(agent)) this.warnOnce(clock, error)
    } finally {
      if (this.activeAbort === abort) this.activeAbort = undefined
    }
    if (!this.stopping && this.isLive(agent)) {
      if (afterWindow) {
        this.afterWindowAttemptDate = clock.tradingDate
        this.arm(nextWeekdayStart(clock, start))
      }
      else this.armRetryOrNext(clock, policy, start)
    }
  }
}
