/** Package-owned invariant companion for `@deepseek-ai/dsh-market-snapshot-json`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-snapshot-json'

export const name = 'market-snapshot-json-invariant'
export const inject = ['invariants']

// No runtime invariant: the snapshot service validates adapter identity, content, and persistence.
const install: InvariantInstaller = () => {}

/** Register the package's empty, explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
