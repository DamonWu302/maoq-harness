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
const tacticIds = args.route.advisoryUniverse.map(item => item.tacticId)
const evidenceRefs = [...new Set(args.route.advisoryUniverse.flatMap(item => item.evidenceRefs))]
const tacticEvidence = new Set(args.route.advisoryUniverse.flatMap(item => item.evidenceRefs.filter(ref => ref.includes(item.tacticId))))
const briefing = {
  routeId: args.route.routeId,
  tradingDate: args.route.tradingDate,
  cutoffTime: args.route.cutoffTime,
  context: args.route.context,
  cashFloorPct: args.route.cashFloorPct,
  slate: args.route.slate.map(item => ({
    tacticId: item.tacticId,
    routeScore: item.routeScore,
    scope: item.scope,
    scoreComponents: item.scoreComponents,
    metrics: item.metrics,
    evidenceRefs: item.evidenceRefs,
  })),
  advisoryUniverse: args.route.advisoryUniverse.map(item => ({
    ...item,
    evidenceRefs: item.evidenceRefs.filter(ref => ref.includes(item.tacticId)),
  })),
  sharedEvidenceRefs: evidenceRefs.filter(ref => !tacticEvidence.has(ref)),
}
const specialistRoles = ['short_sentiment', 'big_bull_trend', 'short_fast', 'oversold_reversal', 'sector_rotation']
const specialistLabels = {
  short_sentiment: '短线情绪专家',
  big_bull_trend: '大牛股与主升趋势专家',
  short_fast: '短线快打与执行专家',
  oversold_reversal: '超跌修复专家',
  sector_rotation: '板块轮动专家',
}
const plannerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selectedSpecialists: { type: 'array', items: { type: 'string', enum: specialistRoles } },
    principalContradiction: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['selectedSpecialists', 'principalContradiction', 'rationale'],
}
const reportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    role: { type: 'string', enum: specialistRoles },
    verdict: { type: 'string', enum: ['support', 'oppose', 'conditional'] },
    preferredTacticIds: { type: 'array', items: { type: 'string', enum: tacticIds } },
    analysis: { type: 'string' },
    supportingEvidenceRefs: { type: 'array', items: { type: 'string', enum: evidenceRefs } },
    counterEvidenceRefs: { type: 'array', items: { type: 'string', enum: evidenceRefs } },
    confidence: { type: 'number' },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'verdict', 'preferredTacticIds', 'analysis', 'supportingEvidenceRefs', 'counterEvidenceRefs', 'confidence', 'invalidationConditions'],
}
const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    routeId: { type: 'string' },
    selectedSpecialists: { type: 'array', items: { type: 'string', enum: specialistRoles } },
    marketPhase: { type: 'string' },
    principalContradiction: { type: 'string' },
    rewardedStyle: { type: 'string' },
    posture: { type: 'string', enum: ['no_trade', 'observe', 'probe', 'attack'] },
    quantRouteDisposition: { type: 'string', enum: ['follow', 'override'] },
    quantRouteAssessment: { type: 'string' },
    primaryTacticId: { type: 'string', enum: tacticIds },
    secondaryTacticId: { type: 'string', enum: tacticIds },
    stockMissions: { type: 'array', items: { type: 'string' } },
    thesis: { type: 'string' },
    evidenceRefs: { type: 'array', items: { type: 'string', enum: evidenceRefs } },
    counterEvidenceRefs: { type: 'array', items: { type: 'string', enum: evidenceRefs } },
    confidence: { type: 'number' },
    invalidationConditions: { type: 'array', items: { type: 'string' } },
  },
  required: ['routeId', 'selectedSpecialists', 'marketPhase', 'principalContradiction', 'rewardedStyle', 'posture', 'quantRouteDisposition', 'quantRouteAssessment', 'primaryTacticId', 'stockMissions', 'thesis', 'evidenceRefs', 'counterEvidenceRefs', 'confidence', 'invalidationConditions'],
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

