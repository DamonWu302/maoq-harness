import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { StrategicFeatureRecord } from '@deepseek-ai/dsh-market-strategic-state'
import { evaluateTacticEligibility } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  createEmptyTacticScorecard,
  createTacticCommanderDecision,
  routeEligibleTactics,
  TacticRoutingStore,
  type TacticCommanderDecisionRecord,
  type TacticCommanderProposalInput,
  type TacticCommanderRiskInput,
  type TacticRoutingRecord,
} from '@deepseek-ai/dsh-market-tactic-routing'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { WorkflowRun } from '@deepseek-ai/dsh-workflow'
import {
  requireFreshProvider,
  type ResolvedConfig,
  workflowError,
} from './index.ts'
import { currentStrategicStateFreshness } from './strategic-query.ts'
import { StrategicDecisionStore } from './strategic-store.ts'

interface TacticWorkflowValue {
  readonly proposal: TacticCommanderProposalInput
  readonly risk: TacticCommanderRiskInput
  readonly tokenUsage: JsonValue
}

interface TacticToolResult {
  readonly runId: string
  readonly agentsStarted: number
  readonly route: TacticRoutingRecord
  readonly decision: TacticCommanderDecisionRecord
  readonly tokenUsage: JsonValue
}

const TACTIC_WORKFLOW_SCRIPT = String.raw`
const tacticIds = [...new Set([...args.route.slate.map(item => item.tacticId), args.route.defensiveFallback.tacticId])]
const evidenceRefs = [...new Set([
  ...args.route.slate.flatMap(item => item.evidenceRefs),
  ...args.route.defensiveFallback.evidenceRefs,
])]
const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    routeId: { type: 'string' },
    primaryTacticId: { type: 'string', enum: tacticIds },
    secondaryTacticId: { type: 'string', enum: tacticIds },
    thesis: { type: 'string' },
    evidenceRefs: { type: 'array', items: { type: 'string', enum: evidenceRefs } },
    counterEvidenceRefs: { type: 'array', items: { type: 'string', enum: evidenceRefs } },
    confidence: { type: 'number' },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
  },
  required: ['routeId', 'primaryTacticId', 'thesis', 'evidenceRefs', 'counterEvidenceRefs', 'confidence', 'invalidationConditions'],
}
const riskSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    routeId: { type: 'string' },
    approved: { type: 'boolean' },
    verdict: { type: 'string', enum: ['approve', 'veto'] },
    reasons: { type: 'array', items: { type: 'string' } },
    hardLimits: { type: 'array', items: { type: 'string' } },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
  },
  required: ['routeId', 'approved', 'verdict', 'reasons', 'hardLimits', 'invalidationConditions'],
}

phase('Bounded tactic synthesis')
const proposalResult = await agent([
  'You are the MAOQ tactic commander. Choose only from the exact deterministic route below.',
  'Choose one primary tactic and at most one distinct secondary tactic. defensive_no_trade must be primary alone.',
  'Do not alter tactic rules, scores, promotion scope, evidence, risk ceilings, or the market-data cutoff.',
  'Cite only supplied evidenceRefs and state a falsifiable thesis and invalidation conditions.',
  'Exact route: ' + JSON.stringify(args.route),
].join('\n\n'), {
  label: 'MAOQ bounded tactic synthesis',
  phase: 'Bounded tactic synthesis',
  schema: proposalSchema,
  includeUsage: true,
})
if (proposalResult === null) throw new Error('tactic commander returned no proposal')
const proposal = {
  ...proposalResult.value,
  secondaryTacticId: proposalResult.value.secondaryTacticId || null,
}

phase('Independent tactic risk review')
const riskResult = await agent([
  'You are the independent MAOQ tactic risk reviewer. You did not author this proposal and your veto is final.',
  'Approve only if the proposal stays inside the exact route, cites routed evidence, preserves promotion scope, and states usable invalidation.',
  'Exact route: ' + JSON.stringify(args.route),
  'Proposal: ' + JSON.stringify(proposal),
].join('\n\n'), {
  label: 'Independent tactic risk review',
  phase: 'Independent tactic risk review',
  schema: riskSchema,
  includeUsage: true,
})
if (riskResult === null) throw new Error('tactic risk reviewer returned no verdict')

const calls = [
  { label: 'MAOQ bounded tactic synthesis', phase: 'Bounded tactic synthesis', usage: proposalResult.usage },
  { label: 'Independent tactic risk review', phase: 'Independent tactic risk review', usage: riskResult.usage },
]
const fields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']
const total = {}
for (const field of fields) total[field] = calls.reduce((sum, call) => sum + (call.usage === null ? 0 : (call.usage[field] || 0)), 0)
return {
  proposal,
  risk: riskResult.value,
  tokenUsage: { calls, total, unavailableCalls: calls.filter(call => call.usage === null).length },
}
`

