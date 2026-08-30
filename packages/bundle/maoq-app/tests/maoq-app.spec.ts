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

  test('installs the commander policy and decision tool', () => {
    const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
    const patches = load(readFileSync(patchPath, 'utf8')) as Array<Record<string, unknown>>
    const prompt = patches[0] as { config: { persona: string } }
    const insertion = patches[1] as { insert: Array<{ id: string; name: string }> }

    expect(prompt.config.persona).toContain('smallest sufficient specialist council')
    expect(prompt.config.persona).toContain('final veto power')
    expect(insertion.insert).toContainEqual(expect.objectContaining({
      id: 'tool-maoq-decision',
      name: '@deepseek-ai/dsh-tool-maoq-decision',
    }))
  })
})
