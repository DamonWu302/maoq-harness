/** Package-owned invariant companion for `@deepseek-ai/dsh-market-tactic-lab`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-tactic-lab'

export const name = 'market-tactic-lab-invariant'
export const inject = ['invariants']

// No runtime invariant: feature and execution APIs are pure and validate every input call.
const install: InvariantInstaller = () => {}

/** Register the package's empty, explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
