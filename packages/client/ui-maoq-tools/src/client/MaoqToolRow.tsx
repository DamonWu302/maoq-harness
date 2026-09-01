import { useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  IconChevronDownOutline14, IconDatabaseOutline16, IconInspectOutline12, IconSparkle16, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MaoqToolKey } from './locales.ts'
import css from './MaoqToolRow.module.css'

export const MAOQ_TOOL_TITLES = {
  maoq_snapshot_sources: 'source.title',
  maoq_snapshot_generate: 'generate.title',
  maoq_snapshot_list: 'list.title',
  maoq_snapshot_inspect: 'inspect.title',
  maoq_analyze_strategy: 'strategy.title',
  maoq_decide: 'decision.title',
  maoq_state_latest: 'stateLatest.title',
  maoq_state_history: 'stateHistory.title',
  maoq_state_get: 'stateGet.title',
} as const satisfies Record<string, MaoqToolKey>

type MaoqToolName = keyof typeof MAOQ_TOOL_TITLES
type RowProps = ToolCallViewProps & PropsLocale<'maoqTools'>
type State = 'running' | 'ok' | 'error' | 'stopped'

function firstLine(text: string): string { return text.split('\n', 1)[0] ?? text }

function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function argsOf(block: ToolCallViewProps['block']): Record<string, unknown> {
  const raw = ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}

function freshnessOf(block: ToolCallViewProps['block']): 'fresh' | 'stale' | undefined {
  if (!('kind' in block)) return undefined
  const text = block.content.find(item => item.type === 'text')?.text
  if (text === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const freshness: unknown = (parsed as Record<string, unknown>)['freshness']
    if (typeof freshness !== 'object' || freshness === null || Array.isArray(freshness)) return undefined
    const status: unknown = (freshness as Record<string, unknown>)['status']
    return status === 'fresh' || status === 'stale' ? status : undefined
  } catch { return undefined }
}

function summary(toolName: MaoqToolName, block: ToolCallViewProps['block'], t: RowProps['t']): string {
  const args = argsOf(block)
  if (toolName === 'maoq_snapshot_generate') return `${scalar(args['count'])} 日 · ${scalar(args['beforeOrOn'])}`
  if (toolName === 'maoq_snapshot_list') {
    return `最近 ${scalar(args['limit'])} 条${typeof args['beforeOrOn'] === 'string' ? ` · 截至 ${args['beforeOrOn']}` : ''}`
  }
  if (toolName === 'maoq_snapshot_inspect') return typeof args['hash'] === 'string' ? `${args['hash'].slice(0, 12)}…` : ''
  if (toolName === 'maoq_state_history') return `最近 ${scalar(args['limit'])} 条`
  if (toolName === 'maoq_state_get' || toolName === 'maoq_state_latest') {
    const freshness = freshnessOf(block)
    if (freshness !== undefined) return t(freshness === 'fresh' ? 'state.fresh' : 'state.stale')
    if (toolName === 'maoq_state_get' && typeof args['decisionId'] === 'string') return `${args['decisionId'].slice(0, 12)}…`
    return t('state.mirror')
  }
  if (toolName === 'maoq_analyze_strategy' || toolName === 'maoq_decide') return typeof args['objective'] === 'string' ? firstLine(args['objective']) : ''
  return '不可变市场事实'
}

function resultOf(block: ToolCallViewProps['block']): string | null {
  if (!('kind' in block)) return null
  const text = block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n')
  return text || null
}

function stateOf(block: ToolCallViewProps['block']): State {
  if (!('kind' in block)) return 'running'
  if (block.error?.code === 'interrupted') return 'stopped'
  return block.isError ? 'error' : 'ok'
}

function leading(toolName: MaoqToolName, state: State): ReactNode {
  if (state === 'error') return <StateDot state="error" />
  if (state === 'stopped') return <StateDot state="warning" />
  return toolName.startsWith('maoq_snapshot_') ? <IconDatabaseOutline16 size={14} /> : <IconSparkle16 size={14} />
}

export function MaoqToolRow({ toolName, block, inspect, t }: RowProps) {
  const name = toolName as MaoqToolName
  const [open, setOpen] = useState(false)
  const result = resultOf(block)
  const state = stateOf(block)
  const expandable = result !== null
  const shown = open && expandable
  const toggle = () => { if (expandable) setOpen(value => !value) }
  const keyToggle = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault(); toggle()
  }
  return (
    <div className={css.card} data-tool={name} data-state={state}>
      <div className={css.row} data-expandable={expandable || undefined} data-open={shown || undefined}
        role={expandable ? 'button' : undefined} tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? shown : undefined} onClick={toggle} onKeyDown={keyToggle}>
        <span className={css.leading}>
          <span className={css.idle}>{leading(name, state)}</span>
          {expandable ? <IconChevronDownOutline14 className={css.chevron} /> : null}
        </span>
        {state !== 'ok' ? <span className={css.visuallyHidden}>{t(state === 'running' ? 'row.running' : state === 'error' ? 'row.failed' : 'row.stopped')}</span> : null}
        <span className={css.title}>{t(MAOQ_TOOL_TITLES[name])}</span><span className={css.separator} aria-hidden />
        <span className={`${css.summary} ${state === 'error' ? css.error : ''}`}>{summary(name, block, t)}</span>
      </div>
      {shown ? <pre className={`${css.result} ${state === 'error' ? css.error : ''}`} aria-label={t('row.result')}>{result}</pre> : null}
      {inspect !== undefined ? <button type="button" className={css.inspect} onClick={inspect}><IconInspectOutline12 /> {t('row.inspect')}</button> : null}
    </div>
  )
}
