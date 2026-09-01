/** Package-owned invariant companion for `@deepseek-ai/dsh-market-tactic-routing`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-tactic-routing'

export const name = 'market-tactic-routing-invariant'
export const inject = ['invariants']

// No runtime invariant: scorecard and routing records are immutable pure values.
const install: InvariantInstaller = () => {}

/** Register the package's empty, explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
