/** Package-owned invariant companion for the read-only MySQL snapshot adapter. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-snapshot-mysql'

export const name = 'market-snapshot-mysql-invariant'
export const inject = ['invariants']

// No event invariant: SELECT-only SQL and snapshot validation are operation boundaries.
const install: InvariantInstaller = () => {}

/** Register the package's explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
