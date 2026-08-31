import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/loader/driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/loader/cordis.yml', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('MAOQ snapshot tools through a real Loader composition', () => {
  it('generates an exact recent window through the agent tool loop', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'MAOQ snapshot composition smoke',
      tempDirPrefix: 'maoq-snapshot-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).not.toContain('UNHANDLED')
    const recorded = JSON.parse(stdout) as { output: string }
    const normalized = recorded.output.replace(/[0-9a-f]{64}/g, '<snapshot-hash>')
    expect(normalized).toContain('"currentHash": "<snapshot-hash>"')
    expect(normalized).toContain('"tradingDate": "2026-08-28"')
    expect(normalized).toContain('"historyHashes": [')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
