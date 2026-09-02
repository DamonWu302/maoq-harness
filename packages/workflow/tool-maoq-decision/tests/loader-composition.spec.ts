import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/loader/driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/loader/cordis.yml', import.meta.url))
const strategicConfigPath = fileURLToPath(new URL('./fixtures/loader-strategic/cordis.yml', import.meta.url))
const tacticConfigPath = fileURLToPath(new URL('./fixtures/loader-tactic/cordis.yml', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('MAOQ decision through a real Loader composition', () => {
  it('records dynamic delegation, structured synthesis, and an independent veto', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'MAOQ decision composition smoke',
      tempDirPrefix: 'maoq-decision-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).not.toContain('UNHANDLED')
    const recorded = JSON.parse(stdout) as { output: string }
    const normalized = recorded.output.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<run-id>')
    expect(normalized).toContain('MAOQ independent risk review vetoed this paper decision.')
    expect(normalized).toContain('"specialists": [\n    "emotion_cycle",\n    "sector_battlefield"')
    expect(normalized).toContain('"principalContradiction": "improving risk appetite versus weak broad participation"')
    expect(normalized).toContain('"tactic": "regime_signed_breakout_pullback"')
    expect(normalized).toContain('"verdict": "veto"')
    expect(normalized).not.toContain('market_regime')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('records deterministic evidence and resolved Mao method attribution on the P2 path', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'MAOQ strategic state composition smoke',
      tempDirPrefix: 'maoq-strategic-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: strategicConfigPath,
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).not.toContain('UNHANDLED')
    const recorded = JSON.parse(stdout) as { output: string }
    const normalized = recorded.output.replace(/[0-9a-f]{64}/g, '<snapshot-hash>').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<run-id>')
    expect(normalized).toContain('MAOQ strategic state is approved by independent risk review.')
    expect(normalized).toContain('"sourceTitle": "《矛盾论》"')
    expect(normalized).toContain('"attributionKind": "paraphrase"')
    expect(normalized).toContain('"principalContradiction": "风险偏好修复与分歧压力之间的矛盾"')
    expect(normalized).not.toContain('"candidates"')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('routes the complete hard-feasible catalog through a dynamic expert council and independent review', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'MAOQ tactic selection composition smoke',
      tempDirPrefix: 'maoq-tactic-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: tacticConfigPath,
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).not.toContain('UNHANDLED')
    const recorded = JSON.parse(stdout) as { output: string }
    const normalized = recorded.output.replace(/[0-9a-f]{64}/g, '<content-hash>').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<run-id>')
    expect(normalized).toContain('"agentsStarted": 5')
    expect(normalized).toContain('"status": "approved"')
    expect(normalized).toContain('"scope": "research"')
    expect(normalized).toContain('"finalPrimaryTacticId": "correlation_cluster_sector_rotation"')
    expect(normalized).toContain('"unavailableCalls": 5')
    expect(normalized).not.toContain('"scope": "paper"')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
