/** Package-owned invariant companion for `@deepseek-ai/dsh-maoq-app`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-maoq-app'

/** Cordis companion plugin name. */
export const name = 'maoq-app-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

// No runtime invariant: this static bundle grants no execution authority; the
// decision tool owns validation and deterministic veto enforcement.
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
