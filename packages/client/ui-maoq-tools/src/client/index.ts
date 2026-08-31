import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { MaoqToolRow, MAOQ_TOOL_TITLES } from './MaoqToolRow.tsx'
import { en, NS, zh } from './locales.ts'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-maoq-tools: dictionaries')
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const toolName of Object.keys(MAOQ_TOOL_TITLES)) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: toolName, locale: NS }, MaoqToolRow)
    }
  })
}

export { MaoqToolRow, MAOQ_TOOL_TITLES }