const TACTIC_WORKFLOW_META = {
  name: 'maoq-bounded-tactic-commander',
  description: 'Choose from one deterministic top-three tactic route and require independent risk review.',
  phases: [
    { title: 'Bounded tactic synthesis', detail: 'The commander sees only the exact deterministic route.' },
    { title: 'Independent tactic risk review', detail: 'A fresh reviewer may veto but cannot expand the route.' },
  ],
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readWorkflowValue(value: unknown): TacticWorkflowValue {
  const record = recordOf(value)
  if (!record['proposal'] || !record['risk'] || !record['tokenUsage']) {
    throw new Error('MAOQ tactic workflow returned a malformed result')
  }
  return {
    proposal: record['proposal'] as TacticCommanderProposalInput,
    risk: record['risk'] as TacticCommanderRiskInput,
    tokenUsage: record['tokenUsage'] as JsonValue,
  }
}

function defensiveDecision(route: TacticRoutingRecord): TacticCommanderDecisionRecord {
  const evidenceRefs = route.defensiveFallback.evidenceRefs
  return createTacticCommanderDecision(route, {
    routeId: route.routeId,
    primaryTacticId: 'defensive_no_trade',
    secondaryTacticId: null,
    thesis: 'No active tactic has sufficient routed evidence; preserve capital and wait.',
    evidenceRefs,
    counterEvidenceRefs: [],
    confidence: 1,
    invalidationConditions: ['A new route qualifies at least one active tactic.'],
  }, {
    routeId: route.routeId,
    approved: true,
    verdict: 'approve',
    reasons: ['The deterministic route contains defense only.'],
    hardLimits: ['No order may be created.'],
    invalidationConditions: ['A new route identity requires a new review.'],
  })
}

/**
 * Run bounded synthesis and host validation for one already-built route.
 * @param ctx - Context owning workflow, provider, and persistence services.
 * @param config - Current validated MAOQ deployment policy.
 * @param route - Exact deterministic route exposed to the bounded workflow.
 * @param parent - Calling Agent that parents both fresh children.
 * @param signal - Parent tool cancellation signal.
 * @returns Persisted route, host-validated decision, and exact child usage report.
 */
export async function executeTacticSelection(
  ctx: Context,
  config: ResolvedConfig,
  route: TacticRoutingRecord,
  parent: Agent,
  signal: AbortSignal,
): Promise<TacticToolResult> {
  const store = new TacticRoutingStore(config.tacticStateRoot)
  await store.publishRoute(route)
  if (route.slate.every(item => item.tacticId === 'defensive_no_trade')) {
    const decision = defensiveDecision(route)
    await store.publishDecision(decision)
    return {
      runId: `deterministic:${decision.decisionId}`,
      agentsStarted: 0,
      route,
      decision,
      tokenUsage: { calls: [], total: {}, unavailableCalls: 0 } as JsonValue,
    }
  }
  void requireFreshProvider(ctx, config.subagentProvider)
  const run: WorkflowRun = ctx.workflowEngine.start({
    script: TACTIC_WORKFLOW_SCRIPT,
    meta: TACTIC_WORKFLOW_META,
    args: { route },
    subagentProvider: config.subagentProvider,
    maxTotalAgents: 2,
    parent,
    signal,
  })
  const onAbort = (): void => { run.cancel('parent step aborted') }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) run.cancel('parent step aborted')
  try {
    const settled = await run.result
    const error = workflowError(settled)
    if (error !== undefined) throw new Error(error)
    const value = readWorkflowValue(settled.value)
    const decision = createTacticCommanderDecision(route, value.proposal, value.risk)
    await store.publishDecision(decision)
    return { runId: run.id, agentsStarted: settled.agentsStarted, route, decision, tokenUsage: value.tokenUsage }
  } finally {
    signal.removeEventListener('abort', onAbort)
    await run.dispose()
  }
}

