/**
 * Model-facing MAOQ council: commander-selected structured specialists,
 * structured synthesis, and an independent risk review.
 * @module @deepseek-ai/dsh-tool-maoq-decision
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { WorkflowResult, WorkflowRun } from '@deepseek-ai/dsh-workflow'
import type {} from '@deepseek-ai/dsh-settings'
import { registerStrategicStateQueryTools } from './strategic-query.ts'
import { registerStrategicStateTool } from './strategic.ts'

export const name = 'tool-maoq-decision'
export const inject = ['tools', 'workflowEngine', 'subagents', 'systemPrompt']

const SPECIALIST_ROLES = [
  'market_regime',
  'emotion_cycle',
  'policy_macro',
  'sector_battlefield',
  'tactic_selection',
  'stock_research',
] as const

type SpecialistRole = typeof SPECIALIST_ROLES[number]

/** Supported strategic-analysis execution depths. */
export const MAOQ_ANALYSIS_MODES = ['quick', 'deep'] as const
/** Strategic-analysis execution depth. */
export type MaoqAnalysisMode = typeof MAOQ_ANALYSIS_MODES[number]
/** User-settings namespace for MAOQ decision policy. */
export const MAOQ_DECISION_SETTINGS_NAMESPACE = 'maoq-decision'

/** Deployment policy for the MAOQ council. */
export interface Config {
  /** Fresh structured-output provider used for every specialist and reviewer (default `spawn`). */
  subagentProvider?: string
  /** Maximum specialists the commander may select for one decision (default 4). */
  maxSpecialists?: number
  /** Maximum characters in the rendered parent-facing result (default 32768). */
  maxResultChars?: number
  /** Strategic-analysis depth used by new calls (default `quick`). */
  analysisMode?: MaoqAnalysisMode
  /** Directory containing persisted strategic decision mirrors (default `.maoq/decisions`). */
  stateRoot?: string
  /** Maximum decision files a latest/history query may scan (default 500). */
  maxStateFiles?: number
}

/** Schemastery configuration for the MAOQ decision tool. */
export const Config: z<Config> = z.object({
  subagentProvider: z.string().default('spawn'),
  maxSpecialists: z.number().step(1).min(1).max(SPECIALIST_ROLES.length).default(4),
  maxResultChars: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(32_768),
  analysisMode: z.union([...MAOQ_ANALYSIS_MODES]).default('quick'),
  stateRoot: z.string().default('.maoq/decisions'),
  maxStateFiles: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(500),
})

/** Validated deployment values shared by both MAOQ tool registrations. */
export interface ResolvedConfig {
  readonly subagentProvider: string
  readonly maxSpecialists: number
  readonly maxResultChars: number
  readonly analysisMode: MaoqAnalysisMode
  readonly stateRoot: string
  readonly maxStateFiles: number
}

interface MaoqCallArgs {
  readonly objective: string
  readonly specialists: SpecialistRole[]
}

interface CouncilResult {
  readonly status: 'approved' | 'vetoed'
  readonly specialists: SpecialistRole[]
  readonly reports: JsonValue[]
  readonly decision: JsonValue
  readonly risk: JsonValue
  readonly tokenUsage: JsonValue
}

const COUNCIL_META = {
  name: 'maoq-decision-council',
  description: 'Run selected market specialists, synthesize one decision, and require independent risk review.',
  phases: [
    { title: 'Specialist research', detail: 'Only commander-selected specialists run in parallel.' },
    { title: 'Decision synthesis', detail: 'One fresh agent identifies the principal contradiction and action.' },
    { title: 'Independent risk review', detail: 'A separate fresh agent can veto the paper decision.' },
  ],
}

