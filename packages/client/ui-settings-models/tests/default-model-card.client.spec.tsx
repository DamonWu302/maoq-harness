// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { DefaultModelCard } from '../src/client/DefaultModelCard.tsx'
import type { ModelsOperations } from '../src/client/operations.ts'
import type { ProviderRow } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const namespace = (provider: string, model: string): SettingsNamespaceView => ({
  ns: 'agent-default-model',
  schema: {},
  value: { provider, model },
  user: { provider, model },
  applies: 'live',
  secrets: [],
  revision: 7,
})

const rows: ProviderRow[] = [
  {
    entry: {
      provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true,
    },
    configured: true,
    removable: false,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    credential: { configured: true, writable: true },
  },
  {
    entry: {
      provider: 'openai-codex', displayName: 'OpenAI Codex', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'openai-codex'], active: true,
    },
    configured: true,
    removable: false,
    apiKeyEnv: undefined,
    credential: undefined,
  },
]

function operations() {
  const writeSettings = vi.fn(async () => ({ kind: 'written' as const, view: namespace('openai-codex', 'gpt-5.6-sol') }))
  return {
    writeSettings,
    face: {
      writeSettings,
      describeCredential: vi.fn(),
      storeCredential: vi.fn(),
      removeCredential: vi.fn(),
      discoverModels: vi.fn(),
    } as unknown as ModelsOperations,
  }
}

describe('DefaultModelCard', () => {
  it('switches an API-key commander to a selected local Codex model', async () => {
    const scripted = operations()
    render(<DefaultModelCard
      namespace={namespace('deepseek-official', 'deepseek-v4-flash')}
      rows={rows}
      operations={scripted.face}
      reload={async () => {}}
      readOnly={false}
      t={(key) => { return en[key] }}
    />)

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(en.sourceCodex) }))
    fireEvent.change(screen.getByLabelText(en.defaultModel), { target: { value: 'gpt-5.6-terra' } })
    fireEvent.click(screen.getByRole('button', { name: en.defaultModelApply }))

    await waitFor(() => {
      expect(scripted.writeSettings).toHaveBeenCalledWith('agent-default-model', [
        { op: 'set', path: ['provider'], value: 'openai-codex' },
        { op: 'set', path: ['model'], value: 'gpt-5.6-terra' },
        { op: 'unset', path: ['reasoningEffort'] },
      ], 7)
    })
    expect((await screen.findByRole('status')).textContent).toBe(en.defaultModelSaved)
  })

  it('keeps the external provider path and accepts its exact model id', async () => {
    const scripted = operations()
    render(<DefaultModelCard
      namespace={namespace('openai-codex', 'gpt-5.6-sol')}
      rows={rows}
      operations={scripted.face}
      reload={async () => {}}
      readOnly={false}
      t={(key) => { return en[key] }}
    />)

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(en.sourceExternal) }))
    fireEvent.change(screen.getByLabelText(en.defaultModel), { target: { value: 'deepseek-v4-pro' } })
    fireEvent.click(screen.getByRole('button', { name: en.defaultModelApply }))

    await waitFor(() => {
      expect(scripted.writeSettings).toHaveBeenCalledWith('agent-default-model', [
        { op: 'set', path: ['provider'], value: 'deepseek-official' },
        { op: 'set', path: ['model'], value: 'deepseek-v4-pro' },
        { op: 'unset', path: ['reasoningEffort'] },
      ], 7)
    })
  })
})
