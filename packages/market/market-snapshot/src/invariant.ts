/** Package-owned invariant companion for `@deepseek-ai/dsh-market-snapshot`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-snapshot'

export const name = 'market-snapshot-invariant'
export const inject = ['invariants']

// No runtime invariant: validation and content verification occur at the adapter and persistence boundaries.
const install: InvariantInstaller = () => {}

/** Register the package's empty, explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
