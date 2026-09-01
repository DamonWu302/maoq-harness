import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { MaoqToolRow, MAOQ_TOOL_TITLES } from './MaoqToolRow.tsx'
import { MaoqSettingsSection } from './MaoqSettingsSection.tsx'
import { en, NS, zh } from './locales.ts'

export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-maoq-tools: dictionaries')
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const toolName of Object.keys(MAOQ_TOOL_TITLES)) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: toolName, locale: NS }, MaoqToolRow)
    }
  })
  const decision = ctx.settingsScope.bind<MaoqDecisionSettings>({ namespace: 'maoq-decision' })
  const council = ctx.settingsScope.bind<CodexCouncilSettings>({ namespace: 'subagent-codex-codex' })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'maoq',
    order: 15,
    label: () => ctx.locale.bind(NS)('settings.nav'),
    locale: NS,
    inject: () => ({ decision, council }),
  }, MaoqSettingsSection))
}

/** Browser-editable MAOQ decision policy fields. */
export interface MaoqDecisionSettings {
  /** Strategic-analysis depth used by the next tool call. */
  analysisMode: 'quick' | 'deep'
}

/** Browser-editable Codex council route fields. */
export interface CodexCouncilSettings {
  /** Codex model used by the next council child. */
  model?: string
  /** Codex reasoning effort used by the next council child. */
  reasoningEffort?: string
}

export { MaoqSettingsSection, MaoqToolRow, MAOQ_TOOL_TITLES }
