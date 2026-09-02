import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { contentHash } from '@deepseek-ai/dsh-market-snapshot'
import type { MarketProvenance, MarketSnapshotDraft, MarketSnapshotIdentityInput } from '@deepseek-ai/dsh-market-snapshot'
import { computeStrategicFeatures } from '@deepseek-ai/dsh-market-strategic-state'
import { tacticDefinitions } from '@deepseek-ai/dsh-market-tactic-eligibility'
import type { ActiveTacticId, TacticDefinition } from '@deepseek-ai/dsh-market-tactic-eligibility'
import {
  advanceTacticScorecard,
  createEmptyTacticScorecard,
  createMaturedTacticOutcome,
  deriveTacticRoutingContext,
  TacticRoutingStore,
} from '@deepseek-ai/dsh-market-tactic-routing'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ResolvedSubagentStartRequest, SubagentProvider, SubagentRun } from '@deepseek-ai/dsh-subagent'

function provenance(date: string, dataset: string, recordId: string): MarketProvenance {
  return {
    source: { adapter: 'loader-strategic', dataset, version: `${dataset}-${date}`, retrievedAt: `${date}T15:10:00+08:00`, recordId },
    transforms: ['loader-gold-v1'],
  }
}

function draft(identity: MarketSnapshotIdentityInput, offset: number): MarketSnapshotDraft {
  const date = identity.tradingDate
  return {
    identity,
    stocks: [{
      symbol: '600000.SH', tradingDate: date, open: 10, high: 10.8, low: 9.9, close: 10.5, volume: 1_000_000,
      amount: 10_400_000, turnoverRate: 0.03, adjustmentFactor: 1.2, tradingStatus: 'trading', limitStatus: 'none',
      listingDays: 8_000, qualityFlags: [], provenance: provenance(date, 'daily', '600000.SH'),
    }],
    sectors: [{
      sectorId: 'bank', name: '银行', tradingDate: date, open: 100, high: 106, low: 99, close: 102 + offset,
      amount: 30_000_000_000, advancingRatio: 0.75, limitUpCount: 1, dispersion: 0.012, leaders: ['600000.SH'],
      members: [{ symbol: '600000.SH', effectiveFrom: '2020-01-01', effectiveTo: null }], provenance: provenance(date, 'sector', 'bank'),
    }],
    breadth: {
      majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: 0.008 }], totalAmount: 1_200_000_000_000,
      advancing: 3_200, declining: 1_500, unchanged: 200, limitUp: 72, limitDown: 8, brokenLimit: 24,
      provenance: provenance(date, 'breadth', date),
    },
    emotion: {
      consecutiveBoardCounts: [{ boards: 3, count: 2 }, { boards: 2, count: 7 }], promotionRate: 0.48,
      brokenLimitRate: 0.25, lossEffectRate: 0.12, provenance: provenance(date, 'emotion', date),
    },
    news: [{
      id: `policy-${date}`, title: '行业政策公开发布', url: `https://example.test/policy-${date}`, publisher: 'fixture authority',
      publishedAt: `${date}T10:00:00+08:00`, fetchedAt: `${date}T10:01:00+08:00`, eventAt: `${date}T10:00:00+08:00`,
      affectedSectors: ['bank'], confidence: 1, provenance: provenance(date, 'news', `policy-${date}`),
    }],
  }
}

function textContent(options: GenerateOptions): string {
  return options.messages.at(-1)?.content.filter(block => block.type === 'tool-result').flatMap(block => block.content)
    .filter(block => block.type === 'text').map(block => block.text).join('') ?? ''
}

class MaoqStrategicCommanderAdapter extends LlmAdapter {
  private phase = 0

