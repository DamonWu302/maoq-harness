import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { STRATEGIC_ENGINE_VERSION } from '@deepseek-ai/dsh-market-strategic-state'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ResolvedConfig } from './index.ts'
import {
  evaluateStrategicStateFreshness,
  StrategicDecisionStore,
  STRATEGIC_WORKFLOW_VERSION,
  summarizeStrategicDecision,
  type StrategicDecisionRecord,
} from './strategic-store.ts'

interface FreshnessArgs {
  readonly asOfTime?: string
  readonly currentSnapshotHash?: string
}

function render(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= maxChars) return text
  const suffix = '\n… [truncated]'
  return maxChars <= suffix.length ? suffix.slice(0, maxChars) : `${text.slice(0, maxChars - suffix.length)}${suffix}`
}

function resultView(_args: unknown, _result: { content: ContentBlock[]; isError: boolean }): ToolResultView {
  return { card: 'generic' }
}

/** Register zero-agent queries over persisted MAOQ strategic decision mirrors. */
export function registerStrategicStateQueryTools(ctx: Context, getConfig: () => ResolvedConfig): void {
  const store = (): StrategicDecisionStore => new StrategicDecisionStore(getConfig().stateRoot)
  const freshness = (record: StrategicDecisionRecord, args: FreshnessArgs) => evaluateStrategicStateFreshness(record, {
    evaluatedAt: args.asOfTime ?? new Date().toISOString(),
    ...(args.currentSnapshotHash === undefined ? {} : { currentSnapshotHash: args.currentSnapshotHash }),
    featureEngineVersion: STRATEGIC_ENGINE_VERSION,
    workflowVersion: STRATEGIC_WORKFLOW_VERSION,
    analysisMode: getConfig().analysisMode,
    subagentProvider: getConfig().subagentProvider,
  })
  const freshnessParameters = {
    asOfTime: { type: 'string' as const, description: 'Optional ISO time for replayable freshness evaluation; defaults to the current host time.' },
    currentSnapshotHash: { type: 'string' as const, description: 'Optional latest snapshot hash. A different hash makes the persisted state historical.' },
  }

  ctx.tools.register(defineTool({
    name: 'maoq_state_latest',
    description: 'Read the newest persisted MAOQ strategic decision mirror without starting agents or recomputing market data. Always inspect freshness.currentUseAllowed before using it as a current decision.',
    parameters: freshnessParameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          freshness: { type: 'json', required: true },
          state: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: render(value, getConfig().maxResultChars) }],
    },
    async execute(args) {
      const record = await store().latest(getConfig().maxStateFiles)
      return {
        found: record !== undefined,
        freshness: (record === undefined ? null : freshness(record, args)) as unknown as JsonValue,
        state: (record ?? null) as unknown as JsonValue,
      }
    },
    presentCall: (): ToolCallView => ({ card: 'generic', title: 'Read latest MAOQ market state' }),
    presentResult: resultView,
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_state_history',
    description: 'List recent persisted MAOQ strategic state summaries without starting agents. Use this for multi-day review and trend questions.',
    parameters: {
      limit: { type: 'integer', required: true, description: 'Number of newest state summaries to return (1-100).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'integer', required: true },
          states: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: render(value, getConfig().maxResultChars) }],
    },
    async execute(args) {
      if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
        throw new TypeError('MAOQ state history limit must be an integer from 1 to 100')
      }
      const records = await store().list(args.limit, getConfig().maxStateFiles)
      const states = records.map(summarizeStrategicDecision)
      return { count: states.length, states: states as unknown as JsonValue }
    },
    presentCall: (args): ToolCallView => ({ card: 'generic', title: 'Read MAOQ state history', rawInput: `Latest ${String(args.limit)} states` }),
    presentResult: resultView,
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_state_get',
    description: 'Read one full persisted MAOQ strategic decision mirror by decision ID without starting agents. Always inspect freshness.currentUseAllowed before using it as a current decision.',
    parameters: {
      decisionId: { type: 'string', required: true, description: 'Lowercase SHA-256 strategic decision ID.' },
      ...freshnessParameters,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          freshness: { type: 'json', required: true },
          state: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: render(value, getConfig().maxResultChars) }],
    },
    async execute(args) {
      const record = await store().get(args.decisionId)
      return {
        found: record !== undefined,
        freshness: (record === undefined ? null : freshness(record, args)) as unknown as JsonValue,
        state: (record ?? null) as unknown as JsonValue,
      }
    },
    presentCall: (args): ToolCallView => ({ card: 'generic', title: 'Read one MAOQ market state', rawInput: args.decisionId }),
    presentResult: resultView,
  }))
}