const COUNCIL_SCRIPT = String.raw`
const reportSchema = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ['market_regime', 'emotion_cycle', 'policy_macro', 'sector_battlefield', 'tactic_selection', 'stock_research'] },
    conclusion: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    counterEvidence: { type: 'array', items: { type: 'string' } },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: ['role', 'conclusion', 'evidence', 'counterEvidence', 'invalidationConditions', 'confidence'],
  additionalProperties: false,
}

const decisionSchema = {
  type: 'object',
  properties: {
    marketRegime: { type: 'string' },
    principalContradiction: { type: 'string' },
    battlefield: { type: 'string' },
    tactic: { type: 'string' },
    action: { type: 'string', enum: ['no_trade', 'watch', 'paper_trade'] },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          role: { type: 'string' },
          thesis: { type: 'string' },
        },
        required: ['symbol', 'role', 'thesis'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'number' },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
    selectedSpecialists: { type: 'array', items: { type: 'string' } },
  },
  required: ['marketRegime', 'principalContradiction', 'battlefield', 'tactic', 'action', 'candidates', 'confidence', 'invalidationConditions', 'selectedSpecialists'],
  additionalProperties: false,
}

const riskSchema = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    verdict: { type: 'string', enum: ['approve', 'veto'] },
    reasons: { type: 'array', items: { type: 'string' } },
    hardLimits: { type: 'array', items: { type: 'string' } },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
  },
  required: ['approved', 'verdict', 'reasons', 'hardLimits', 'invalidationConditions'],
  additionalProperties: false,
}

phase('Specialist research')
const reportRuns = await Promise.all(args.specialists.map(async role => {
  const result = await agent([
    'You are the MAOQ ' + role + ' specialist. Analyze only your assigned domain.',
    'Use reality-first evidence, distinguish facts from inference, identify counter-evidence, and state falsifiable invalidation conditions.',
    'Decision objective: ' + args.objective,
    'Return normalized strings and a confidence from 0 to 1. The role field must be exactly: ' + role,
  ].join('\n\n'), {
    label: role,
    phase: 'Specialist research',
    schema: reportSchema,
    includeUsage: true,
  })
  const report = result === null ? null : result.value
  if (report === null || report.role !== role) throw new Error('specialist ' + role + ' failed to return its structured report')
  return { report, usage: { label: role, phase: 'Specialist research', usage: result.usage } }
}))
const reports = reportRuns.map(run => run.report)

phase('Decision synthesis')
const decisionResult = await agent([
  'You are the MAOQ commander. Synthesize the reports into one bounded paper decision.',
  'Identify the principal contradiction, choose the least-resistance battlefield and tactic, and prefer no_trade when evidence is insufficient.',
  'selectedSpecialists must exactly equal: ' + JSON.stringify(args.specialists),
  'Decision objective: ' + args.objective,
  'Structured specialist reports: ' + JSON.stringify(reports),
].join('\n\n'), {
  label: 'MAOQ commander synthesis',
  phase: 'Decision synthesis',
  schema: decisionSchema,
  includeUsage: true,
})
const decision = decisionResult === null ? null : decisionResult.value
if (decision === null || JSON.stringify(decision.selectedSpecialists) !== JSON.stringify(args.specialists)) {
  throw new Error('commander failed to preserve the selected specialist set')
}

phase('Independent risk review')
const riskResult = await agent([
  'You are the independent MAOQ risk reviewer. You did not author the proposal and may veto it.',
  'Approve only when evidence, invalidation conditions, and paper-only scope are internally consistent. A veto is final for this run.',
  'Decision objective: ' + args.objective,
  'Proposed decision: ' + JSON.stringify(decision),
  'Supporting and opposing reports: ' + JSON.stringify(reports),
].join('\n\n'), {
  label: 'Independent risk review',
  phase: 'Independent risk review',
  schema: riskSchema,
  includeUsage: true,
})
const risk = riskResult === null ? null : riskResult.value
if (risk === null || risk.approved !== (risk.verdict === 'approve')) {
  throw new Error('risk reviewer returned an inconsistent structured verdict')
}

const usageCalls = reportRuns.map(run => run.usage).concat([
  { label: 'MAOQ commander synthesis', phase: 'Decision synthesis', usage: decisionResult.usage },
  { label: 'Independent risk review', phase: 'Independent risk review', usage: riskResult.usage },
])
const tokenFields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']
const usageTotal = {}
for (const field of tokenFields) {
  usageTotal[field] = usageCalls.reduce((sum, call) => sum + (call.usage === null ? 0 : (call.usage[field] || 0)), 0)
}

return {
  status: risk.approved ? 'approved' : 'vetoed',
  specialists: args.specialists,
  reports,
  decision,
  risk,
  tokenUsage: {
    calls: usageCalls,
    total: usageTotal,
    unavailableCalls: usageCalls.filter(call => call.usage === null).length,
  },
}
`

const DESCRIPTION = 'Run a bounded MAOQ decision council. Select the smallest sufficient specialist set for the current objective; '
  + 'the tool runs only those specialists, then a fresh synthesis agent and a separate risk reviewer. '
  + 'The risk reviewer can veto the result. Output is analysis or a paper decision only and never places a live order.'

