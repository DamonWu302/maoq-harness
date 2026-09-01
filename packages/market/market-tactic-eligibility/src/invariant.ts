/** Package-owned invariant companion for `@deepseek-ai/dsh-market-tactic-eligibility`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-tactic-eligibility'

export const name = 'market-tactic-eligibility-invariant'
export const inject = ['invariants']

// No runtime invariant: public evaluation is pure and promotion status is host-owned immutable data.
const install: InvariantInstaller = () => {}

/** Register the package's empty, explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
