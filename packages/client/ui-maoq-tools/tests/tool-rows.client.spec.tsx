// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { MaoqToolRow, MAOQ_TOOL_TITLES } from '../src/client/MaoqToolRow.tsx'
import { MaoqSettingsSection } from '../src/client/MaoqSettingsSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

type RowProps = Parameters<typeof MaoqToolRow>[0]
const t = ((key: keyof typeof zh) => zh[key]) as RowProps['t']

function props(toolName: keyof typeof MAOQ_TOOL_TITLES, args: Record<string, unknown>, result = '{"ok":true}'): RowProps {
  const block: ToolResultNode = {
    kind: 'tool-result', seq: 2, time: 2, callTime: 1, callId: 'call-1',
    call: { name: toolName, argsRaw: JSON.stringify(args) },
    content: [{ type: 'text', text: result }], isError: false, subCalls: [],
  }
  return {
    callId: 'call-1', toolName, block, sessionId: 'session-1',
    openFile: vi.fn(), useSessions: () => undefined, inspect: vi.fn(), t,
  } as unknown as RowProps
}

describe('MAOQ business tool rows', () => {
  it.each([
    ['maoq_snapshot_sources', '查看快照数据源'],
    ['maoq_snapshot_generate', '生成交易日快照'],
    ['maoq_snapshot_list', '查看快照目录'],
    ['maoq_snapshot_inspect', '核验单日快照'],
    ['maoq_analyze_strategy', 'MAOQ 战略研判'],
    ['maoq_decide', 'MAOQ 风险决策会'],
    ['maoq_state_latest', '读取最新市场战略状态'],
    ['maoq_state_history', '查看历史战略状态'],
    ['maoq_state_get', '读取指定战略状态'],
  ] as const)('renders %s with a business-language title', (toolName, title) => {
    render(<MaoqToolRow {...props(toolName, { objective: '判断主攻方向', limit: 10 })} />)
    expect(screen.getByText(title)).toBeTruthy()
  })

  it('shows the requested trading-day window and expands the structured result', () => {
    render(<MaoqToolRow {...props('maoq_snapshot_generate', { count: 10, beforeOrOn: '2026-08-28' })} />)
    expect(screen.getByText('10 日 · 2026-08-28')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /生成交易日快照/ }))
    expect(screen.getByLabelText('结构化结果').textContent).toContain('"ok":true')
  })

  it.each([
    ['fresh', '当前可用'],
    ['stale', '已失效 · 仅供复盘'],
  ] as const)('surfaces %s strategic-state freshness before expansion', (status, label) => {
    render(<MaoqToolRow {...props('maoq_state_latest', {}, JSON.stringify({ freshness: { status } }))} />)
    expect(screen.getByText(label)).toBeTruthy()
  })
})

describe('MAOQ settings section', () => {
  it('switches analysis mode and saves the council model for the next run', () => {
    const set = vi.fn(() => Promise.resolve())
    const mutate = vi.fn(() => Promise.resolve())
    const scope = <T,>(value: T, write: { set?: typeof set; mutate?: typeof mutate }) => {
      const snapshot = { status: 'ready' as const, value, base: value, user: {}, revision: 0, writable: true, mode: 'host' as const }
      return {
        subscribe: () => () => {},
        getSnapshot: () => snapshot,
        set: write.set ?? vi.fn(() => Promise.resolve()),
        mutate: write.mutate ?? vi.fn(() => Promise.resolve()),
        unset: vi.fn(() => Promise.resolve()),
      }
    }
    render(<MaoqSettingsSection {...({
      close: vi.fn(), t,
      decision: scope({ analysisMode: 'quick' as const }, { set }),
      council: scope({ model: 'gpt-5.6-luna', reasoningEffort: 'low' }, { mutate }),
    } as unknown as Parameters<typeof MaoqSettingsSection>[0])} />)
    fireEvent.click(screen.getByRole('button', { name: /深度研判/ }))
    expect(set).toHaveBeenCalledWith('analysisMode', 'deep')
    fireEvent.change(screen.getByLabelText('议事组模型'), { target: { value: 'gpt-5.6-terra' } })
    fireEvent.change(screen.getByLabelText('推理强度'), { target: { value: 'medium' } })
    fireEvent.click(screen.getByRole('button', { name: '保存议事组配置' }))
    expect(mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['model'], value: 'gpt-5.6-terra' },
      { op: 'set', path: ['reasoningEffort'], value: 'medium' },
    ])
  })
})