/** Validate defaults when direct callers bypass Loader normalization. */
function resolveConfig(config: Config): ResolvedConfig {
  const subagentProvider = config.subagentProvider ?? 'spawn'
  const maxSpecialists = config.maxSpecialists ?? 4
  const maxResultChars = config.maxResultChars ?? 32_768
  const analysisMode = config.analysisMode ?? 'quick'
  const stateRoot = config.stateRoot ?? '.maoq/decisions'
  const maxStateFiles = config.maxStateFiles ?? 500
  if (subagentProvider.length === 0 || subagentProvider !== subagentProvider.trim()) {
    throw new TypeError('subagentProvider must be a non-empty normalized string')
  }
  if (!Number.isSafeInteger(maxSpecialists) || maxSpecialists < 1 || maxSpecialists > SPECIALIST_ROLES.length) {
    throw new TypeError(`maxSpecialists must be an integer from 1 to ${SPECIALIST_ROLES.length}`)
  }
  if (!Number.isSafeInteger(maxResultChars) || maxResultChars < 1) {
    throw new TypeError('maxResultChars must be a positive safe integer')
  }
  if (stateRoot.trim().length === 0) throw new TypeError('stateRoot must be a non-empty path')
  if (!Number.isSafeInteger(maxStateFiles) || maxStateFiles < 1) {
    throw new TypeError('maxStateFiles must be a positive safe integer')
  }
  return { subagentProvider, maxSpecialists, maxResultChars, analysisMode, stateRoot, maxStateFiles }
}

/**
 * Require a fresh provider that can enforce every child output schema.
 * @param ctx - Active plugin context containing the subagent registry.
 * @param providerName - Exact configured provider route.
 * @returns The validated non-inheriting structured-output provider.
 */
export function requireFreshProvider(ctx: Context, providerName: string): SubagentProvider {
  const provider = ctx.subagents.getProvider(providerName)
  if (provider === undefined) throw new Error(`MAOQ subagent provider "${providerName}" is not registered`)
  if (!provider.capabilities.outputSchema) {
    throw new Error(`MAOQ subagent provider "${providerName}" does not support structured output`)
  }
  if (provider.inheritsParentContext) {
    throw new Error(`MAOQ subagent provider "${providerName}" inherits parent context; independent review requires fresh agents`)
  }
  return provider
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameStrings(value: unknown, expected: readonly string[]): value is string[] {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index])
}

/** Decode the fixed workflow result and enforce the risk veto outside model control. */
function readCouncilResult(value: unknown, expected: readonly SpecialistRole[]): CouncilResult {
  if (!isRecord(value) || (value['status'] !== 'approved' && value['status'] !== 'vetoed')) {
    throw new Error('MAOQ workflow returned a malformed council result')
  }
  if (!sameStrings(value['specialists'], expected)
    || !Array.isArray(value['reports'])
    || value['reports'].length !== expected.length
    || !isRecord(value['decision'])
    || !sameStrings(value['decision']['selectedSpecialists'], expected)
    || !isRecord(value['risk'])
    || !isRecord(value['tokenUsage'])
    || !Array.isArray(value['tokenUsage']['calls'])
    || !isRecord(value['tokenUsage']['total'])
    || typeof value['risk']['approved'] !== 'boolean'
    || (value['risk']['verdict'] !== 'approve' && value['risk']['verdict'] !== 'veto')) {
    throw new Error('MAOQ workflow returned inconsistent decision fields')
  }
  const reportRoles = value['reports'].map(report => isRecord(report) ? report['role'] : undefined)
  if (!sameStrings(reportRoles, expected)) throw new Error('MAOQ workflow returned reports for the wrong specialists')
  const approved = value['risk']['approved']
  if (approved !== (value['risk']['verdict'] === 'approve')) {
    throw new Error('MAOQ workflow returned an inconsistent risk verdict')
  }
  if (!approved && value['status'] === 'approved') throw new Error('MAOQ risk veto cannot produce approved status')
  if (approved && value['status'] !== 'approved') throw new Error('MAOQ approved risk verdict must produce approved status')
  return {
    status: value['status'],
    specialists: [...expected],
    reports: value['reports'] as JsonValue[],
    decision: value['decision'] as JsonValue,
    risk: value['risk'] as JsonValue,
    tokenUsage: value['tokenUsage'] as JsonValue,
  }
}

/**
 * Convert a non-completed workflow terminal state into a caller-facing error.
 * @param result - Settled workflow result.
 * @returns `undefined` for completion, otherwise a stable failure message.
 */
export function workflowError(result: WorkflowResult): string | undefined {
  switch (result.stopReason) {
    case 'completed': return undefined
    case 'cancelled': return `MAOQ decision council was cancelled${result.error === undefined ? '' : ` (${result.error})`}`
    case 'error': return `MAOQ decision council failed: ${result.error ?? 'unknown error'}`
    /* v8 ignore start -- WorkflowStopReason is closed; future variants fail loud. */
    default: return `MAOQ decision council ended abnormally (${String(result.stopReason satisfies never)})`
    /* v8 ignore stop */
  }
}

const TRUNCATION_NOTICE = '\n… [truncated]'

