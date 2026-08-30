import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelsOperations } from './operations.ts'
import type { ProviderRow } from './store.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

const CODEX_PROVIDER = 'openai-codex'
const CODEX_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex-spark',
] as const

type Source = 'external' | 'codex'

interface Selection {
  provider: string
  model: string
}

function selectionOf(namespace: SettingsNamespaceView): Selection {
  const value = namespace.value as { provider?: unknown; model?: unknown }
  return {
    provider: typeof value.provider === 'string' ? value.provider : '',
    model: typeof value.model === 'string' ? value.model : '',
  }
}

export interface DefaultModelCardProps {
  namespace: SettingsNamespaceView
  rows: readonly ProviderRow[]
  operations: ModelsOperations
  reload: () => Promise<void>
  readOnly: boolean
  t: (key: keyof typeof en) => string
}

/** Default commander model source and exact model selection for future tasks. */
export function DefaultModelCard({ namespace, rows, operations, reload, readOnly, t }: DefaultModelCardProps): ReactNode {
  const saved = selectionOf(namespace)
  const [source, setSource] = useState<Source>(saved.provider === CODEX_PROVIDER ? 'codex' : 'external')
  const [provider, setProvider] = useState(saved.provider === CODEX_PROVIDER ? '' : saved.provider)
  const [externalModel, setExternalModel] = useState(saved.provider === CODEX_PROVIDER ? '' : saved.model)
  const [codexModel, setCodexModel] = useState(saved.provider === CODEX_PROVIDER ? saved.model : CODEX_MODELS[0])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  const externalProviders = useMemo(() => rows
    .filter(row => row.entry.active && row.entry.provider !== CODEX_PROVIDER)
    .map(row => ({ id: row.entry.provider, name: row.entry.displayName })), [rows])
  const codexAvailable = rows.some(row => row.entry.active && row.entry.provider === CODEX_PROVIDER)

  useEffect(() => {
    const next = selectionOf(namespace)
    if (next.provider === CODEX_PROVIDER) {
      setSource('codex')
      setCodexModel(next.model)
    } else {
      setSource('external')
      setProvider(next.provider)
      setExternalModel(next.model)
    }
  }, [namespace.revision, namespace.value])

  useEffect(() => {
    if (provider.length === 0 && externalProviders[0] !== undefined) setProvider(externalProviders[0].id)
  }, [externalProviders, provider])

  const selectedProvider = source === 'codex' ? CODEX_PROVIDER : provider
  const selectedModel = source === 'codex' ? codexModel : externalModel.trim()
  const invalid = selectedProvider.length === 0 || selectedModel.length === 0 || (source === 'codex' && !codexAvailable)
  const unchanged = selectedProvider === saved.provider && selectedModel === saved.model

  const save = (): void => {
    if (saving || invalid || unchanged) return
    setSaving(true)
    setMessage(undefined)
    void operations.writeSettings('agent-default-model', [
      { op: 'set', path: ['provider'], value: selectedProvider },
      { op: 'set', path: ['model'], value: selectedModel },
      { op: 'unset', path: ['reasoningEffort'] },
    ], namespace.revision).then(async (outcome) => {
      if (outcome.kind === 'written') {
        await reload()
        setMessage(t('defaultModelSaved'))
      } else setMessage(outcome.message)
    }).finally(() => { setSaving(false) })
  }

  return (
    <section className={styles['defaultModelCard']} aria-labelledby="default-model-title">
      <div className={styles['defaultModelHeading']}>
        <div>
          <h3 id="default-model-title" className={styles['defaultModelTitle']}>{t('defaultModelTitle')}</h3>
          <p className={styles['defaultModelDescription']}>{t('defaultModelDescription')}</p>
        </div>
        <span className={styles['defaultModelBadge']}>{t('defaultModelNewTasks')}</span>
      </div>

      <div className={styles['sourceChoices']} role="radiogroup" aria-label={t('defaultModelSource')}>
        {(['codex', 'external'] as const).map(choice => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={source === choice}
            disabled={readOnly}
            className={`${styles['sourceChoice']} ${source === choice ? styles['sourceChoiceActive'] : ''}`}
            onClick={() => { setSource(choice); setMessage(undefined) }}
          >
            <span className={styles['sourceChoiceTitle']}>
              {choice === 'codex' ? t('sourceCodex') : t('sourceExternal')}
            </span>
            <span className={styles['sourceChoiceBody']}>
              {choice === 'codex' ? t('sourceCodexDescription') : t('sourceExternalDescription')}
            </span>
          </button>
        ))}
      </div>

      <div className={styles['defaultModelFields']}>
        {source === 'external'
          ? (
            <label className={styles['field']}>
              <span className={styles['fieldLabel']}>{t('defaultProvider')}</span>
              <select
                className={`${styles['input']} ${styles['selectInput']}`}
                aria-label={t('defaultProvider')}
                value={provider}
                disabled={readOnly || externalProviders.length === 0}
                onChange={(event) => { setProvider(event.target.value); setMessage(undefined) }}
              >
                {externalProviders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )
          : null}
        <label className={styles['field']}>
          <span className={styles['fieldLabel']}>{t('defaultModel')}</span>
          {source === 'codex'
            ? (
              <>
                <input
                  className={styles['input']}
                  aria-label={t('defaultModel')}
                  list="maoq-codex-models"
                  value={codexModel}
                  disabled={readOnly || !codexAvailable}
                  onChange={(event) => { setCodexModel(event.target.value); setMessage(undefined) }}
                />
                <datalist id="maoq-codex-models">
                  {CODEX_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                </datalist>
              </>
            )
            : (
              <input
                className={styles['input']}
                aria-label={t('defaultModel')}
                value={externalModel}
                disabled={readOnly}
                placeholder={t('defaultModelPlaceholder')}
                onChange={(event) => { setExternalModel(event.target.value); setMessage(undefined) }}
              />
            )}
        </label>
      </div>

      {source === 'codex' && !codexAvailable
        ? <p className={styles['error']}>{t('codexUnavailable')}</p>
        : null}
      <div className={styles['defaultModelFooter']}>
        <p className={styles['defaultModelHint']}>{t('defaultModelHint')}</p>
        <button
          type="button"
          className={styles['primaryButton']}
          disabled={readOnly || saving || invalid || unchanged}
          onClick={save}
        >
          {saving ? t('defaultModelSaving') : t('defaultModelApply')}
        </button>
      </div>
      {message === undefined ? null : <p className={styles['savedNotice']} role="status">{message}</p>}
    </section>
  )
}
