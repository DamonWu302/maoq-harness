import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { load } from 'js-yaml'
import { inject, name } from '../src/invariant.ts'

describe('@deepseek-ai/dsh-maoq-app', () => {
  test('declares the bounded MAOQ profile layer', () => {
    expect(name).toBe('maoq-app-invariant')
    expect(inject).toEqual(['invariants'])
  })

  test('installs the commander policy, workflow engine, and decision tool', () => {
    const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
    const patches = load(readFileSync(patchPath, 'utf8')) as Array<Record<string, unknown>>
    const prompt = patches[0] as { config: { persona: string } }
    const workflowEngine = patches[1] as { id: string; disabled: boolean }
    const codexRoute = patches[2] as {
      id: string
      config: { reuseCodexLogin: boolean; providers: Record<string, unknown> }
    }
    const insertion = patches[3] as { insert: Array<{ id: string; name: string }> }

    expect(prompt.config.persona).toContain('smallest sufficient specialist council')
    expect(prompt.config.persona).toContain('final veto power')
    expect(workflowEngine).toEqual({ id: 'workflow-worker-thread', disabled: false })
    expect(codexRoute).toEqual({
      id: 'llm-pi-ai',
      config: { reuseCodexLogin: true, providers: { 'openai-codex': {} } },
    })
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'subagent-codex',
      name: '@deepseek-ai/dsh-subagent-codex',
      config: { model: 'gpt-5.6-sol', permissionMode: 'never' },
    }))
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'tool-maoq-decision',
      name: '@deepseek-ai/dsh-tool-maoq-decision',
    }))
  })
})
