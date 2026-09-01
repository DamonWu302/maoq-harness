import { MarketSnapshotStore, type MarketSnapshot } from '@deepseek-ai/dsh-market-snapshot'
import { evaluateP2StrategicCanary } from '@deepseek-ai/dsh-market-strategic-state'
import { resolve } from 'node:path'

function integerArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be followed by a positive integer`)
  return value
}

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = process.argv[index + 1]?.trim()
  if (value === undefined || value.length === 0) throw new TypeError(`${name} must be followed by a value`)
  return value
}

const root = resolve(stringArgument('--root', '.maoq/snapshots'))
const evaluationDays = integerArgument('--days', 10)
const maxFiles = integerArgument('--max-files', 500)
const store = new MarketSnapshotStore(root)
const summaries = await store.listSummaries(maxFiles)
const snapshots = (await Promise.all(summaries.map(summary => store.getByHash(summary.contentHash))))
  .filter((snapshot): snapshot is MarketSnapshot => snapshot !== undefined)
const report = evaluateP2StrategicCanary(snapshots, {
  evaluationDays,
  requiredSourceAdapter: 'long-short-stock-mysql',
  requiredMappingVersion: 'long-short-stock-v2',
})

process.stdout.write(`${JSON.stringify({ ...report, snapshotRoot: root }, null, 2)}\n`)
if (report.status !== 'passed') process.exitCode = 1