phase('识别主要矛盾并调度专家')
const plannerResult = await agent([
  '你是 MAOQ 战术议会的统帅侦察官。量化 Top 3 只是参谋建议，不是世界边界。',
  '从固定专家表中恰好选择两名最能解释当前主要矛盾的专家；不得重复，不得选择风控，风控将在末尾独立运行。',
  '市场与战法参谋简报：' + JSON.stringify(briefing),
].join('\n\n'), {
  label: '统帅侦察·动态调度专家',
  phase: '识别主要矛盾并调度专家',
  schema: plannerSchema,
  includeUsage: true,
})
if (plannerResult === null) throw new Error('tactic council planner returned no plan')
const selectedSpecialists = plannerResult.value.selectedSpecialists
if (selectedSpecialists.length !== 2 || new Set(selectedSpecialists).size !== 2
  || selectedSpecialists.some(role => !specialistRoles.includes(role))) {
  throw new Error('tactic council planner must select exactly two unique registered specialists')
}

phase('独立战术专家会诊')
const reportRuns = await Promise.all(selectedSpecialists.map(async role => {
  const result = await agent([
    '你是 MAOQ 的' + specialistLabels[role] + '。只从自己的专业视角独立判断，不迎合量化 Top 3 或其他专家。',
    '完整战法注册表是研究边界；量化 slate 是参谋建议。可以支持、反对或有条件支持任何通过硬门槛的战法。',
    '只引用简报中的 evidenceRefs，明确反证、置信度和可证伪失效条件。role 必须严格等于 ' + role + '。',
    '规划者识别的主要矛盾：' + plannerResult.value.principalContradiction,
    '市场与战法参谋简报：' + JSON.stringify(briefing),
  ].join('\n\n'), {
    label: '战术专家·' + specialistLabels[role],
    phase: '独立战术专家会诊',
    schema: reportSchema,
    includeUsage: true,
  })
  if (result === null || result.value.role !== role) throw new Error('selected tactic specialist returned an invalid report: ' + role)
  return { report: result.value, usage: { label: '战术专家·' + specialistLabels[role], phase: '独立战术专家会诊', usage: result.usage } }
}))
const reports = reportRuns.map(run => run.report)

phase('统帅形成全局作战计划')
const proposalResult = await agent([
  '你是统帅全局的 MAOQ 投资决策负责人。综合市场状态、完整十战法注册表、量化参谋建议和两个独立专家报告。',
  '识别市场阶段、主要矛盾、当前被奖赏的风格和阻力最小方向；选择一个主战法和最多一个不同的辅战法。防守空仓只能单独作为主战法。',
  'slate 是量化参谋意见，不是硬白名单。若选择 slate 外战法，quantRouteDisposition 必须为 override，并给出针对量化建议的反证和明确评估。',
  '不得修改战法规则、评分、晋级范围、证据、风险上限或数据截止点。stockMissions 只描述下一层应寻找的股票任务，不得输出股票或订单。',
  '只引用简报 evidenceRefs，给出可证伪论点与失效条件。selectedSpecialists 必须严格保持：' + JSON.stringify(selectedSpecialists),
  '规划者结论：' + JSON.stringify(plannerResult.value),
  '完整市场与战法参谋简报：' + JSON.stringify(briefing),
  '独立专家报告：' + JSON.stringify(reports),
].join('\n\n'), {
  label: 'MAOQ 统帅·全局战术决策',
  phase: '统帅形成全局作战计划',
  schema: proposalSchema,
  includeUsage: true,
})
if (proposalResult === null || JSON.stringify(proposalResult.value.selectedSpecialists) !== JSON.stringify(selectedSpecialists)) throw new Error('tactic commander returned no valid proposal')
const proposal = {
  ...proposalResult.value,
  secondaryTacticId: proposalResult.value.secondaryTacticId || null,
  specialistReports: reports,
}

phase('独立风控最终否决')
const riskResult = await agent([
  '你是独立 MAOQ 风控负责人。你没有参与提案，否决权是最终的。',
  '审查完整战法全集边界、量化偏离理由、专家分歧、证据、晋级权限和失效条件。模型不能通过文字提升任何战法权限。',
  '市场与战法参谋简报：' + JSON.stringify(briefing),
  '完整作战提案：' + JSON.stringify(proposal),
].join('\n\n'), {
  label: '独立风控·最终否决审查',
  phase: '独立风控最终否决',
  schema: riskSchema,
  includeUsage: true,
})
if (riskResult === null) throw new Error('tactic risk reviewer returned no verdict')

