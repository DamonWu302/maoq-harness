import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { contentHash, type MarketSnapshot } from '@deepseek-ai/dsh-market-snapshot'
import {
  buildStrategicStateRecord,
  computeStrategicFeatures,
  MAO_METHOD_CATALOG,
  resolveMaoMethodApplication,
  STRATEGIC_ENGINE_VERSION,
  type MaoMethodApplication,
  type MaoMethodId,
  type StrategicFeatureRecord,
  type StrategicInterpretationDraft,
} from '@deepseek-ai/dsh-market-strategic-state'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { WorkflowRun } from '@deepseek-ai/dsh-workflow'
import { requireFreshProvider, type MaoqAnalysisMode, type ResolvedConfig, workflowError } from './index.ts'
import {
  StrategicDecisionStore,
  STRATEGIC_WORKFLOW_VERSION,
  type StrategicDecisionInput,
  type StrategicDecisionResult,
} from './strategic-store.ts'

const STRATEGIC_SPECIALISTS = [
  'market_regime',
  'emotion_cycle',
  'policy_macro',
  'sector_battlefield',
  'tactic_selection',
] as const

type StrategicSpecialist = typeof STRATEGIC_SPECIALISTS[number]

export const MAOQ_DAILY_STATE_OBJECTIVE = 'Determine the daily A-share strategic state: principal contradiction, emotion cycle, least-resistance sector battlefield, counter-evidence, transition conditions, and risk-vetoed posture.'
export const MAOQ_DAILY_STATE_SPECIALISTS = ['market_regime', 'emotion_cycle', 'sector_battlefield'] as const satisfies readonly StrategicSpecialist[]

interface StrategicCallArgs {
  readonly objective: string
  readonly snapshotHash: string
  readonly historySnapshotHashes: string[]
  readonly decisionTime: string
  readonly maximumAgeHours: number
  readonly specialists: StrategicSpecialist[]
}

interface StrategicWorkflowValue {
  readonly reports: JsonValue[]
  readonly decision: StrategicInterpretationDraft & {
    readonly marketRegime: string
    readonly emotionCycle: string
    readonly selectedSpecialists: StrategicSpecialist[]
  }
  readonly risk: JsonValue
  readonly tokenUsage: JsonValue
}

interface StrategicToolResult extends StrategicDecisionResult {
  readonly decisionId: string
  readonly createdAt: string
  readonly cacheHit: boolean
}

const STRATEGIC_OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    runId: { type: 'string' as const, required: true },
    decisionId: { type: 'string' as const, required: true },
    createdAt: { type: 'string' as const, required: true },
    cacheHit: { type: 'boolean' as const, required: true },
    agentsStarted: { type: 'integer' as const, required: true },
    analysisMode: { type: 'string' as const, required: true, enum: ['quick', 'deep'] as const },
    status: { type: 'string' as const, required: true, enum: ['approved', 'vetoed'] as const },
    actionable: { type: 'boolean' as const, required: true },
    features: { type: 'json' as const, required: true },
    reports: { type: 'json' as const, required: true },
    interpretation: { type: 'json' as const, required: true },
    risk: { type: 'json' as const, required: true },
    tokenUsage: { type: 'json' as const, required: true },
  },
} as const

const METHOD_IDS = Object.keys(MAO_METHOD_CATALOG) as MaoMethodId[]

