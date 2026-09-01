import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { fixtureHistoryAdapter } from '../../fixtures.ts'

function toolResult(options: GenerateOptions): string {
  return options.messages.at(-1)?.content.filter(block => block.type === 'tool-result').flatMap(block => block.content)
    .filter(block => block.type === 'text').map(block => block.text).join('') ?? ''
}

class TacticCommanderAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const result = toolResult(options)
    if (result.length === 0) {
      const args = JSON.stringify({
        adapterName: 'fixture-history',
        tacticId: 'regime_signed_breakout_pullback',
        startDate: '2026-01-01',
        endDate: '2026-03-05',
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('maoq-tactic-loader-call'), name: 'maoq_tactic_backtest', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('maoq-tactic-loader-call'), name: 'maoq_tactic_backtest', arguments: args } }
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

export const name = 'mock-maoq-tactic-runtime'
export const inject = ['llm', 'marketTacticHistory']

export function apply(ctx: Context): void {
  ctx.marketTacticHistory.register(fixtureHistoryAdapter())
  ctx.llm.registerAdapter(['mock-tactic'], new TacticCommanderAdapter())
}
