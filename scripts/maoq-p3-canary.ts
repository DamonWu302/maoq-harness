import {
  LongShortStockTacticHistoryAdapter,
  createReadOnlyMysqlQuery,
} from '@deepseek-ai/dsh-market-snapshot-mysql'
import {
  DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS,
  evaluateDynamicTacticReplay,
  evaluateResearchTacticHistory,
  evaluateResearchTacticSuiteHistory,
  type ResearchTacticHistoryEvaluation,
  type ResearchTacticSuiteHistoryEvaluation,
  type ResearchTacticId,
  type TacticLabHistoryChunk,
} from '@deepseek-ai/dsh-market-tactic-lab'
import { pathToFileURL } from 'node:url'

const TACTIC_IDS = Object.freeze(Object.keys(DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS) as ResearchTacticId[])

export interface P3CanaryOptions {
  readonly mode: 'probe' | 'evaluate' | 'evaluate-suite' | 'evaluate-dynamic'
  readonly tacticId: ResearchTacticId
  readonly startDate: string
  readonly endDate: string
  readonly minimumStocks: number
  readonly chunkSessions: number
  readonly host: string
  readonly port: number
  readonly socketPath?: string
  readonly user: string
  readonly database: string
  readonly connectTimeoutMs: number
  readonly queryTimeoutMs: number
  readonly attemptedTrials: number
}

function argument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]?.trim()
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new TypeError(`${name} must be followed by a value`)
  }
  return value
}

function integerArgument(args: readonly string[], name: string, fallback: number, maximum: number): number {
  const raw = argument(args, name)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${name} must be an integer from 1 through ${String(maximum)}`)
  }
  return value
}

function dateArgument(args: readonly string[], name: string): string {
  const value = argument(args, name)
  const milliseconds = value === undefined ? Number.NaN : Date.parse(`${value}T00:00:00Z`)
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || !Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${name} must be provided as an ISO calendar date`)
  }
  return value
}

/**
 * Parse a reproducible P3 production canary invocation.
 * @param args - Command-line arguments excluding the node and script paths.
 * @param environment - Deployment-owned database endpoint defaults.
 * @returns Validated probe or single-tactic evaluation options.
 */
export function parseP3CanaryOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): P3CanaryOptions {
  const mode = argument(args, '--mode') ?? 'probe'
  if (mode !== 'probe' && mode !== 'evaluate' && mode !== 'evaluate-suite' && mode !== 'evaluate-dynamic') {
    throw new TypeError('--mode must be probe, evaluate, evaluate-suite, or evaluate-dynamic')
  }
  const tacticId = argument(args, '--tactic') ?? 'industry_relative_exhaustion_repair'
  if (!TACTIC_IDS.includes(tacticId as ResearchTacticId)) throw new TypeError(`--tactic must be one of ${TACTIC_IDS.join(', ')}`)
  const startDate = dateArgument(args, '--start')
  const endDate = dateArgument(args, '--end')
  if (startDate > endDate) throw new TypeError('--start must not exceed --end')
  const socketPath = argument(args, '--socket-path') ?? environment.MAOQ_MYSQL_SOCKET
  const attemptedTrials = integerArgument(args, '--attempted-trials', TACTIC_IDS.length, 10_000)
  if ((mode === 'evaluate-suite' || mode === 'evaluate-dynamic') && attemptedTrials < TACTIC_IDS.length) {
    throw new TypeError(`--attempted-trials must be at least ${String(TACTIC_IDS.length)} for suite evaluation`)
  }
  return {
    mode,
    tacticId: tacticId as ResearchTacticId,
    startDate,
    endDate,
    minimumStocks: integerArgument(args, '--minimum-stocks', 3_000, 20_000),
    chunkSessions: integerArgument(args, '--chunk-sessions', mode === 'probe' ? 1 : 10, 60),
    host: argument(args, '--host') ?? environment.MAOQ_MYSQL_HOST ?? '127.0.0.1',
    port: integerArgument(args, '--port', Number(environment.MAOQ_MYSQL_PORT ?? 3_306), 65_535),
    ...socketPath === undefined ? {} : { socketPath },
    user: argument(args, '--user') ?? environment.MAOQ_MYSQL_USER ?? 'root',
    database: argument(args, '--database') ?? environment.MAOQ_MYSQL_DATABASE ?? 'long_short_stock',
    connectTimeoutMs: integerArgument(args, '--connect-timeout-ms', 5_000, 60_000),
    queryTimeoutMs: integerArgument(args, '--query-timeout-ms', 60_000, 300_000),
    attemptedTrials,
  }
}

function probeReport(chunk: TacticLabHistoryChunk): object {
  const first = chunk.featureSessions[0]
  const execution = chunk.executionSessions[0]
  if (first === undefined || execution === undefined) throw new Error('probe returned an empty history chunk')
  return {
    status: 'passed',
    mode: 'probe',
    adapter: 'long-short-stock-history-mysql',
    tradingDate: first.identity.tradingDate,
    featureStocks: first.stocks.length,
    executionBars: execution.bars.length,
    sectors: first.sectors.length,
    historyChunkHash: chunk.contentHash,
    featureSnapshotHash: first.identity.contentHash,
    executionSessionHash: execution.contentHash,
  }
}

