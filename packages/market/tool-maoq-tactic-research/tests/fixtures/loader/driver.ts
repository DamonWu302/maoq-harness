#!/usr/bin/env node
/** Drive one fixed tactic evaluation through the real Loader and agent loop. */

import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('MAOQ tactic Loader driver requires a config path')

const ctx = await boot('maoq-tactic-loader-smoke', resolveConfigPath(configPath, undefined))
try {
  const result = await runFixtureTurn(ctx, { task: 'Evaluate one fixed MAOQ trend tactic.' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  await ctx.fiber.dispose()
}
