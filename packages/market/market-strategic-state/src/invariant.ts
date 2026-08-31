/** Package-owned invariant companion for `@deepseek-ai/dsh-market-strategic-state`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-strategic-state'

export const name = 'market-strategic-state-invariant'
export const inject = ['invariants']

// No runtime invariant: public constructors enforce deterministic input and interpretation boundaries directly.
const install: InvariantInstaller = () => {}

/** Register the package's empty, explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
