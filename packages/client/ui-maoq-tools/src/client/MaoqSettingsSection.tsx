import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { CodexCouncilSettings, MaoqDecisionSettings } from './index.ts'
import css from './MaoqSettingsSection.module.css'

interface MaoqSettingsInjected {
  decision: SettingsScope<MaoqDecisionSettings>
  council: SettingsScope<CodexCouncilSettings>
}

export type MaoqSettingsSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<'maoqTools'>
  & InjectFace<MaoqSettingsInjected>

const MODE_OPTIONS = ['quick', 'deep'] as const
const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * Render the MAOQ-owned settings page for analysis depth and the internal Codex council.
 * @param props - Bound settings scopes and localized section props.
 * @returns The settings content for the MAOQ navigation entry.
 */
export function MaoqSettingsSection(props: MaoqSettingsSectionProps): ReactNode {
  const decision = useSyncExternalStore(
    listener => props.decision.subscribe(listener),
    () => props.decision.getSnapshot(),
  )
  const council = useSyncExternalStore(
    listener => props.council.subscribe(listener),
    () => props.council.getSnapshot(),
  )
  const [model, setModel] = useState('gpt-5.6-luna')
  const [effort, setEffort] = useState('low')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    if (council.status !== 'ready') return
    setModel(council.value?.model ?? 'gpt-5.6-luna')
    setEffort(council.value?.reasoningEffort ?? 'low')
  }, [council.status, council.value?.model, council.value?.reasoningEffort])

  if (decision.status === 'loading' || council.status === 'loading') return null
  if (decision.status !== 'ready' || council.status !== 'ready') {
    return <p className={css.notice}>{props.t('settings.unavailable')}</p>
  }
  const writable = decision.writable && council.writable
  const mode = decision.value?.analysisMode ?? 'quick'
  const save = async (): Promise<void> => {
    if (!writable || model.trim().length === 0) return
    setStatus('saving')
    try {
      await props.council.mutate([
        { op: 'set', path: ['model'], value: model.trim() },
        { op: 'set', path: ['reasoningEffort'], value: effort },
      ])
      setStatus('saved')
    } catch (_error) {
      setStatus('failed')
    }
  }
  const selectMode = async (nextMode: typeof MODE_OPTIONS[number]): Promise<void> => {
    if (!writable || nextMode === mode) return
    setStatus('saving')
    try {
      await props.decision.set('analysisMode', nextMode)
      setStatus('saved')
    } catch (_error) {
      setStatus('failed')
    }
  }

  return (
    <div className={css.section}>
      <header>
        <h2 className={css.title}>{props.t('settings.title')}</h2>
        <p className={css.intro}>{props.t('settings.intro')}</p>
      </header>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{props.t('settings.mode')}</h3>
        <div className={css.modeGrid}>
          {MODE_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              className={`${css.modeButton} ${mode === option ? css.modeActive : ''}`}
              aria-pressed={mode === option}
              disabled={!writable}
              onClick={() => { void selectMode(option) }}
            >
              <strong>{props.t(`settings.${option}`)}</strong>
              <span>{props.t(`settings.${option}Detail`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{props.t('settings.model')}</h3>
        <p className={css.hint}>{props.t('settings.modelHint')}</p>
        <div className={css.fields}>
          <label className={css.field}>
            <span>{props.t('settings.model')}</span>
            <input value={model} list="maoq-council-models" spellCheck={false} disabled={!writable} onChange={(event) => { setModel(event.target.value); setStatus('idle') }} />
            <datalist id="maoq-council-models">
              <option value="gpt-5.6-luna" />
              <option value="gpt-5.6-terra" />
              <option value="gpt-5.6-sol" />
            </datalist>
          </label>
          <label className={css.field}>
            <span>{props.t('settings.effort')}</span>
            <select value={effort} disabled={!writable} onChange={(event) => { setEffort(event.target.value); setStatus('idle') }}>
              {EFFORTS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className={css.actions}>
          <button type="button" className={css.save} disabled={!writable || model.trim().length === 0 || status === 'saving'} onClick={() => { void save() }}>
            {props.t(status === 'saving' ? 'settings.saving' : 'settings.save')}
          </button>
          {status === 'saved' ? <span className={css.success}>{props.t('settings.saved')}</span> : null}
          {status === 'failed' ? <span className={css.error} role="alert">{props.t('settings.failed')}</span> : null}
          {!writable ? <span className={css.error}>{props.t('settings.readOnly')}</span> : null}
        </div>
      </section>
    </div>
  )
}
