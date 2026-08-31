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
} satisfies Record<MaoqToolKey, string>
