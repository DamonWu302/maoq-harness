/**
 * Profile-named Codex one-shot subagent provider. Every accepted run starts a
 * fresh official package-local Codex wrapper with `app-server --stdio` in the
 * delegating Session's workspace and publishes only after an ephemeral thread exists.
 *
 * @module @deepseek-ai/dsh-subagent-codex
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  assertPositiveFinite,
  resolveChildCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import {
  CODEX_RESPONSES_TRANSPORTS,
  CODEX_PERMISSION_MODES,
  DEFAULT_CODEX_PERMISSION_MODE,
  DEFAULT_CODEX_RESPONSES_TRANSPORT,
  DEFAULT_DISPOSE_GRACE_MS,
  codexStartupFailure,
  startCodexRun,
  type CodexPermissionMode,
  type CodexResponsesTransport,
  type CodexRunSpec,
} from './run.ts'
import type {} from '@deepseek-ai/dsh-settings'

export const name = 'subagent-codex'
export const inject = ['subagents', 'subprocess']
/**
 * Resolve the settings namespace owned by one profile-named Codex provider instance.
 * @param providerName - Registered provider route.
 * @returns The provider-specific settings namespace.
 */
export function subagentCodexSettingsNamespace(providerName: string): string {
  return `subagent-codex-${providerName}`
}

const DEFAULT_PROVIDER_NAME = 'codex'

/** Deployment-owned model, permission, environment, and process-release settings. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `codex`). */
  providerName?: string
  /** Native Codex model fixed for this instance; omitted to inherit Codex settings. */
  model?: string
  /** Native Codex reasoning effort fixed for each child turn; omitted to inherit Codex settings. */
  reasoningEffort?: string
  /** Responses transport used by each child process (default `native`). */
  responsesTransport?: CodexResponsesTransport
  /**
   * Explicit environment entries layered over the subprocess seam's
   * credential-scrubbed parent environment.
   */
  env?: Record<string, string>
  /** Native non-interactive permission mode fixed for this Provider instance. */
  permissionMode?: CodexPermissionMode
  /** Grace in milliseconds for app-server process-tree termination. */
  disposeGraceMs?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  responsesTransport: z.union([...CODEX_RESPONSES_TRANSPORTS])
    .default(DEFAULT_CODEX_RESPONSES_TRANSPORT),
  env: z.dict(z.string()).default({}),
  permissionMode: z.union([...CODEX_PERMISSION_MODES])
    .default(DEFAULT_CODEX_PERMISSION_MODE),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

type ResolvedConfig = Omit<Required<Config>, 'model' | 'reasoningEffort'>
  & Pick<Config, 'model' | 'reasoningEffort'>

class CodexProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = {
    agentOptions: false,
    outputSchema: true,
    depthLimit: false,
    toolFilter: false,
    persona: false,
  }
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly getConfig: () => ResolvedConfig,
  ) {}

  start(request: ResolvedSubagentStartRequest) {
    const config = this.getConfig()
    const parentCwd = request.parent.session.header.cwd
    if (parentCwd === undefined) {
      throw new Error(
        'subagent-codex: no working directory for the child — delegate from a parent session that has one',
      )
    }
    let cwd: string
    try {
      cwd = resolveChildCwd(
        'subagent-codex',
        undefined,
        parentCwd,
      )
    } catch (error: unknown) {
      if (request.signal.aborted) {
        throw new Error(
          'subagent-codex: request was aborted before app-server startup',
        )
      }
      throw codexStartupFailure(error)
    }
    const spec: CodexRunSpec = {
      cwd,
      ...config.model === undefined ? {} : { model: config.model },
      ...config.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: config.reasoningEffort },
      responsesTransport: config.responsesTransport,
      permissionMode: config.permissionMode,
      env: config.env,
      disposeGraceMs: config.disposeGraceMs,
      spawn: spawnSpec => this.ctx.subprocess.spawn(spawnSpec),
      onError: (error, stopReason) => {
        this.ctx.logger.warn(
          `subagent-codex "${this.name}": child run failed (${stopReason}): ${error.message}`,
        )
      },
    }
    return startCodexRun(request, spec)
  }
}

/**
 * Register one Profile-named Codex provider.
 * @param ctx - context carrying shared subagent and subprocess services.
 * @param config - registry name, optional model and effort, transport, permission mode, child environment, and disposal grace.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    providerName: config.providerName ?? DEFAULT_PROVIDER_NAME,
    ...config.model === undefined ? {} : { model: config.model },
    ...config.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: config.reasoningEffort },
    responsesTransport: config.responsesTransport ?? DEFAULT_CODEX_RESPONSES_TRANSPORT,
    env: config.env as Record<string, string>,
    permissionMode: config.permissionMode ?? DEFAULT_CODEX_PERMISSION_MODE,
    disposeGraceMs: config.disposeGraceMs as number,
  }
  assertPositiveFinite(
    'subagent-codex',
    'disposeGraceMs',
    resolved.disposeGraceMs,
  )
  if (resolved.disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `subagent-codex: disposeGraceMs must be no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  let source = (): Config => resolved
  const current = (): ResolvedConfig => {
    const value = source()
    return {
      providerName: resolved.providerName,
      ...value.model === undefined ? {} : { model: value.model },
      ...value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort },
      responsesTransport: value.responsesTransport ?? DEFAULT_CODEX_RESPONSES_TRANSPORT,
      env: value.env ?? {},
      permissionMode: value.permissionMode ?? DEFAULT_CODEX_PERMISSION_MODE,
      disposeGraceMs: value.disposeGraceMs ?? DEFAULT_DISPOSE_GRACE_MS,
    }
  }
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, subagentCodexSettingsNamespace(resolved.providerName), Config, resolved, {
      validate: (value) => {
        if ((value.providerName ?? DEFAULT_PROVIDER_NAME) !== resolved.providerName) {
          throw new Error('subagent-codex providerName cannot change through live settings')
        }
      },
      setSource: (next) => { source = next },
      onChange: () => {},
    })
  })
  ctx.subagents.registerProvider(new CodexProvider(
    resolved.providerName,
    ctx,
    current,
  ))
}