  constructor(
    private readonly currentHash: string,
    private readonly historyHashes: readonly string[],
    private readonly includeTacticSelection = false,
  ) { super() }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const result = textContent(options)
    if (this.phase === 0) {
      this.phase = 1
      const args = JSON.stringify({
        objective: '识别主要矛盾和阻力最小的板块。', snapshotHash: this.currentHash, historySnapshotHashes: this.historyHashes,
        decisionTime: '2026-08-28T16:00:00+08:00', maximumAgeHours: this.includeTacticSelection ? 240 : 24,
        specialists: ['market_regime', 'sector_battlefield'],
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('maoq-strategic-loader-call'), name: 'maoq_analyze_strategy', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('maoq-strategic-loader-call'), name: 'maoq_analyze_strategy', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (this.includeTacticSelection && this.phase === 1) {
      this.phase = 2
      const args = '{}'
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('maoq-tactic-loader-call'), name: 'maoq_select_tactics', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('maoq-tactic-loader-call'), name: 'maoq_select_tactics', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: result }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: result } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function jsonAfterMarker(prompt: string, marker: string): Record<string, unknown> {
  const start = prompt.indexOf(marker)
  if (start < 0) throw new Error(`strategic fixture prompt has no ${marker}`)
  const tail = prompt.slice(start + marker.length)
  const end = tail.indexOf('\n\n')
  return JSON.parse(end < 0 ? tail : tail.slice(0, end)) as Record<string, unknown>
}

function featureRecord(prompt: string): Record<string, unknown> {
  const marker = prompt.includes('Deterministic feature record: ') ? 'Deterministic feature record: ' : 'Feature record: '
  return jsonAfterMarker(prompt, marker)
}

function structured(request: ResolvedSubagentStartRequest): unknown {
  const prompt = request.prompt.filter(block => block.type === 'text').map(block => block.text).join('\n')
  if (prompt.includes('统帅侦察官')) {
    return {
      selectedSpecialists: ['sector_rotation', 'big_bull_trend'],
      principalContradiction: '板块轮动速度与趋势延续质量之间的矛盾',
      rationale: '轮动与趋势专家最能检验当前阻力最小方向。',
    }
  }
  if (prompt.includes('role 必须严格等于 ')) {
    const route = jsonAfterMarker(prompt, '市场与战法参谋简报：')
    const universe = route['advisoryUniverse'] as Array<{ tacticId: string; evidenceRefs: string[] }>
    const preferred = universe.find(item => item.tacticId === 'correlation_cluster_sector_rotation')
      ?? universe.find(item => item.tacticId !== 'defensive_no_trade')!
    const role = prompt.includes('role 必须严格等于 sector_rotation') ? 'sector_rotation' : 'big_bull_trend'
    return {
      role,
      verdict: 'support',
      preferredTacticIds: [preferred.tacticId],
      analysis: role === 'sector_rotation' ? '板块共振轮动是当前阻力最小方向。' : '趋势结构支持在轮动中寻找主升延续。',
      supportingEvidenceRefs: preferred.evidenceRefs,
      counterEvidenceRefs: [],
      confidence: 0.7,
      invalidationConditions: ['板块宽度或趋势持续性失效。'],
    }
  }
  if (prompt.includes('MAOQ 投资决策负责人')) {
    const route = jsonAfterMarker(prompt, '完整市场与战法参谋简报：')
    const universe = route['advisoryUniverse'] as Array<{ tacticId: string; evidenceRefs: string[] }>
    const primary = universe.find(item => item.tacticId === 'correlation_cluster_sector_rotation')
      ?? universe.find(item => item.tacticId !== 'defensive_no_trade')!
    const slate = route['slate'] as Array<{ tacticId: string; evidenceRefs: string[] }>
    const follows = slate.some(item => item.tacticId === primary.tacticId)
    return {
      routeId: route['routeId'],
      selectedSpecialists: ['sector_rotation', 'big_bull_trend'],
      marketPhase: '风险偏好趋势中的板块轮动',
      principalContradiction: '板块轮动速度与趋势延续质量之间的矛盾',
      rewardedStyle: '有容量的板块共振与趋势延续',
      posture: 'probe',
      quantRouteDisposition: follows ? 'follow' : 'override',
      quantRouteAssessment: follows ? '专家判断与量化参谋建议一致。' : '新鲜板块证据优先于滞后的量化短名单。',
      primaryTacticId: primary.tacticId,
      stockMissions: ['寻找板块共振、流动性合格且次日可执行的领涨候选。'],
      thesis: '板块共振轮动是当前有证据支持的阻力最小方向。',
      evidenceRefs: primary.evidenceRefs,
      counterEvidenceRefs: follows ? [] : slate.flatMap(item => item.evidenceRefs),
      confidence: 0.72,
      invalidationConditions: ['板块宽度或相关性集群失效。'],
    }
  }
  if (prompt.includes('独立 MAOQ 风控负责人')) {
    const route = jsonAfterMarker(prompt, '市场与战法参谋简报：')
    return {
      routeId: route['routeId'], approved: true, verdict: 'approve', reasons: ['提案保持在硬可行战法全集内。'],
      hardLimits: ['研究战法不得创建模拟仓位。'], invalidationConditions: ['新的路由身份必须重新审查。'],
    }
  }
  if (prompt.includes('independent MAOQ tactic risk reviewer')) {
    const route = jsonAfterMarker(prompt, 'Exact route: ')
    return {
      routeId: route['routeId'], approved: true, verdict: 'approve', reasons: ['提案保持在确定性路由范围内。'],
      hardLimits: ['研究战法不得创建模拟仓位。'], invalidationConditions: ['新的路由身份必须重新审查。'],
    }
  }
  if (prompt.includes('You are the MAOQ tactic commander. Choose only')) {
    const route = jsonAfterMarker(prompt, 'Exact route: ')
    const slate = route['slate'] as Array<{ tacticId: string; evidenceRefs: string[] }>
    const primary = slate.find(item => item.tacticId !== 'defensive_no_trade') ?? slate[0]!
    return {
      routeId: route['routeId'], primaryTacticId: primary.tacticId,
      thesis: '当前获准研究战法具有最强的有界条件证据。', evidenceRefs: primary.evidenceRefs,
      counterEvidenceRefs: [], confidence: 0.7, invalidationConditions: ['战法离开确定性路由时失效。'],
    }
  }
  if (prompt.includes('independent MAOQ risk reviewer')) {
    const context = jsonAfterMarker(prompt, 'Host-bound labels and the exact evidence cited by the decision: ')
    const cited = context['citedEvidence'] as Array<{ ref: string }>
    return { approved: true, verdict: 'approve', reasons: ['证据引用闭合且仅为观察姿态。'], evidenceRefs: [cited[0]!.ref], hardLimits: ['禁止实盘。'] }
  }
  const features = featureRecord(prompt)
  const evidence = features['evidence'] as Array<{ ref: string }>
  const refs = evidence.map(item => item.ref)
  const method = {
    methodId: 'principal_contradiction', application: '用主要矛盾方法识别风险偏好修复与分歧压力中当前占主导的一方。',
    evidenceRefs: [refs[0], refs[1]], limitation: '只适用于该日级快照及其显式历史。',
  }
  const role = prompt.includes('role field must be exactly: market_regime')
    ? 'market_regime'
    : prompt.includes('role field must be exactly: sector_battlefield') ? 'sector_battlefield' : undefined
  if (role !== undefined) return {
    role, conclusion: role === 'market_regime' ? '风险偏好趋势占优。' : '银行是阻力最小的板块。',
    supportingEvidenceRefs: [refs[0]], counterEvidenceRefs: [refs[1]], transitionConditions: ['市场宽度跌破阈值则降级。'],
    confidence: 0.68, maoMethodApplications: [method],
  }
  const market = features['marketRegime'] as { value: { label: string } }
  const emotion = features['emotionCycle'] as { value: { label: string } }
  if (prompt.includes('You are the MAOQ commander. Interpret')) return {
    marketRegime: market.value.label, emotionCycle: emotion.value.label, principalContradiction: '风险偏好修复与分歧压力之间的矛盾',
    leastResistanceBattlefield: '银行', supportingEvidenceRefs: [refs[0]], counterEvidenceRefs: [refs[1]],
    transitionConditions: ['晋级率低于 0.2 则转为退潮。'], confidence: 0.68, eligiblePosture: 'watch',
    maoMethodApplications: [method], selectedSpecialists: ['market_regime', 'sector_battlefield'],
  }
  throw new Error('strategic fixture received an unknown prompt')
}

class FreshStructuredProvider implements SubagentProvider {
  readonly name = 'fresh'
  readonly capabilities = { agentOptions: false, outputSchema: true, depthLimit: false, toolFilter: false, persona: false }
  readonly inheritsParentContext = false
  private sequence = 0
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    this.sequence += 1
    return Promise.resolve({ id: SessionId(`maoq-strategic-child-${this.sequence}`), localAgent: undefined, result: Promise.resolve({ output: [], structured: structured(request), stopReason: 'completed' }), dispose: async () => {} })
  }
}

export const name = 'mock-maoq-strategic-runtime'
export const inject = ['llm', 'subagents', 'marketSnapshots']

async function seedTacticScorecard(features: ReturnType<typeof computeStrategicFeatures>): Promise<void> {
  const context = deriveTacticRoutingContext(features)
  const active = tacticDefinitions().filter(
    (definition): definition is TacticDefinition & { readonly tacticId: ActiveTacticId } => (
      definition.tacticId !== 'defensive_no_trade'
    ),
  )
  const outcomes = active.flatMap(definition => Array.from({ length: 8 }, (_, index) => {
    const day = String(index + 10).padStart(2, '0')
    return createMaturedTacticOutcome({
      tacticId: definition.tacticId,
      tacticVersion: definition.tacticVersion,
      decisionDate: `2026-08-${day}`,
      maturityDate: `2026-08-${day}`,
      availableAt: `2026-08-${day}T12:00:00+08:00`,
      context,
      netReturn: 0.05,
      doubledCostNetReturn: 0.04,
      maximumDrawdown: 0.01,
      fillRate: 1,
      sourceHashes: [contentHash({ tacticId: definition.tacticId, index })],
    })
  }))
  const scorecard = advanceTacticScorecard(
    createEmptyTacticScorecard('2026-08-01T00:00:00+08:00'),
    outcomes,
    features.cutoffTime,
  )
  await new TacticRoutingStore('./.tactics').publishScorecard(scorecard)
}

export async function apply(ctx: Context): Promise<void> {
  const identities = ['2026-08-26', '2026-08-27', '2026-08-28'].map(date => ({
    tradingDate: date, cutoffTime: `${date}T15:30:00+08:00`, calendarVersion: 'sse-szse-2026.08', adjustmentVersion: `qfq-${date}`,
    sectorClassificationVersion: 'maoq-sector-2026.08', sourceVersions: [`daily-${date}`, `sector-${date}`, `news-${date}`],
  }))
  const drafts = new Map(identities.map((identity, index) => [identity.tradingDate, draft(identity, index)]))
  const dispose = ctx.marketSnapshots.register({ name: 'loader-strategic', load: identity => Promise.resolve(drafts.get(identity.tradingDate)!) })
  ctx.effect(() => dispose)
  const snapshots = []
  for (const identity of identities) snapshots.push(await ctx.marketSnapshots.build('loader-strategic', identity))
  await seedTacticScorecard(computeStrategicFeatures(snapshots[2]!, snapshots.slice(0, 2)))
  ctx.llm.registerAdapter(['mock-strategic'], new MaoqStrategicCommanderAdapter(snapshots[2]!.identity.contentHash, snapshots.slice(0, 2).map(item => item.identity.contentHash)))
  ctx.llm.registerAdapter(['mock-tactic'], new MaoqStrategicCommanderAdapter(snapshots[2]!.identity.contentHash, snapshots.slice(0, 2).map(item => item.identity.contentHash), true))
  ctx.subagents.registerProvider(new FreshStructuredProvider())
}
