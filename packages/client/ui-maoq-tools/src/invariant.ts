import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-maoq-tools'
export const name = 'client-ui-maoq-tools-invariant'
export const inject = ['invariants']
// No runtime invariant: locale and keyed-slot registrations are registry-owned and reversible.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
