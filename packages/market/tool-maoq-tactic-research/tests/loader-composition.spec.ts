import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/loader/driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/loader/cordis.yml', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('MAOQ tactic research through a real Loader composition', () => {
  it('returns one immutable research report through the agent tool loop', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'MAOQ tactic research composition smoke',
      tempDirPrefix: 'maoq-tactic-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).not.toContain('UNHANDLED')
    const recorded = JSON.parse(stdout) as { output: string }
    const normalized = recorded.output.replace(/[0-9a-f]{64}/g, '<history-hash>')
    expect(normalized).toContain('"tacticId": "regime_signed_breakout_pullback"')
    expect(normalized).toContain('"sessions": 64')
    expect(normalized).toContain('"decision": "research"')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
