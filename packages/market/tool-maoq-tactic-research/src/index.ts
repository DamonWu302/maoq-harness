/** Bounded model tools for MAOQ tactic-history discovery and deterministic research evaluation. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS,
  evaluateResearchTacticHistory,
  PUBLIC_TACTIC_EVIDENCE,
  RESEARCH_TACTIC_VERSIONS,
  type ResearchTacticHistoryEvaluation,
  type ResearchTacticId,
  type TacticLabHistoryAdapter,
} from '@deepseek-ai/dsh-market-tactic-lab'
import { defineTool, type ToolCallView, type ToolResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Cordis plugin name. */
export const name = 'tool-maoq-tactic-research'
/** Required registries for model tools, history providers, and prompt guidance. */
export const inject = ['tools', 'marketTacticHistory', 'systemPrompt']

/** Fixed P3 tactic ids accepted by the research evaluator. */
export const RESEARCH_TACTIC_IDS = [
  'regime_signed_breakout_pullback',
  'openable_emotion_leader',
  'industry_relative_exhaustion_repair',
] as const satisfies readonly ResearchTacticId[]

/** Model guidance that prevents history evaluation from becoming live-trading authority. */
export const MAOQ_TACTIC_RESEARCH_PROMPT_TEXT =
  'Use maoq_tactic_research_sources before a historical evaluation when the source or tactic is unknown. Run maoq_tactic_backtest for one fixed tactic and the smallest sufficient date range; do not run all tactics by habit because each call scans quality-gated daily history. Treat every result as research evidence, preserve source hashes and promotion blockers, and never infer live-trading approval from Sharpe alone.'

/** Deployment-owned quality, range, and timeout limits. */
export interface Config {
  /** History providers the model may invoke. */
  allowedAdapters?: string[]
  /** Required stock-count floor for every requested trading session. */
  minimumStocks?: number
  /** Number of sessions read in each bounded provider chunk. */
  chunkSessions?: number
  /** Largest inclusive calendar range accepted from the model. */
  maxRangeDays?: number
  /** Tool pipeline timeout for one historical evaluation. */
  evaluationTimeoutMs?: number
  /** Number of latest non-empty signal dates returned to the model. */
  recentSignalLimit?: number
}

/** Loader schema for tactic-history research limits. */
export const Config: z<Config> = z.object({
  allowedAdapters: z.array(z.string()).default(['long-short-stock-history-mysql']),
  minimumStocks: z.number().step(1).min(1).default(3000),
  chunkSessions: z.number().step(1).min(1).max(60).default(30),
  maxRangeDays: z.number().step(1).min(2).max(3653).default(1827),
  evaluationTimeoutMs: z.number().step(1).min(1000).max(3_600_000).default(900_000),
  recentSignalLimit: z.number().step(1).min(1).max(30).default(10),
})

interface ResolvedConfig {
  readonly allowedAdapters: readonly string[]
  readonly minimumStocks: number
  readonly chunkSessions: number
  readonly maxRangeDays: number
  readonly evaluationTimeoutMs: number
  readonly recentSignalLimit: number
}

const DATE = /^\d{4}-\d{2}-\d{2}$/u

function assertPositiveInteger(value: number, field: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${field} must be an integer from 1 through ${String(maximum)}`)
  }
}

function resolveConfig(config: Config): ResolvedConfig {
  const resolved: ResolvedConfig = {
    allowedAdapters: config.allowedAdapters ?? ['long-short-stock-history-mysql'],
    minimumStocks: config.minimumStocks ?? 3000,
    chunkSessions: config.chunkSessions ?? 30,
    maxRangeDays: config.maxRangeDays ?? 1827,
    evaluationTimeoutMs: config.evaluationTimeoutMs ?? 900_000,
    recentSignalLimit: config.recentSignalLimit ?? 10,
  }
  if (resolved.allowedAdapters.length === 0 || new Set(resolved.allowedAdapters).size !== resolved.allowedAdapters.length
    || resolved.allowedAdapters.some(adapter => !/^[a-z][a-z0-9-]*$/u.test(adapter))) {
    throw new TypeError('allowedAdapters must contain unique lowercase-hyphenated names')
  }
  assertPositiveInteger(resolved.minimumStocks, 'minimumStocks', Number.MAX_SAFE_INTEGER)
  assertPositiveInteger(resolved.chunkSessions, 'chunkSessions', 60)
  assertPositiveInteger(resolved.maxRangeDays, 'maxRangeDays', 3653)
  assertPositiveInteger(resolved.evaluationTimeoutMs, 'evaluationTimeoutMs', 3_600_000)
  assertPositiveInteger(resolved.recentSignalLimit, 'recentSignalLimit', 30)
  return resolved
}

function dateMilliseconds(value: string, field: string): number {
  const milliseconds = DATE.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be an ISO calendar date`)
  }
  return milliseconds
}

function assertRange(startDate: string, endDate: string, maximumDays: number): void {
  const start = dateMilliseconds(startDate, 'startDate')
  const end = dateMilliseconds(endDate, 'endDate')
  if (start > end) throw new Error('startDate must not exceed endDate')
  const days = Math.floor((end - start) / 86_400_000) + 1
  if (days > maximumDays) throw new Error(`history range exceeds the ${String(maximumDays)}-day deployment limit`)
}