const calls = [
  { label: '统帅侦察·动态调度专家', phase: '识别主要矛盾并调度专家', usage: plannerResult.usage },
  ...reportRuns.map(run => run.usage),
  { label: 'MAOQ 统帅·全局战术决策', phase: '统帅形成全局作战计划', usage: proposalResult.usage },
  { label: '独立风控·最终否决审查', phase: '独立风控最终否决', usage: riskResult.usage },
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
  name: 'maoq-model-led-tactic-council',
  description: 'Dynamically select specialists, command the complete hard-feasible tactic catalog, and require independent risk veto.',
  phases: [
    { title: '识别主要矛盾并调度专家', detail: '统帅侦察官从固定专家池动态选择两名专家。' },
    { title: '独立战术专家会诊', detail: '被选专家并行、独立评估完整硬可行战法池。' },
    { title: '统帅形成全局作战计划', detail: '统帅综合量化参谋意见、分歧和全局状态。' },
    { title: '独立风控最终否决', detail: '独立风控可否决，但不能扩大战法权限。' },
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
    selectedSpecialists: [],
    specialistReports: [],
    marketPhase: 'Hard feasibility unavailable',
    principalContradiction: 'Insufficient hard-feasible evidence versus the need to preserve capital.',
    rewardedStyle: 'Cash and optionality',
    posture: 'no_trade',
    quantRouteDisposition: 'follow',
    quantRouteAssessment: 'The host advisory universe contains defense only.',
    primaryTacticId: 'defensive_no_trade',
    secondaryTacticId: null,
    stockMissions: ['Wait for a new snapshot that restores hard-feasible tactic evidence.'],
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
 * @param route - Exact deterministic advice and hard-feasible universe exposed through a compact briefing.
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
  if (route.advisoryUniverse.every(item => item.tacticId === 'defensive_no_trade')) {
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
    maxTotalAgents: 5,
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

function renderTacticResult(value: unknown, maxChars: number): string {
  const record = recordOf(value)
  const route = recordOf(record['route'])
  const slate = Array.isArray(route['slate']) ? route['slate'].map((item) => {
    const candidate = recordOf(item)
    return {
      tacticId: candidate['tacticId'],
      routeScore: candidate['routeScore'],
      scope: candidate['scope'],
    }
  }) : []
  const advisoryUniverse = Array.isArray(route['advisoryUniverse'])
    ? route['advisoryUniverse'].map(item => recordOf(item)['tacticId'])
    : []
  return render({
    runId: record['runId'],
    agentsStarted: record['agentsStarted'],
    decision: record['decision'],
    tokenUsage: record['tokenUsage'],
    routeSummary: {
      routeId: route['routeId'],
      tradingDate: route['tradingDate'],
      cutoffTime: route['cutoffTime'],
      context: route['context'],
      quantitativeSlate: slate,
      advisoryTacticIds: advisoryUniverse,
    },
  }, maxChars)
}

/**
 * Register the P2 model-led full-catalog tactic council tool.
 * @param ctx - Context owning the tool registry and tactic workflow services.
 * @param getConfig - Live reader for the current validated deployment policy.
 */
export function registerTacticCommanderTool(ctx: Context, getConfig: () => ResolvedConfig): void {
  ctx.tools.register(defineTool({
    name: 'maoq_select_tactics',
    description: 'Read the latest approved strategic state and conditional scorecard, treat the deterministic top three as quantitative advice, dynamically consult two experts, then choose one primary and optional secondary from the complete hard-feasible ten-tactic catalog under host validation and independent risk veto. It never scans full market history or places an order.',
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
      render: (_args, value) => [{ type: 'text', text: renderTacticResult(value, getConfig().maxResultChars) }],
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
    presentCall: (): ToolCallView => ({ card: 'generic', title: '动态研判完整 MAOQ 战法池' }),
    presentResult: (_args, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView => ({ card: 'generic' }),
  }))
}