function evaluationReport(result: ResearchTacticHistoryEvaluation): object {
  return {
    status: 'passed',
    mode: 'evaluate',
    adapter: result.historyAdapter,
    tacticId: result.config.tacticId,
    sessions: result.equityCurve.length,
    historyChunkHashes: result.historyChunkHashes,
    sourceExecutionHashes: result.sourceExecutionHashes,
    metrics: result.metrics,
    doubledCostMetrics: result.doubledCostMetrics,
    promotionDecision: result.promotionDecision,
    promotionBlockers: result.promotionBlockers,
  }
}

function suiteEvaluationReport(result: ResearchTacticSuiteHistoryEvaluation): object {
  return {
    status: 'passed',
    mode: 'evaluate-suite',
    adapter: result.historyAdapter,
    sessions: result.sourceExecutionHashes.length,
    historyChunkHashes: result.historyChunkHashes,
    sourceExecutionHashes: result.sourceExecutionHashes,
    tactics: Object.fromEntries(Object.entries(result.evaluations).map(([tacticId, evaluation]) => [tacticId, {
      metrics: evaluation.metrics,
      doubledCostMetrics: evaluation.doubledCostMetrics,
      promotionDecision: evaluation.promotionDecision,
      preliminaryBlockers: evaluation.promotionBlockers,
      promotionStatistics: result.promotionAudit.tactics[tacticId as ResearchTacticId],
    }])),
    backtestOverfitting: result.promotionAudit.backtestOverfitting,
    attemptedTrials: result.promotionAudit.attemptedTrials,
  }
}

function dynamicEvaluationReport(result: ResearchTacticSuiteHistoryEvaluation): object {
  const replay = evaluateDynamicTacticReplay(result)
  const routeSelections = Object.fromEntries([...new Set(replay.days.map(day => day.deterministicTacticId))]
    .sort()
    .map(tacticId => [tacticId, replay.days.filter(day => day.deterministicTacticId === tacticId).length]))
  const rejectionReasons = replay.routes.flatMap(route => route.rejected.flatMap(item => item.reasons))
  const rejectionCounts = Object.fromEntries([...new Set(rejectionReasons)].sort()
    .map(reason => [reason, rejectionReasons.filter(item => item === reason).length]))
  return {
    status: 'passed',
    mode: 'evaluate-dynamic',
    adapter: result.historyAdapter,
    sessions: replay.sessions,
    historyChunkHashes: result.historyChunkHashes,
    replayVersion: replay.replayVersion,
    switchingCostBps: replay.switchingCostBps,
    routableSessions: replay.routableSessions,
    unroutableSessions: replay.unroutableSessions,
    commanderDecisions: replay.commanderDecisions,
    commanderCoverage: replay.commanderCoverage,
    routeSelections,
    rejectionCounts,
    tracks: replay.tracks,
    benchmarks: replay.benchmarks,
    recentRoutes: replay.days.slice(-10),
    limitations: [
      'Historical strategic state reconstructs breadth and emotion from quality-gated daily facts and has no historical news catalyst; performance attribution uses separately sourced real index returns plus the labeled equal-weight universe benchmark.',
      'Matured observations are overlapping forward sleeves of each fixed tactic; they are not independent trades.',
      'No model-assisted result is imputed when a recorded commander decision is absent; commander tracks remain defensive on uncovered routes.',
    ],
  }
}

/**
 * Run a fail-fast production history probe or one fixed research evaluation.
 * @param options - Validated endpoint, range, tactic, and latency bounds.
 * @param password - Optional process-only database password; never returned.
 * @returns Compact immutable identities and, for evaluation mode, research statistics.
 */
export async function runP3Canary(options: P3CanaryOptions, password?: string): Promise<object> {
  const query = createReadOnlyMysqlQuery(options, () => Promise.resolve(password))
  const adapter = new LongShortStockTacticHistoryAdapter(query)
  const request = {
    startDate: options.startDate,
    endDate: options.endDate,
    minimumStocks: options.minimumStocks,
    chunkSessions: options.chunkSessions,
  }
  if (options.mode === 'probe') {
    for await (const chunk of adapter.load(request)) return probeReport(chunk)
    throw new Error('probe returned no history chunks')
  }
  if (options.mode === 'evaluate-suite' || options.mode === 'evaluate-dynamic') {
    const result = await evaluateResearchTacticSuiteHistory(
      adapter,
      request,
      Object.values(DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS),
      options.attemptedTrials,
    )
    return options.mode === 'evaluate-dynamic' ? dynamicEvaluationReport(result) : suiteEvaluationReport(result)
  }
  const result = await evaluateResearchTacticHistory(
    adapter,
    request,
    DEFAULT_RESEARCH_TACTIC_BACKTEST_CONFIGS[options.tacticId],
  )
  return evaluationReport(result)
}

async function main(): Promise<void> {
  const options = parseP3CanaryOptions(process.argv.slice(2))
  const started = Date.now()
  try {
    const report = await runP3Canary(options, process.env.MAOQ_MYSQL_PASSWORD)
    process.stdout.write(`${JSON.stringify({ ...report, elapsedMs: Date.now() - started }, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      mode: options.mode,
      tacticId: options.tacticId,
      startDate: options.startDate,
      endDate: options.endDate,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2)}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
