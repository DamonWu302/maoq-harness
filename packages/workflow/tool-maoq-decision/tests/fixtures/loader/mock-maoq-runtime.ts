import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ResolvedSubagentStartRequest, SubagentProvider, SubagentRun } from '@deepseek-ai/dsh-subagent'

function textContent(options: GenerateOptions): string {
  return options.messages.at(-1)?.content
    .filter(block => block.type === 'tool-result')
    .flatMap(block => block.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('') ?? ''
}

class MaoqCommanderAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const result = textContent(options)
    if (result.length === 0) {
      const args = JSON.stringify({
        objective: 'Find the least-resistance short-line battlefield.',
        specialists: ['emotion_cycle', 'sector_battlefield'],
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('maoq-loader-call'), name: 'maoq_decide', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('maoq-loader-call'), name: 'maoq_decide', arguments: args } }
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

function structured(request: ResolvedSubagentStartRequest): unknown {
  const prompt = request.prompt
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
  const label = prompt.includes('role field must be exactly: emotion_cycle')
    ? 'emotion_cycle'
    : prompt.includes('role field must be exactly: sector_battlefield')
      ? 'sector_battlefield'
      : undefined
  if (label !== undefined) {
    return {
      role: label,
      conclusion: label === 'emotion_cycle' ? 'Recovery is narrow.' : 'Low-price leaders have the strongest cohesion.',
      evidence: ['two-day breadth improvement'],
      counterEvidence: ['index breadth remains weak'],
      invalidationConditions: ['leader fails on expanding volume'],
      confidence: 0.68,
    }
  }
  if (prompt.includes('You are the MAOQ commander. Synthesize')) {
    return {
      marketRegime: 'narrow emotion recovery',
      principalContradiction: 'improving risk appetite versus weak broad participation',
      battlefield: 'low-price leaders',
      tactic: 'regime_signed_breakout_pullback',
      action: 'watch',
      candidates: [{ symbol: 'PAPER-001', role: 'sentiment leader', thesis: 'strongest cohort cohesion' }],
      confidence: 0.62,
      invalidationConditions: ['cohort breadth reverses'],
      selectedSpecialists: ['emotion_cycle', 'sector_battlefield'],
    }
  }
  return {
    approved: false,
    verdict: 'veto',
    reasons: ['broad participation is not yet sufficient'],
    hardLimits: ['paper decision only'],
    invalidationConditions: ['breadth confirms for two sessions'],
  }
}

class FreshStructuredProvider implements SubagentProvider {
  readonly name = 'fresh'
  readonly capabilities = { agentOptions: false, outputSchema: true, depthLimit: false, toolFilter: false, persona: false }
  readonly inheritsParentContext = false
  private sequence = 0

  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    this.sequence += 1
    return Promise.resolve({
      id: SessionId(`maoq-child-${this.sequence}`),
      localAgent: undefined,
      result: Promise.resolve({ output: [], structured: structured(request), stopReason: 'completed' }),
      dispose: async () => {},
    })
  }
}

export const name = 'mock-maoq-runtime'
export const inject = ['llm', 'subagents']

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['mock'], new MaoqCommanderAdapter())
  ctx.subagents.registerProvider(new FreshStructuredProvider())
}