function render(value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function presentCall(title: string): ToolCallView {
  return { card: 'generic', title }
}

function presentResult(): ToolResultView {
  return { card: 'generic' }
}

function allowAdapter(config: ResolvedConfig, adapterName: string): void {
  if (!config.allowedAdapters.includes(adapterName)) {
    throw new Error(`tactic history adapter ${JSON.stringify(adapterName)} is not allowed for model-triggered evaluation`)
  }
}

function abortableAdapter(adapter: TacticLabHistoryAdapter, signal: AbortSignal): TacticLabHistoryAdapter {
  return {
    name: adapter.name,
    async *load(request) {
      signal.throwIfAborted()
      for await (const chunk of adapter.load(request)) {
        signal.throwIfAborted()
        yield chunk
      }
    },
  }
}

function summarize(result: ResearchTacticHistoryEvaluation, recentSignalLimit: number): JsonValue {
  const nonEmptySignals = result.signals.filter(signal => signal.candidates.length > 0)
  return {
    source: {
      adapterName: result.historyAdapter,
      historyChunkHashes: result.historyChunkHashes,
      executionSessionCount: result.sourceExecutionHashes.length,
    },
    trial: {
      engineVersion: result.engineVersion,
      tacticId: result.config.tacticId,
      tacticVersion: RESEARCH_TACTIC_VERSIONS[result.config.tacticId],
      config: result.config,
      executionPolicy: result.policy,
    },
    counts: {
      sessions: result.equityCurve.length,
      gatePassedSessions: result.signals.filter(signal => signal.gatePassed).length,
      candidateSignalSessions: nonEmptySignals.length,
      candidateSignals: nonEmptySignals.reduce((sum, signal) => sum + signal.candidates.length, 0),
      submittedOrders: result.orders.length,
      fills: result.execution.fills.length,
      rejections: result.execution.rejections.length,
    },
    metrics: result.metrics,
    doubledCostMetrics: result.doubledCostMetrics,
    folds: result.folds,
    recentSignals: nonEmptySignals.slice(-recentSignalLimit).map(signal => ({
      tradingDate: signal.tradingDate,
      marketBreadth1: signal.marketBreadth1,
      marketBreadth20: signal.marketBreadth20,
      currentLimitUpRatio: signal.currentLimitUpRatio,
      candidates: signal.candidates,
    })),
    promotion: {
      decision: result.promotionDecision,
      blockers: result.promotionBlockers,
    },
  } as unknown as JsonValue
}

/** Register bounded tactic-history source discovery and single-trial evaluation tools. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.systemPrompt.section({
    name: 'tool:maoq-tactic-research',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: MAOQ_TACTIC_RESEARCH_PROMPT_TEXT,
  })

  ctx.tools.register(defineTool({
    name: 'maoq_tactic_research_sources',
    description: 'List fixed MAOQ research tactics and registered quality-gated daily-history sources. This tool performs no database scan.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { sources: { type: 'json', required: true }, tactics: { type: 'json', required: true } },
      },
      render: (_args, value) => render(value),
    },
    execute: () => Promise.resolve({
      sources: ctx.marketTacticHistory.listAdapters().map(adapterName => ({
        adapterName,
        evaluationAllowed: resolved.allowedAdapters.includes(adapterName),
        minimumStocks: resolved.minimumStocks,
        chunkSessions: resolved.chunkSessions,
      })),
      tactics: RESEARCH_TACTIC_IDS.map(tacticId => ({
        tacticId,
        tacticVersion: RESEARCH_TACTIC_VERSIONS[tacticId],
        backtestConfig: DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS[tacticId],
        publicEvidence: PUBLIC_TACTIC_EVIDENCE.filter(item => item.tacticId === tacticId),
      })) as unknown as JsonValue,
    }),
    presentCall: () => presentCall('MAOQ tactic research sources'),
    presentResult,
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_tactic_backtest',
    description: 'Run one fixed MAOQ tactic through quality-gated daily history, next-open A-share execution, chronological folds, and doubled-cost stress. Returns research evidence and never live-trading approval.',
    parameters: {
      adapterName: { type: 'string', required: true, description: 'Registered and deployment-allowed daily-history source.' },
      tacticId: { type: 'string', required: true, enum: [...RESEARCH_TACTIC_IDS], description: 'One fixed versioned research tactic.' },
      startDate: { type: 'string', required: true, description: 'Inclusive history start in YYYY-MM-DD form.' },
      endDate: { type: 'string', required: true, description: 'Inclusive history end in YYYY-MM-DD form.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { report: { type: 'json', required: true } },
      },
      render: (_args, value) => render(value),
    },
    timeoutMs: resolved.evaluationTimeoutMs,
    async execute(args, exec) {
      allowAdapter(resolved, args.adapterName)
      assertRange(args.startDate, args.endDate, resolved.maxRangeDays)
      const adapter = abortableAdapter(ctx.marketTacticHistory.getAdapter(args.adapterName), exec.signal)
      const result = await evaluateResearchTacticHistory(adapter, {
        startDate: args.startDate,
        endDate: args.endDate,
        chunkSessions: resolved.chunkSessions,
        minimumStocks: resolved.minimumStocks,
      }, DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS[args.tacticId])
      exec.signal.throwIfAborted()
      return { report: summarize(result, resolved.recentSignalLimit) }
    },
    presentCall: () => presentCall('Run MAOQ tactic backtest'),
    presentResult,
  }))
}
