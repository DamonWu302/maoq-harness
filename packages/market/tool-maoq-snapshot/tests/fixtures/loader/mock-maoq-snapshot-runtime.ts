import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { MarketProvenance, MarketSnapshotDraft, MarketSnapshotIdentityInput } from '@deepseek-ai/dsh-market-snapshot'

function provenance(date: string, dataset: string): MarketProvenance {
  return {
    source: { adapter: 'loader-fixture', dataset, version: `${dataset}-${date}`, retrievedAt: `${date}T15:10:00+08:00`, recordId: `${dataset}-${date}` },
    transforms: ['loader-fixture-v1'],
  }
}

function draft(identity: MarketSnapshotIdentityInput): MarketSnapshotDraft {
  const date = identity.tradingDate
  return {
    identity,
    stocks: [{
      symbol: '600000.SH', tradingDate: date, open: 10, high: 10.8, low: 9.9, close: 10.5, volume: 1_000_000,
      amount: 10_400_000, turnoverRate: 0.03, adjustmentFactor: 1.2, tradingStatus: 'trading', limitStatus: 'none',
      listingDays: 8_000, qualityFlags: [], provenance: provenance(date, 'daily'),
    }],
    sectors: [{
      sectorId: 'bank', name: '银行', tradingDate: date, open: 100, high: 106, low: 99, close: 104,
      amount: 30_000_000_000, advancingRatio: 0.75, limitUpCount: 1, dispersion: 0.012, leaders: ['600000.SH'],
      members: [{ symbol: '600000.SH', effectiveFrom: '2020-01-01', effectiveTo: null }], provenance: provenance(date, 'sector'),
    }],
    breadth: {
      majorIndices: [{ symbol: '000001.SH', close: 3_500, changePct: 0.008 }], totalAmount: 1_200_000_000_000,
      advancing: 3_200, declining: 1_500, unchanged: 200, limitUp: 72, limitDown: 8, brokenLimit: 24,
      provenance: provenance(date, 'breadth'),
    },
    emotion: {
      consecutiveBoardCounts: [{ boards: 3, count: 2 }], promotionRate: 0.48, brokenLimitRate: 0.25,
      lossEffectRate: 0.12, provenance: provenance(date, 'emotion'),
    },
    news: [],
  }
}

function toolResult(options: GenerateOptions): string {
  return options.messages.at(-1)?.content.filter(block => block.type === 'tool-result').flatMap(block => block.content)
    .filter(block => block.type === 'text').map(block => block.text).join('') ?? ''
}

class SnapshotCommanderAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const result = toolResult(options)
    if (result.length === 0) {
      const args = JSON.stringify({
        adapterName: 'loader-fixture', beforeOrOn: '2026-08-28', cutoffTime: '2026-08-28T15:30:00+08:00', count: 3,
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('maoq-snapshot-loader-call'), name: 'maoq_snapshot_generate', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('maoq-snapshot-loader-call'), name: 'maoq_snapshot_generate', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: result }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: result } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'mock-maoq-snapshot-runtime'
export const inject = ['llm', 'marketSnapshots']

export function apply(ctx: Context): void {
  const dates = ['2026-08-26', '2026-08-27', '2026-08-28']
  ctx.marketSnapshots.register({
    name: 'loader-fixture',
    discoverRecent: request => Promise.resolve(dates.filter(date => date <= request.beforeOrOn).slice(-request.limit).map(date => ({
      tradingDate: date, cutoffTime: request.cutoffTime, calendarVersion: 'loader-calendar-v1', adjustmentVersion: `loader-qfq-${date}`,
      sectorClassificationVersion: 'loader-sector-v1', sourceVersions: [`loader-daily-${date}`],
    }))),
    load: identity => Promise.resolve(draft(identity)),
  })
  ctx.llm.registerAdapter(['mock-snapshot'], new SnapshotCommanderAdapter())
}
