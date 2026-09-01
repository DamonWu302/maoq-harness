import type { MarketSnapshot } from '@deepseek-ai/dsh-market-snapshot'
import { computeStrategicFeatures } from './features.ts'
import {
  STRATEGIC_ENGINE_VERSION,
  type EmotionCycle,
  type MarketRegime,
} from './types.ts'

/** Host-owned production defaults for the P2 rolling deterministic canary. */
export interface P2StrategicCanaryOptions {
  /** Number of fully evaluable trading dates; defaults to 10. */
  readonly evaluationDays?: number
  /** Required breadth provenance adapter; omit for provider-neutral fixture replay. */
  readonly requiredSourceAdapter?: string
  /** Required immutable `mapping:<version>` identity token; omit for provider-neutral fixture replay. */
  readonly requiredMappingVersion?: string
}

/** One production date evaluated with its two immediately preceding stored trading dates. */
export interface P2StrategicCanaryDay {
  readonly tradingDate: string
  readonly snapshotHash: string
  readonly historyHashes: readonly [string, string]
  readonly marketRegime: MarketRegime | 'unavailable'
  readonly emotionCycle: EmotionCycle | 'unavailable'
  readonly sectorCount: number
  readonly eligibleForInterpretation: boolean
  readonly deterministicReplayMatched: boolean
}

/** Bounded P2 release evidence generated without model calls or token spend. */
export interface P2StrategicCanaryReport {
  readonly status: 'passed' | 'failed'
  readonly engineVersion: typeof STRATEGIC_ENGINE_VERSION
  readonly evaluationDays: number
  readonly requiredUniqueTradingDates: number
  readonly availableUniqueTradingDates: number
  readonly selectedTradingDates: readonly string[]
  readonly days: readonly P2StrategicCanaryDay[]
  readonly failureCodes: readonly string[]
  readonly modelCallsStarted: 0
  readonly tokenUsage: { readonly inputTokens: 0; readonly outputTokens: 0; readonly totalTokens: 0 }
}

function chooseNewestPerTradingDate(snapshots: readonly MarketSnapshot[]): MarketSnapshot[] {
  const selected = new Map<string, MarketSnapshot>()
  for (const snapshot of snapshots) {
    const previous = selected.get(snapshot.identity.tradingDate)
    if (previous === undefined
      || snapshot.identity.cutoffTime > previous.identity.cutoffTime
      || (snapshot.identity.cutoffTime === previous.identity.cutoffTime
        && snapshot.identity.contentHash > previous.identity.contentHash)) {
      selected.set(snapshot.identity.tradingDate, snapshot)
    }
  }
  return [...selected.values()].sort((left, right) => left.identity.tradingDate.localeCompare(right.identity.tradingDate))
}

/**
 * Evaluate the newest rolling P2 window using two warm-up dates plus fully evaluable dates.
 * @param snapshots - Verified immutable snapshots; duplicate trading dates are resolved to the newest cutoff.
 * @param options - Bounded evaluation and optional production provenance requirements.
 * @returns A machine-readable pass/fail report. A failure never falls back to model interpretation.
 */
export function evaluateP2StrategicCanary(
  snapshots: readonly MarketSnapshot[],
  options: P2StrategicCanaryOptions = {},
): P2StrategicCanaryReport {
  const evaluationDays = options.evaluationDays ?? 10
  if (!Number.isInteger(evaluationDays) || evaluationDays < 1) {
    throw new TypeError('P2 strategic canary evaluationDays must be a positive integer')
  }
  const requiredUniqueTradingDates = evaluationDays + 2
  const unique = chooseNewestPerTradingDate(snapshots)
  const window = unique.slice(-requiredUniqueTradingDates)
  const failureCodes = new Set<string>()
  const days: P2StrategicCanaryDay[] = []

  if (unique.length < requiredUniqueTradingDates) failureCodes.add('INSUFFICIENT_UNIQUE_TRADING_DATES')
  if (options.requiredSourceAdapter !== undefined
    && window.some(snapshot => snapshot.breadth.provenance.source.adapter !== options.requiredSourceAdapter)) {
    failureCodes.add('SOURCE_ADAPTER_MISMATCH')
  }
  if (options.requiredMappingVersion !== undefined) {
    const token = `mapping:${options.requiredMappingVersion}`
    if (window.some(snapshot => !snapshot.identity.sourceVersions.includes(token))) {
      failureCodes.add('MAPPING_VERSION_MISSING')
    }
  }

  if (window.length === requiredUniqueTradingDates) {
    for (let index = 2; index < window.length; index += 1) {
      const current = window[index]
      const historyStart = window[index - 2]
      const historyEnd = window[index - 1]
      if (current === undefined || historyStart === undefined || historyEnd === undefined) {
        failureCodes.add('CANARY_WINDOW_INDEX_MISSING')
        continue
      }
      const history = [historyStart, historyEnd] as const
      const features = computeStrategicFeatures(current, history)
      const replay = computeStrategicFeatures(current, [...history].reverse())
      const deterministicReplayMatched = JSON.stringify(features) === JSON.stringify(replay)
      const marketRegime = features.marketRegime.status === 'ready' ? features.marketRegime.value.label : 'unavailable'
      const emotionCycle = features.emotionCycle.status === 'ready' ? features.emotionCycle.value.label : 'unavailable'
      const sectorCount = features.sectorBattlefields.status === 'ready' ? features.sectorBattlefields.value.length : 0
      if (!features.eligibleForInterpretation) failureCodes.add('STRATEGIC_COMPONENT_UNAVAILABLE')
      if (!deterministicReplayMatched) failureCodes.add('DETERMINISTIC_REPLAY_MISMATCH')
      if (features.evidence.length === 0) failureCodes.add('EVIDENCE_MISSING')
      days.push({
        tradingDate: current.identity.tradingDate,
        snapshotHash: current.identity.contentHash,
        historyHashes: [history[0].identity.contentHash, history[1].identity.contentHash],
        marketRegime,
        emotionCycle,
        sectorCount,
        eligibleForInterpretation: features.eligibleForInterpretation,
        deterministicReplayMatched,
      })
    }
  }

  return {
    status: failureCodes.size === 0 ? 'passed' : 'failed',
    engineVersion: STRATEGIC_ENGINE_VERSION,
    evaluationDays,
    requiredUniqueTradingDates,
    availableUniqueTradingDates: unique.length,
    selectedTradingDates: window.map(snapshot => snapshot.identity.tradingDate),
    days,
    failureCodes: [...failureCodes].sort(),
    modelCallsStarted: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  }
}
