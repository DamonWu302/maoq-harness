import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { loadCordisYaml } from '../../../../scripts/cordis-yaml.ts'
import { inject, name } from '../src/invariant.ts'

describe('@deepseek-ai/dsh-maoq-app', () => {
  test('declares the bounded MAOQ profile layer', () => {
    expect(name).toBe('maoq-app-invariant')
    expect(inject).toEqual(['invariants'])
  })

  test('installs the commander policy, market facts, workflow engine, and decision tool', () => {
    const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
    const patches = loadCordisYaml(readFileSync(patchPath, 'utf8')) as Array<Record<string, unknown>>
    const prompt = patches[0] as { config: { persona: string } }
    const workflowEngine = patches[1] as { id: string; disabled: boolean }
    const codexRoute = patches[2] as {
      id: string
      config: { reuseCodexLogin: boolean; providers: Record<string, unknown> }
    }
    const clientInsertion = patches[3] as { insert: Array<{ id: string; name: string }> }
    const insertion = patches[4] as { insert: Array<{ id: string; name: string; config?: unknown }> }

    expect(prompt.config.persona).toContain('smallest sufficient specialist council')
    expect(prompt.config.persona).toContain('final veto power')
    expect(workflowEngine).toEqual({ id: 'workflow-worker-thread', disabled: false })
    expect(codexRoute).toEqual({
      id: 'llm-pi-ai',
      config: { reuseCodexLogin: true, providers: { 'openai-codex': {} } },
    })
    expect(clientInsertion.insert).toContainEqual({
      id: 'ui-maoq-tools',
      name: '@deepseek-ai/dsh-client-ui-maoq-tools',
    })
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'market-snapshot',
      name: '@deepseek-ai/dsh-market-snapshot',
      config: { root: '.maoq/snapshots' },
    }))
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'market-snapshot-json',
      name: '@deepseek-ai/dsh-market-snapshot-json',
      config: { root: '.maoq/imports' },
    }))
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'market-news-web',
      name: '@deepseek-ai/dsh-market-news-web',
      config: { root: '.maoq/news' },
    }))
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'market-snapshot-mysql',
      name: '@deepseek-ai/dsh-market-snapshot-mysql',
    }))
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'subagent-codex',
      name: '@deepseek-ai/dsh-subagent-codex',
      config: {
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        responsesTransport: 'http',
        permissionMode: 'never',
      },
    }))
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'tool-maoq-decision',
      name: '@deepseek-ai/dsh-tool-maoq-decision',
    }))
    const decisionTool = insertion.insert.find(item => item.id === 'tool-maoq-decision')
    expect(decisionTool?.config).toMatchObject({
      analysisMode: 'quick',
      stateRoot: '.maoq/decisions',
      maxStateFiles: 500,
      maxSnapshotFiles: 500,
    })
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'tool-maoq-snapshot',
      name: '@deepseek-ai/dsh-tool-maoq-snapshot',
    }))
  })
})
