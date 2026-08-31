// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { MaoqToolRow, MAOQ_TOOL_TITLES } from '../src/client/MaoqToolRow.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

type RowProps = Parameters<typeof MaoqToolRow>[0]
const t = ((key: keyof typeof zh) => zh[key]) as RowProps['t']

function props(toolName: keyof typeof MAOQ_TOOL_TITLES, args: Record<string, unknown>): RowProps {
  const block: ToolResultNode = {
    kind: 'tool-result', seq: 2, time: 2, callTime: 1, callId: 'call-1',
    call: { name: toolName, argsRaw: JSON.stringify(args) },
    content: [{ type: 'text', text: '{"ok":true}' }], isError: false, subCalls: [],
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
})