const STRATEGIC_SCRIPT = String.raw`
const methodIds = ${JSON.stringify(METHOD_IDS)}
const evidenceRefs = args.features.evidence.map(item => item.ref)
const evidenceRefSchema = { type: 'string', enum: evidenceRefs }
const methodSchema = {
  type: 'object',
  properties: {
    methodId: { type: 'string', enum: methodIds },
    application: { type: 'string' },
    evidenceRefs: { type: 'array', items: evidenceRefSchema },
    limitation: { type: 'string' },
  },
  required: ['methodId', 'application', 'evidenceRefs', 'limitation'],
  additionalProperties: false,
}
const reportSchema = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ${JSON.stringify(STRATEGIC_SPECIALISTS)} },
    conclusion: { type: 'string' },
    supportingEvidenceRefs: { type: 'array', items: evidenceRefSchema },
    counterEvidenceRefs: { type: 'array', items: evidenceRefSchema },
    transitionConditions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    maoMethodApplications: { type: 'array', items: methodSchema },
  },
  required: ['role', 'conclusion', 'supportingEvidenceRefs', 'counterEvidenceRefs', 'transitionConditions', 'confidence', 'maoMethodApplications'],
  additionalProperties: false,
}
const decisionSchema = {
  type: 'object',
  properties: {
    marketRegime: { type: 'string', enum: ['risk_on_trend', 'rotation', 'high_volatility_divergence', 'risk_contraction', 'repair', 'unavailable'] },
    emotionCycle: { type: 'string', enum: ['startup', 'acceleration', 'climax', 'divergence', 'ebb', 'repair', 'unavailable'] },
    principalContradiction: { type: 'string' },
    leastResistanceBattlefield: { type: 'string' },
    supportingEvidenceRefs: { type: 'array', items: evidenceRefSchema },
    counterEvidenceRefs: { type: 'array', items: evidenceRefSchema },
    transitionConditions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    eligiblePosture: { type: 'string', enum: ['no_trade', 'risk_off', 'watch', 'probe', 'paper_position'] },
    maoMethodApplications: { type: 'array', items: methodSchema },
    selectedSpecialists: { type: 'array', items: { type: 'string' } },
  },
  required: ['marketRegime', 'emotionCycle', 'principalContradiction', 'leastResistanceBattlefield', 'supportingEvidenceRefs', 'counterEvidenceRefs', 'transitionConditions', 'confidence', 'eligiblePosture', 'maoMethodApplications', 'selectedSpecialists'],
  additionalProperties: false,
}
const riskSchema = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    verdict: { type: 'string', enum: ['approve', 'veto'] },
    reasons: { type: 'array', items: { type: 'string' } },
    evidenceRefs: { type: 'array', items: evidenceRefSchema },
    hardLimits: { type: 'array', items: { type: 'string' } },
  },
  required: ['approved', 'verdict', 'reasons', 'evidenceRefs', 'hardLimits'],
  additionalProperties: false,
}

if (args.analysisMode === 'deep') phase('Strategic specialist research')
const reportRuns = args.analysisMode === 'deep' ? await Promise.all(args.specialists.map(async role => {
  const result = await agent([
    'You are the MAOQ ' + role + ' strategic specialist. Analyze only your assigned domain.',
    'Use only the deterministic feature record below. Every supporting and counter claim must cite an exact ref from its evidence array.',
    'Select Mao method IDs only from the supplied host catalog. Explain the application and limitation; do not invent quotations.',
    'Decision objective: ' + args.objective,
    'Deterministic feature record: ' + JSON.stringify(args.features),
    'Host Mao method catalog: ' + JSON.stringify(args.maoMethods),
    'The role field must be exactly: ' + role,
  ].join('\n\n'), {
    label: role,
    phase: 'Strategic specialist research',
    schema: reportSchema,
    includeUsage: true,
  })
  const report = result === null ? null : result.value
  if (report === null || report.role !== role) throw new Error('strategic specialist ' + role + ' failed to return its structured report')
  return { report, usage: { label: role, phase: 'Strategic specialist research', usage: result.usage } }
})) : []
const reports = reportRuns.map(run => run.report)

phase(args.analysisMode === 'deep' ? 'Strategic synthesis' : 'Quick strategic synthesis')
const decisionResult = await agent([
  'You are the MAOQ commander. Interpret but never rewrite the deterministic feature record.',
  args.analysisMode === 'quick'
    ? 'This is a quick analysis. Apply the selected specialist roles as analytical lenses yourself; no specialist reports were run.'
    : 'This is a deep analysis. Reconcile the independently produced specialist reports.',
  'Identify the principal contradiction and least-resistance sector battlefield. Do not rank stocks or propose live orders.',
  'Every claim must cite exact feature evidence refs. Include supporting evidence, counter-evidence, confidence, and falsifiable transition conditions.',
  'Explain which allowlisted Mao methods support the reasoning, how each applies here, and its limitation. Do not invent quotations.',
  'If any deterministic component is unavailable, eligiblePosture must be no_trade.',
  'marketRegime and emotionCycle must exactly preserve the deterministic labels. selectedSpecialists must exactly equal: ' + JSON.stringify(args.specialists),
  'Decision objective: ' + args.objective,
  'Deterministic feature record: ' + JSON.stringify(args.features),
  'Specialist reports: ' + JSON.stringify(reports),
  'Host Mao method catalog: ' + JSON.stringify(args.maoMethods),
].join('\n\n'), {
  label: 'MAOQ strategic synthesis',
  phase: 'Strategic synthesis',
  schema: decisionSchema,
  includeUsage: true,
})
const decision = decisionResult === null ? null : decisionResult.value
if (decision === null || JSON.stringify(decision.selectedSpecialists) !== JSON.stringify(args.specialists)) throw new Error('commander failed to preserve selected specialists')

phase('Independent strategic risk review')
const riskResult = await agent([
  'You are the independent MAOQ risk reviewer. You did not author the strategic interpretation and may veto it.',
  'Veto unknown evidence, rewritten deterministic labels, uncited claims, missing counter-evidence, or an actionable posture from incomplete facts.',
  'A veto is final. This phase cannot rank stocks or authorize a live order.',
  'Feature record: ' + JSON.stringify(args.features),
  'Decision: ' + JSON.stringify(decision),
  'Reports: ' + JSON.stringify(reports),
].join('\n\n'), {
  label: 'Independent strategic risk review',
  phase: 'Independent strategic risk review',
  schema: riskSchema,
  includeUsage: true,
})
const risk = riskResult === null ? null : riskResult.value
if (risk === null || risk.approved !== (risk.verdict === 'approve')) throw new Error('risk reviewer returned an inconsistent verdict')

const usageCalls = reportRuns.map(run => run.usage).concat([
  { label: 'MAOQ strategic synthesis', phase: 'Strategic synthesis', usage: decisionResult.usage },
  { label: 'Independent strategic risk review', phase: 'Independent strategic risk review', usage: riskResult.usage },
])
const tokenFields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']
const usageTotal = {}
for (const field of tokenFields) usageTotal[field] = usageCalls.reduce((sum, call) => sum + (call.usage === null ? 0 : (call.usage[field] || 0)), 0)
return { reports, decision, risk, tokenUsage: { calls: usageCalls, total: usageTotal, unavailableCalls: usageCalls.filter(call => call.usage === null).length } }
`