function boundText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= TRUNCATION_NOTICE.length) return TRUNCATION_NOTICE.slice(0, maxChars)
  return `${text.slice(0, maxChars - TRUNCATION_NOTICE.length)}${TRUNCATION_NOTICE}`
}

function renderCouncil(result: CouncilResult, maxChars: number): string {
  const heading = result.status === 'approved'
    ? 'MAOQ independent risk review approved this paper decision.'
    : 'MAOQ independent risk review vetoed this paper decision.'
  return boundText(`${heading}\n${JSON.stringify(result, null, 2)}`, maxChars)
}

function presentCall(args: MaoqCallArgs): ToolCallView {
  return { card: 'generic', title: 'MAOQ decision council', rawInput: args.objective }
}

function presentResult(_args: MaoqCallArgs, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView {
  return { card: 'generic' }
}

/** Register the MAOQ decision council and its bounded-autonomy guidance. */
export function apply(ctx: Context, config: Config): void {
  const base = resolveConfig(config)
  let source = (): Config => base
  const current = (): ResolvedConfig => resolveConfig(source())
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, MAOQ_DECISION_SETTINGS_NAMESPACE, Config, base, {
      setSource: (next) => { source = next },
      onChange: () => {},
    })
  })
  ctx.systemPrompt.section({
    name: 'tool:maoq-decision',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: 'For current-state or multi-day review questions, read the persisted decision mirrors with maoq_state_latest, maoq_state_history, or maoq_state_get before considering a new analysis. A persisted mirror is current only when freshness.currentUseAllowed is true; otherwise use it for history only and obtain a new immutable snapshot before analysis. Call maoq_analyze_strategy with the smallest sufficient specialist set only when no matching current state exists or a new immutable snapshot requires one; exact repeated inputs return the persisted state without starting agents. Its deterministic features, evidence references, Mao method attributions, and independent risk veto are binding. Use maoq_decide only for council-runtime diagnostics. None of these tools can place a live order or rank stocks in the P2 strategic-state phase.',
  })
  registerStrategicStateTool(ctx, current)
  registerStrategicStateQueryTools(ctx, current)
  ctx.tools.register(defineTool({
    name: 'maoq_decide',
    description: DESCRIPTION,
    parameters: {
      objective: {
        type: 'string',
        required: true,
        description: 'The concrete market or stock-selection decision to resolve from one immutable snapshot.',
      },
      specialists: {
        type: 'array',
        required: true,
        items: { type: 'string', enum: SPECIALIST_ROLES },
        description: 'Ordered smallest sufficient subset: market_regime, emotion_cycle, policy_macro, sector_battlefield, tactic_selection, stock_research.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          agentsStarted: { type: 'integer', required: true },
          status: { type: 'string', required: true, enum: ['approved', 'vetoed'] },
          specialists: { type: 'array', required: true, items: { type: 'string' } },
          reports: { type: 'json', required: true },
          decision: { type: 'json', required: true },
          risk: { type: 'json', required: true },
          tokenUsage: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderCouncil({
          status: value.status,
          specialists: value.specialists as SpecialistRole[],
          reports: value.reports as JsonValue[],
          decision: value.decision,
          risk: value.risk,
          tokenUsage: value.tokenUsage,
        }, current().maxResultChars),
      }],
    },
    async execute(args, exec) {
      const resolved = current()
      if (exec.agent === undefined) throw new Error('MAOQ decision tool requires a calling agent')
      const objective = args.objective.trim()
      if (objective.length === 0) throw new Error('MAOQ objective must be a non-empty string')
      const specialists = args.specialists
      if (specialists.length < 1) throw new Error('MAOQ requires at least one specialist')
      if (specialists.length > resolved.maxSpecialists) {
        throw new Error(`MAOQ specialist count ${specialists.length} exceeds the deployment limit ${resolved.maxSpecialists}`)
      }
      if (new Set(specialists).size !== specialists.length) throw new Error('MAOQ specialist selection contains duplicates')
      void requireFreshProvider(ctx, resolved.subagentProvider)

      const run: WorkflowRun = ctx.workflowEngine.start({
        script: COUNCIL_SCRIPT,
        meta: COUNCIL_META,
        args: { objective, specialists },
        subagentProvider: resolved.subagentProvider,
        maxTotalAgents: specialists.length + 2,
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
        const result = readCouncilResult(settled.value, specialists)
        return {
          runId: run.id,
          agentsStarted: settled.agentsStarted,
          status: result.status,
          specialists: result.specialists,
          reports: result.reports,
          decision: result.decision,
          risk: result.risk,
          tokenUsage: result.tokenUsage,
        }
      } finally {
        exec.signal.removeEventListener('abort', onAbort)
        await run.dispose()
      }
    },
    presentCall,
    presentResult,
  }))
}
