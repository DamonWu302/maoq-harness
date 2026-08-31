/** Bounded model tools over immutable MAOQ snapshot acquisition and storage. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, type ToolCallView, type ToolResultView } from '@deepseek-ai/dsh-tools'
import { summarizeMarketSnapshot, type MarketSnapshotSummary } from '@deepseek-ai/dsh-market-snapshot'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Cordis plugin name. */
export const name = 'tool-maoq-snapshot'
/** Required services for tool registration, snapshot operations, and prompt guidance. */
export const inject = ['tools', 'marketSnapshots', 'systemPrompt']

/** Stable model guidance for fact acquisition before strategy interpretation. */
export const MAOQ_SNAPSHOT_PROMPT_TEXT =
  'Use maoq_snapshot_sources before acquisition when the source is unknown. Generate snapshots only when the user requests fresh immutable facts or a strategic question lacks exact hashes. Preserve the requested cutoff, use the smallest sufficient window, and never treat generation as analysis. Use maoq_snapshot_list and maoq_snapshot_inspect to recover exact hashes; then pass explicit current and history hashes to maoq_analyze_strategy. Snapshot tools cannot delete facts, change source data, rank stocks, or place orders.'

/** Deployment limits and source allowlist for model-triggered acquisition. */
export interface Config {
  /** Adapters the model may invoke for generation. */
  allowedAdapters?: string[]
  /** Largest number of snapshots one generation call may build. */
  maxGenerateCount?: number
  /** Largest number of summaries one list call may return. */
  maxListCount?: number
  /** Largest number of local content files a list call may verify. */
  maxScanFiles?: number
  /** Tool pipeline timeout budget for one generation call. */
  generateTimeoutMs?: number
}

/** Loader schema for model-triggered snapshot limits. */
export const Config: z<Config> = z.object({
  allowedAdapters: z.array(z.string()).default(['long-short-stock-mysql']),
  maxGenerateCount: z.number().min(1).max(30).default(10),
  maxListCount: z.number().min(1).max(100).default(20),
  maxScanFiles: z.number().min(1).max(1000).default(500),
  generateTimeoutMs: z.number().min(1000).max(1_800_000).default(600_000),
})

type ResolvedConfig = Required<Config>
const HASH = /^[a-f0-9]{64}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function assertDate(value: string, field: string): void {
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${field} must be an ISO calendar date`)
  }
}

function assertTimestamp(value: string): void {
  if (!value.includes('T') || !Number.isFinite(Date.parse(value))) {
    throw new Error('cutoffTime must be an ISO timestamp with an explicit offset')
  }
}

function assertPositiveInteger(value: number, field: string, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${field} must be an integer from 1 through ${String(maximum)}`)
  }
}

