/** Package-owned invariant companion for immutable market news batches. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-market-news-web'

export const name = 'market-news-web-invariant'
export const inject = ['invariants']

// No event invariant: acquisition and content-address verification are operation boundaries.
const install: InvariantInstaller = () => {}

/** Register the package's explained invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
