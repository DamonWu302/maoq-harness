export const NS = 'maoqTools'

export const zh = {
  'source.title': '查看快照数据源',
  'generate.title': '生成交易日快照',
  'list.title': '查看快照目录',
  'inspect.title': '核验单日快照',
  'strategy.title': 'MAOQ 战略研判',
  'decision.title': 'MAOQ 风险决策会',
  'row.running': '正在执行',
  'row.failed': '执行失败',
  'row.stopped': '执行已中止',
  'row.result': '结构化结果',
  'row.inspect': '查看原始调用',
  'settings.nav': 'MAOQ',
  'settings.title': '研判引擎',
  'settings.intro': '控制下一次战略研判的调用深度与议事组模型。独立风控否决在两种模式下始终保留。',
  'settings.mode': '分析模式',
  'settings.quick': '快速研判',
  'settings.quickDetail': '2 次调用：统帅综合 + 独立风控',
  'settings.deep': '深度研判',
  'settings.deepDetail': '所选专家并行 + 统帅综合 + 独立风控',
  'settings.model': '议事组模型',
  'settings.modelHint': '影响专家、综合与风控子 Agent，不改变外层统帅模型。',
  'settings.effort': '推理强度',
  'settings.save': '保存议事组配置',
  'settings.saving': '保存中…',
  'settings.saved': '已保存，将用于下一次研判。',
  'settings.unavailable': 'MAOQ 设置尚未由主机提供。',
  'settings.readOnly': '当前设置文档只读。',
  'settings.failed': '保存失败，请重试。',
} satisfies Record<string, string>

export type MaoqToolKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { maoqTools: MaoqToolKey }
}

export const en = {
  'source.title': 'Check snapshot sources',
  'generate.title': 'Generate trading-day snapshots',
  'list.title': 'Browse snapshot catalog',
  'inspect.title': 'Verify one snapshot',
  'strategy.title': 'MAOQ strategic analysis',
  'decision.title': 'MAOQ risk council',
  'row.running': 'Running',
  'row.failed': 'Failed',
  'row.stopped': 'Stopped',
  'row.result': 'Structured result',
  'row.inspect': 'Inspect raw call',
  'settings.nav': 'MAOQ',
  'settings.title': 'Analysis engine',
  'settings.intro': 'Control the next strategic run depth and council model. Independent risk veto remains active in both modes.',
  'settings.mode': 'Analysis mode',
  'settings.quick': 'Quick analysis',
  'settings.quickDetail': '2 calls: commander synthesis + independent risk',
  'settings.deep': 'Deep analysis',
  'settings.deepDetail': 'Selected specialists in parallel + synthesis + independent risk',
  'settings.model': 'Council model',
  'settings.modelHint': 'Affects specialist, synthesis, and risk children, not the outer commander.',
  'settings.effort': 'Reasoning effort',
  'settings.save': 'Save council configuration',
  'settings.saving': 'Saving…',
  'settings.saved': 'Saved. The next analysis will use this configuration.',
  'settings.unavailable': 'MAOQ settings are not available from the host yet.',
  'settings.readOnly': 'The settings document is read-only.',
  'settings.failed': 'Save failed. Please try again.',
} satisfies Record<MaoqToolKey, string>