function render(value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function presentCall(title: string): ToolCallView {
  return { card: 'generic', title }
}

function presentResult(): ToolResultView {
  return { card: 'generic' }
}

function allowAdapter(config: ResolvedConfig, adapterName: string): void {
  if (!config.allowedAdapters.includes(adapterName)) {
    throw new Error(`market snapshot adapter ${JSON.stringify(adapterName)} is not allowed for model-triggered generation`)
  }
}

/** Register bounded source, generation, catalog, and inspection tools. */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  for (const [field, value, maximum] of [
    ['maxGenerateCount', resolved.maxGenerateCount, 30],
    ['maxListCount', resolved.maxListCount, 100],
    ['maxScanFiles', resolved.maxScanFiles, 1000],
  ] as const) assertPositiveInteger(value, field, maximum)
  if (new Set(resolved.allowedAdapters).size !== resolved.allowedAdapters.length) {
    throw new Error('allowedAdapters must not contain duplicates')
  }
  ctx.systemPrompt.section({
    name: 'tool:maoq-snapshot',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: MAOQ_SNAPSHOT_PROMPT_TEXT,
  })

  ctx.tools.register(defineTool({
    name: 'maoq_snapshot_sources',
    description: 'List registered immutable market snapshot sources and whether each supports recent-session discovery. This tool performs no acquisition.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { sources: { type: 'json', required: true } } },
      render: (_args, value) => render(value),
    },
    execute: () => Promise.resolve({
      sources: ctx.marketSnapshots.describeAdapters().map(source => ({
        ...source,
        generationAllowed: resolved.allowedAdapters.includes(source.name),
      })),
    }),
    presentCall: () => presentCall('MAOQ snapshot sources'),
    presentResult,
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_snapshot_generate',
    description: 'Discover and persist a bounded window of recent quality-approved immutable market snapshots. The cutoff and source versions are exact; this tool does not analyze or rank stocks.',
    parameters: {
      adapterName: { type: 'string', required: true, description: 'Registered and deployment-allowed source name.' },
      beforeOrOn: { type: 'string', required: true, description: 'Newest allowed trading date in YYYY-MM-DD form.' },
      cutoffTime: { type: 'string', required: true, description: 'Evidence cutoff as an ISO timestamp with explicit offset.' },
      count: { type: 'integer', required: true, description: 'Number of consecutive quality-approved sessions to generate.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          adapterName: { type: 'string', required: true },
          generated: { type: 'json', required: true },
          currentHash: { type: 'string', required: true },
          historyHashes: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => render(value),
    },
    timeoutMs: resolved.generateTimeoutMs,
    async execute(args, exec) {
      allowAdapter(resolved, args.adapterName)
      assertDate(args.beforeOrOn, 'beforeOrOn')
      assertTimestamp(args.cutoffTime)
      assertPositiveInteger(args.count, 'count', resolved.maxGenerateCount)
      const identities = await ctx.marketSnapshots.discoverRecent(args.adapterName, {
        beforeOrOn: args.beforeOrOn,
        cutoffTime: args.cutoffTime,
        limit: args.count,
      })
      const generated: MarketSnapshotSummary[] = []
      for (const identity of identities) {
        exec.signal.throwIfAborted()
        generated.push(summarizeMarketSnapshot(await ctx.marketSnapshots.build(args.adapterName, identity)))
      }
      const current = generated.at(-1)
      if (current === undefined) throw new Error('market snapshot source returned an empty discovery window')
      return {
        adapterName: args.adapterName,
        generated: generated as unknown as JsonValue,
        currentHash: current.contentHash,
        historyHashes: generated.slice(0, -1).map(item => item.contentHash),
      }
    },
    presentCall: () => presentCall('Generate MAOQ snapshots'),
    presentResult,
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_snapshot_list',
    description: 'Verify and list locally stored immutable snapshot summaries with exact hashes. Results are newest first and never select a snapshot implicitly.',
    parameters: {
      limit: { type: 'integer', required: true, description: 'Maximum summaries to return.' },
      beforeOrOn: { type: 'string', description: 'Optional inclusive trading-date ceiling in YYYY-MM-DD form.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          snapshots: { type: 'json', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => render(value),
    },
    async execute(args) {
      assertPositiveInteger(args.limit, 'limit', resolved.maxListCount)
      if (args.beforeOrOn !== undefined) assertDate(args.beforeOrOn, 'beforeOrOn')
      const all = await ctx.marketSnapshots.listSummaries(resolved.maxScanFiles)
      const ceiling = args.beforeOrOn
      const eligible = ceiling === undefined
        ? all
        : all.filter(item => item.tradingDate <= ceiling)
      return { snapshots: eligible.slice(0, args.limit) as unknown as JsonValue, truncated: eligible.length > args.limit }
    },
    presentCall: () => presentCall('List MAOQ snapshots'),
    presentResult,
  }))

  ctx.tools.register(defineTool({
    name: 'maoq_snapshot_inspect',
    description: 'Load and verify one immutable market snapshot by exact SHA-256 hash, returning bounded identity and quality metadata rather than all stock rows.',
    parameters: {
      hash: { type: 'string', required: true, description: 'Exact lowercase snapshot SHA-256 content hash.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'json', required: true },
          identity: { type: 'json', required: true },
          quality: { type: 'json', required: true },
        },
      },
      render: (_args, value) => render(value),
    },
    async execute(args) {
      if (!HASH.test(args.hash)) throw new Error('snapshot hash must be lowercase SHA-256')
      const snapshot = await ctx.marketSnapshots.getByHash(args.hash)
      if (snapshot === undefined) throw new Error(`market snapshot ${args.hash} was not found`)
      return {
        summary: summarizeMarketSnapshot(snapshot) as unknown as JsonValue,
        identity: snapshot.identity as unknown as JsonValue,
        quality: snapshot.quality as unknown as JsonValue,
      }
    },
    presentCall: () => presentCall('Inspect MAOQ snapshot'),
    presentResult,
  }))
}