const STRATEGIC_META = {
  name: 'maoq-strategic-state',
  description: 'Interpret deterministic market state, cite evidence and Mao methods, then require independent risk review.',
  phases: [
    { title: 'Strategic specialist research', detail: 'Selected specialists inspect only deterministic features.' },
    { title: 'Strategic synthesis', detail: 'The commander identifies the principal contradiction and least-resistance sector.' },
    { title: 'Independent strategic risk review', detail: 'A fresh reviewer can veto the interpretation.' },
  ],
}

const QUICK_STRATEGIC_META = {
  name: 'maoq-strategic-state-quick',
  description: 'Run one evidence-bound strategic synthesis, then require an independent risk review.',
  phases: [
    { title: 'Quick strategic synthesis', detail: 'The commander applies the selected analytical lenses directly.' },
    { title: 'Independent strategic risk review', detail: 'A fresh reviewer can veto the interpretation.' },
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameStrings(value: unknown, expected: readonly string[]): value is string[] {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index])
}

function applications(value: unknown, evidence: ReadonlySet<string>, field: string): MaoMethodApplication[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must contain Mao method applications`)
  return value.map((item, index) => {
    if (!isRecord(item) || !METHOD_IDS.includes(item['methodId'] as MaoMethodId)
      || typeof item['application'] !== 'string' || typeof item['limitation'] !== 'string'
      || !Array.isArray(item['evidenceRefs']) || item['evidenceRefs'].length === 0
      || !item['evidenceRefs'].every(ref => typeof ref === 'string' && evidence.has(ref))) {
      throw new Error(`${field}[${String(index)}] has invalid attribution or evidence refs`)
    }
    return item as unknown as MaoMethodApplication
  })
}

function refs(value: unknown, evidence: ReadonlySet<string>, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(ref => typeof ref === 'string' && evidence.has(ref))) {
    throw new Error(`${field} must contain only known evidence refs`)
  }
  return value as string[]
}

function readWorkflowValue(
  value: unknown,
  specialists: readonly StrategicSpecialist[],
  features: StrategicFeatureRecord,
  analysisMode: MaoqAnalysisMode,
): StrategicWorkflowValue {
  if (!isRecord(value) || !Array.isArray(value['reports']) || !isRecord(value['decision']) || !isRecord(value['risk']) || !isRecord(value['tokenUsage'])) {
    throw new Error('MAOQ strategic workflow returned malformed fields')
  }
  const expectedReportCount = analysisMode === 'deep' ? specialists.length : 0
  if (value['reports'].length !== expectedReportCount || !sameStrings(value['decision']['selectedSpecialists'], specialists)) {
    throw new Error('MAOQ strategic workflow changed the selected specialists')
  }
  const expectedMarket = features.marketRegime.status === 'ready' ? features.marketRegime.value.label : 'unavailable'
  const expectedEmotion = features.emotionCycle.status === 'ready' ? features.emotionCycle.value.label : 'unavailable'
  if (value['decision']['marketRegime'] !== expectedMarket || value['decision']['emotionCycle'] !== expectedEmotion) {
    throw new Error('MAOQ strategic workflow rewrote deterministic labels')
  }
  const evidence = new Set(features.evidence.map(item => item.ref))
  const reportRoles = value['reports'].map(report => isRecord(report) ? report['role'] : undefined)
  if (analysisMode === 'deep' && !sameStrings(reportRoles, specialists)) {
    throw new Error('MAOQ strategic workflow returned reports for the wrong specialists')
  }
  for (const [index, report] of value['reports'].entries()) {
    const item = report as Record<string, unknown>
    refs(item['supportingEvidenceRefs'], evidence, `reports[${String(index)}].supportingEvidenceRefs`)
    refs(item['counterEvidenceRefs'], evidence, `reports[${String(index)}].counterEvidenceRefs`)
    applications(item['maoMethodApplications'], evidence, `reports[${String(index)}].maoMethodApplications`)
  }
  refs(value['decision']['supportingEvidenceRefs'], evidence, 'decision.supportingEvidenceRefs')
  refs(value['decision']['counterEvidenceRefs'], evidence, 'decision.counterEvidenceRefs')
  applications(value['decision']['maoMethodApplications'], evidence, 'decision.maoMethodApplications')
  refs(value['risk']['evidenceRefs'], evidence, 'risk.evidenceRefs')
  if (typeof value['risk']['approved'] !== 'boolean' || (value['risk']['verdict'] !== 'approve' && value['risk']['verdict'] !== 'veto')
    || value['risk']['approved'] !== (value['risk']['verdict'] === 'approve')) throw new Error('MAOQ strategic risk verdict is inconsistent')
  return value as unknown as StrategicWorkflowValue
}

function enrichReports(reports: readonly JsonValue[]): JsonValue[] {
  return reports.map((report) => {
    const item = report as Record<string, JsonValue>
    return {
      ...item,
      maoMethodApplications: (item['maoMethodApplications'] as unknown as MaoMethodApplication[]).map(resolveMaoMethodApplication),
    } as unknown as JsonValue
  })
}

function render(value: Record<string, unknown>, maxChars: number): string {
  const text = `MAOQ strategic state is ${value['status'] === 'approved' ? 'approved' : 'vetoed'} by independent risk review.\n${JSON.stringify(value, null, 2)}`
  if (text.length <= maxChars) return text
  const suffix = '\n… [truncated]'
  return maxChars <= suffix.length ? suffix.slice(0, maxChars) : `${text.slice(0, maxChars - suffix.length)}${suffix}`
}

function providerSettingsFingerprint(ctx: Context, providerName: string): string {
  const settings = ctx.get('settings')
  if (settings === undefined) return 'unavailable'
  const providerSettings = settings.describe().find(item => item.ns === `subagent-codex-${providerName}`)?.value
  return providerSettings === undefined ? 'unavailable' : contentHash(providerSettings)
}

async function executeStrategicAnalysis(
  ctx: Context,
  config: ResolvedConfig,
  args: StrategicCallArgs,
  exec: ToolRunContext,
  preloadedCurrent?: MarketSnapshot,
): Promise<StrategicToolResult> {
  if (exec.agent === undefined) throw new Error('MAOQ strategic tool requires a calling agent')
  if (args.objective.trim().length === 0) throw new Error('MAOQ strategic objective must be non-empty')
  if (args.specialists.length < 1
    || args.specialists.length > config.maxSpecialists
    || new Set(args.specialists).size !== args.specialists.length) {
    throw new Error('MAOQ strategic specialist selection is empty, duplicated, or exceeds the deployment limit')
  }
  const objective = args.objective.trim()
  const input: StrategicDecisionInput = {
    objective,
    snapshotHash: args.snapshotHash,
    historySnapshotHashes: [...args.historySnapshotHashes].sort(),
    decisionTime: args.decisionTime,
    maximumAgeHours: args.maximumAgeHours,
    specialists: [...args.specialists],
    analysisMode: config.analysisMode,
    subagentProvider: config.subagentProvider,
    providerSettingsFingerprint: providerSettingsFingerprint(ctx, config.subagentProvider),
    featureEngineVersion: STRATEGIC_ENGINE_VERSION,
    workflowVersion: STRATEGIC_WORKFLOW_VERSION,
  }
  const store = new StrategicDecisionStore(config.stateRoot)
  const cached = await store.getByInput(input)
  if (cached !== undefined) {
    return {
      ...cached.result,
      decisionId: cached.decisionId,
      createdAt: cached.createdAt,
      cacheHit: true,
      agentsStarted: 0,
    }
  }
  void requireFreshProvider(ctx, config.subagentProvider)
  const snapshots = ctx.get('marketSnapshots')
  if (snapshots === undefined) throw new Error('MAOQ strategic tool requires the marketSnapshots service')
  const current = preloadedCurrent ?? await snapshots.getByHash(args.snapshotHash)
  if (current === undefined) throw new Error(`MAOQ current market snapshot ${args.snapshotHash} was not found`)
  if (current.identity.contentHash !== args.snapshotHash) throw new Error('MAOQ preloaded current snapshot does not match the requested hash')
  const history = await Promise.all(args.historySnapshotHashes.map(hash => snapshots.getByHash(hash)))
  const missing = args.historySnapshotHashes.find((_hash, index) => history[index] === undefined)
  if (missing !== undefined) throw new Error(`MAOQ history market snapshot ${missing} was not found`)
  const features = computeStrategicFeatures(current, history as MarketSnapshot[])
  const run: WorkflowRun = ctx.workflowEngine.start({
    script: STRATEGIC_SCRIPT,
    meta: config.analysisMode === 'deep' ? STRATEGIC_META : QUICK_STRATEGIC_META,
    args: {
      analysisMode: config.analysisMode,
      objective,
      specialists: args.specialists,
      features,
      maoMethods: MAO_METHOD_CATALOG,
    },
    subagentProvider: config.subagentProvider,
    maxTotalAgents: config.analysisMode === 'deep' ? args.specialists.length + 2 : 2,
    parent: exec.agent,
    signal: exec.signal,
  })
  const onAbort = (): void => { run.cancel('parent step aborted') }
  exec.signal.addEventListener('abort', onAbort, { once: true })
  if (exec.signal.aborted) run.cancel('parent step aborted')
  try {
    const settled = await run.result
    const error = workflowError(settled)
    if (error !== undefined) throw new Error(error)
    const value = readWorkflowValue(settled.value, args.specialists, features, config.analysisMode)
    const { marketRegime: _market, emotionCycle: _emotion, selectedSpecialists: _selected, ...draft } = value.decision
    const state = buildStrategicStateRecord(features, draft, args.decisionTime, args.maximumAgeHours)
    const approved = (value.risk as Record<string, unknown>)['approved'] === true
    const result: StrategicDecisionResult = {
      runId: run.id,
      agentsStarted: settled.agentsStarted,
      analysisMode: config.analysisMode,
      status: approved ? 'approved' as const : 'vetoed' as const,
      actionable: approved && state.actionable,
      features: features as unknown as JsonValue,
      reports: enrichReports(value.reports),
      interpretation: state.interpretation as unknown as JsonValue,
      risk: value.risk,
      tokenUsage: value.tokenUsage,
    }
    const record = await store.put(input, result, features.tradingDate, features.cutoffTime)
    return {
      ...record.result,
      decisionId: record.decisionId,
      createdAt: record.createdAt,
      cacheHit: false,
    }
  } finally {
    exec.signal.removeEventListener('abort', onAbort)
    await run.dispose()
  }
}

async function dailyStrategicArgs(ctx: Context, config: ResolvedConfig): Promise<{
  readonly args: StrategicCallArgs
  readonly current: MarketSnapshot
}> {
  if (config.maxSpecialists < MAOQ_DAILY_STATE_SPECIALISTS.length) {
    throw new Error(`MAOQ daily state requires maxSpecialists >= ${String(MAOQ_DAILY_STATE_SPECIALISTS.length)}`)
  }
  const snapshots = ctx.get('marketSnapshots')
  if (snapshots === undefined) throw new Error('MAOQ daily state requires the marketSnapshots service')
  const summaries = await snapshots.listSummaries(config.maxSnapshotFiles)
  const dates = new Set<string>()
  const window = summaries.filter((summary) => {
    if (dates.has(summary.tradingDate)) return false
    dates.add(summary.tradingDate)
    return true
  }).slice(0, 3)
  if (window.length < 3) throw new Error('MAOQ daily state requires snapshots for at least three distinct trading dates')
  const currentSummary = window[0]
  if (currentSummary === undefined) throw new Error('MAOQ daily state did not select a current snapshot')
  const current = await snapshots.getByHash(currentSummary.contentHash)
  if (current === undefined) throw new Error(`MAOQ current market snapshot ${currentSummary.contentHash} was not found`)
  return {
    current,
    args: {
      objective: MAOQ_DAILY_STATE_OBJECTIVE,
      snapshotHash: current.identity.contentHash,
      historySnapshotHashes: window.slice(1).map(summary => summary.contentHash),
      decisionTime: current.identity.cutoffTime,
      maximumAgeHours: config.dailyStateMaximumAgeHours,
      specialists: [...MAOQ_DAILY_STATE_SPECIALISTS],
    },
  }
}

/**
 * Register the P2 evidence-bound strategic-state tool.
 * @param ctx - Active plugin context that owns tools, workflows, subagents, and optional snapshot service.
 * @param config - Validated shared MAOQ deployment limits.
 */
export function registerStrategicStateTool(ctx: Context, getConfig: () => ResolvedConfig): void {
  ctx.tools.register(defineTool({
    name: 'maoq_analyze_strategy',
    description: 'Compute deterministic market regime, emotion cycle, and sector battlefield features from immutable snapshots, then run evidence-bound interpretation and independent risk review. This tool cannot rank stocks or place orders.',
    parameters: {
      objective: { type: 'string', required: true, description: 'Concrete strategic question for this snapshot.' },
      snapshotHash: { type: 'string', required: true, description: 'Current immutable market snapshot SHA-256 hash.' },
      historySnapshotHashes: { type: 'array', required: true, items: { type: 'string' }, description: 'At least two prior snapshot hashes for sector persistence.' },
      decisionTime: { type: 'string', required: true, description: 'Explicit ISO timestamp for replayable staleness validation.' },
      maximumAgeHours: { type: 'number', required: true, description: 'Non-negative maximum feature age in hours.' },
      specialists: { type: 'array', required: true, items: { type: 'string', enum: STRATEGIC_SPECIALISTS }, description: 'Ordered smallest sufficient P2 specialist subset.' },
    },
    output: {
      schema: STRATEGIC_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: render(value as Record<string, unknown>, getConfig().maxResultChars) }],
    },
    async execute(args, exec) {
      return executeStrategicAnalysis(ctx, getConfig(), args, exec)
    },
    presentCall: (args: StrategicCallArgs): ToolCallView => ({ card: 'generic', title: 'MAOQ strategic state', rawInput: args.objective }),
    presentResult: (_args: StrategicCallArgs, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView => ({ card: 'generic' }),
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_state_refresh_daily',
    description: 'Generate or reuse the one canonical daily MAOQ strategic state. The host selects the newest three distinct trading-day snapshots and fixes the objective, specialist lenses, decision time, and age policy; the model cannot vary them. This tool cannot rank stocks or place orders.',
    parameters: {},
    output: {
      schema: STRATEGIC_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: render(value as Record<string, unknown>, getConfig().maxResultChars) }],
    },
    async execute(_args, exec) {
      const config = getConfig()
      const daily = await dailyStrategicArgs(ctx, config)
      return executeStrategicAnalysis(ctx, config, daily.args, exec, daily.current)
    },
    presentCall: (): ToolCallView => ({ card: 'generic', title: 'Refresh canonical MAOQ daily state' }),
    presentResult: (_args: unknown, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView => ({ card: 'generic' }),
  }))
}