async function latestRoute(ctx: Context, config: ResolvedConfig): Promise<TacticRoutingRecord> {
  const strategic = await new StrategicDecisionStore(config.stateRoot).latest(config.maxStateFiles)
  if (strategic === undefined) throw new Error('MAOQ tactic selection requires a persisted strategic state')
  if (strategic.result.status !== 'approved' || !strategic.result.actionable) {
    throw new Error('MAOQ tactic selection requires an approved actionable strategic state')
  }
  const freshness = await currentStrategicStateFreshness(ctx, config, strategic, new Date().toISOString())
  if (!freshness.currentUseAllowed) {
    throw new Error(`MAOQ tactic selection requires a current strategic state: ${freshness.reasons.join(',')}`)
  }
  const features = strategic.result.features as unknown as StrategicFeatureRecord
  if (features.currentSnapshotHash !== strategic.input.snapshotHash
    || features.tradingDate !== strategic.tradingDate
    || features.cutoffTime !== strategic.cutoffTime) {
    throw new Error('persisted strategic features do not match their decision mirror')
  }
  const store = new TacticRoutingStore(config.tacticStateRoot)
  const scorecard = await store.latestScorecardAt(features.cutoffTime, config.maxTacticStateFiles)
    ?? createEmptyTacticScorecard(features.cutoffTime)
  return routeEligibleTactics(features, evaluateTacticEligibility(features), scorecard)
}

function render(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= maxChars) return text
  const suffix = '\n… [truncated]'
  return maxChars <= suffix.length ? suffix.slice(0, maxChars) : `${text.slice(0, maxChars - suffix.length)}${suffix}`
}

/**
 * Register the P2 top-three tactic selection tool.
 * @param ctx - Context owning the tool registry and tactic workflow services.
 * @param getConfig - Live reader for the current validated deployment policy.
 */
export function registerTacticCommanderTool(ctx: Context, getConfig: () => ResolvedConfig): void {
  ctx.tools.register(defineTool({
    name: 'maoq_select_tactics',
    description: 'Read the latest approved strategic state and bounded conditional scorecard, build a deterministic top-three route, then choose at most one primary and one secondary tactic under host validation and independent risk veto. It never scans full market history or places an order.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          agentsStarted: { type: 'integer', required: true },
          route: { type: 'json', required: true },
          decision: { type: 'json', required: true },
          tokenUsage: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: render(value, getConfig().maxResultChars) }],
    },
    async execute(_args, exec) {
      if (exec.agent === undefined) throw new Error('MAOQ tactic selection requires a calling agent')
      const config = getConfig()
      const result = await executeTacticSelection(ctx, config, await latestRoute(ctx, config), exec.agent, exec.signal)
      return {
        ...result,
        route: result.route as unknown as JsonValue,
        decision: result.decision as unknown as JsonValue,
      }
    },
    presentCall: (): ToolCallView => ({ card: 'generic', title: 'Select routed MAOQ tactics' }),
    presentResult: (_args, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView => ({ card: 'generic' }),
  }))
}
