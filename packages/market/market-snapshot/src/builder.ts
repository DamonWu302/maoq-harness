import { createHash } from 'node:crypto'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  MARKET_SNAPSHOT_SCHEMA_VERSION,
  type EmotionFacts,
  type MarketBreadth,
  type MarketProvenance,
  type MarketSnapshot,
  type MarketSnapshotDraft,
  type MarketSnapshotIdentityInput,
  type NewsEvidence,
  type SectorDailySnapshot,
  type SectorMember,
  type StockDailyBar,
} from './types.ts'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/

/** Failure to establish one complete, internally consistent point-in-time fact set. */
export class MarketSnapshotValidationError extends Error {
  readonly code = 'MARKET_SNAPSHOT_INVALID' as const

  constructor(message: string) {
    super(`market snapshot invalid: ${message}`)
    this.name = 'MarketSnapshotValidationError'
  }
}

function requireText(value: string, field: string): void {
  if (value.length === 0 || value.trim() !== value) throw new MarketSnapshotValidationError(`${field} must be non-blank and trimmed`)
}

function requireDate(value: string, field: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new MarketSnapshotValidationError(`${field} must be an ISO calendar date`)
  }
}

function parseInstant(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || !value.includes('T')) {
    throw new MarketSnapshotValidationError(`${field} must be an ISO timestamp with an offset`)
  }
  return parsed
}

function requireFinite(value: number, field: string, minimum?: number): void {
  if (!Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new MarketSnapshotValidationError(`${field} must be finite${minimum === undefined ? '' : ` and at least ${String(minimum)}`}`)
  }
}

function validateProvenance(value: MarketProvenance, field: string, cutoff: number): void {
  requireText(value.source.adapter, `${field}.source.adapter`)
  requireText(value.source.dataset, `${field}.source.dataset`)
  requireText(value.source.version, `${field}.source.version`)
  requireText(value.source.recordId, `${field}.source.recordId`)
  if (parseInstant(value.source.retrievedAt, `${field}.source.retrievedAt`) > cutoff) {
    throw new MarketSnapshotValidationError(`${field} was retrieved after the cutoff`)
  }
  for (const [index, transform] of value.transforms.entries()) requireText(transform, `${field}.transforms[${String(index)}]`)
}

function assertUnique<T>(items: readonly T[], keyOf: (item: T) => string, field: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) throw new MarketSnapshotValidationError(`${field} contains conflicting duplicate ${JSON.stringify(key)}`)
    seen.add(key)
  }
}

function validateIdentity(identity: MarketSnapshotIdentityInput): number {
  requireDate(identity.tradingDate, 'identity.tradingDate')
  const cutoff = parseInstant(identity.cutoffTime, 'identity.cutoffTime')
  for (const field of ['calendarVersion', 'adjustmentVersion', 'sectorClassificationVersion'] as const) {
    requireText(identity[field], `identity.${field}`)
  }
  if (identity.sourceVersions.length === 0) throw new MarketSnapshotValidationError('identity.sourceVersions must not be empty')
  identity.sourceVersions.forEach((value, index) => {
    requireText(value, `identity.sourceVersions[${String(index)}]`)
  })
  assertUnique(identity.sourceVersions, value => value, 'identity.sourceVersions')
  return cutoff
}

function normalizeStock(stock: StockDailyBar, tradingDate: string, cutoff: number): StockDailyBar {
  requireText(stock.symbol, 'stocks[].symbol')
  if (stock.tradingDate !== tradingDate) throw new MarketSnapshotValidationError(`stock ${stock.symbol} has trading date ${stock.tradingDate}, expected ${tradingDate}`)
  for (const field of ['open', 'high', 'low', 'close', 'volume', 'amount', 'turnoverRate', 'adjustmentFactor', 'listingDays'] as const) {
    requireFinite(stock[field], `stocks[${stock.symbol}].${field}`, 0)
  }
  if (stock.high < Math.max(stock.open, stock.close) || stock.low > Math.min(stock.open, stock.close) || stock.high < stock.low) {
    throw new MarketSnapshotValidationError(`stock ${stock.symbol} has inconsistent OHLC values`)
  }
  if (stock.tradingStatus === 'suspended' && (stock.volume !== 0 || stock.amount !== 0)) {
    throw new MarketSnapshotValidationError(`suspended stock ${stock.symbol} must have zero volume and amount`)
  }
  validateProvenance(stock.provenance, `stocks[${stock.symbol}].provenance`, cutoff)
  return { ...stock, qualityFlags: [...stock.qualityFlags].sort(), provenance: normalizeProvenance(stock.provenance) }
}

function normalizeProvenance(value: MarketProvenance): MarketProvenance {
  return { source: { ...value.source }, transforms: [...value.transforms] }
}

function normalizeMember(member: SectorMember, date: string, sectorId: string): SectorMember {
  requireText(member.symbol, `sectors[${sectorId}].members[].symbol`)
  requireDate(member.effectiveFrom, `sectors[${sectorId}].members[${member.symbol}].effectiveFrom`)
  if (member.effectiveTo !== null) requireDate(member.effectiveTo, `sectors[${sectorId}].members[${member.symbol}].effectiveTo`)
  if (member.effectiveFrom > date || (member.effectiveTo !== null && member.effectiveTo < date)) {
    throw new MarketSnapshotValidationError(`sector ${sectorId} member ${member.symbol} is not effective on ${date}`)
  }
  return { ...member }
}

function normalizeSector(sector: SectorDailySnapshot, date: string, cutoff: number): SectorDailySnapshot {
  requireText(sector.sectorId, 'sectors[].sectorId')
  requireText(sector.name, `sectors[${sector.sectorId}].name`)
  if (sector.tradingDate !== date) throw new MarketSnapshotValidationError(`sector ${sector.sectorId} has trading date ${sector.tradingDate}, expected ${date}`)
  for (const field of ['open', 'high', 'low', 'close', 'amount', 'advancingRatio', 'limitUpCount', 'dispersion'] as const) {
    requireFinite(sector[field], `sectors[${sector.sectorId}].${field}`, 0)
  }
  if (sector.advancingRatio > 1) throw new MarketSnapshotValidationError(`sector ${sector.sectorId} advancingRatio exceeds 1`)
  validateProvenance(sector.provenance, `sectors[${sector.sectorId}].provenance`, cutoff)
  const members = sector.members
    .map(member => normalizeMember(member, date, sector.sectorId))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
  assertUnique(members, member => member.symbol, `sectors[${sector.sectorId}].members`)
  const leaders = [...sector.leaders].sort()
  assertUnique(leaders, value => value, `sectors[${sector.sectorId}].leaders`)
  return { ...sector, leaders, members, provenance: normalizeProvenance(sector.provenance) }
}

function normalizeBreadth(value: MarketBreadth, cutoff: number): MarketBreadth {
  for (const field of ['totalAmount', 'advancing', 'declining', 'unchanged', 'limitUp', 'limitDown', 'brokenLimit'] as const) {
    requireFinite(value[field], `breadth.${field}`, 0)
  }
  const majorIndices = value.majorIndices.map((index) => {
    requireText(index.symbol, 'breadth.majorIndices[].symbol')
    requireFinite(index.close, `breadth.majorIndices[${index.symbol}].close`, 0)
    requireFinite(index.changePct, `breadth.majorIndices[${index.symbol}].changePct`)
    return { ...index }
  }).sort((a, b) => a.symbol.localeCompare(b.symbol))
  assertUnique(majorIndices, index => index.symbol, 'breadth.majorIndices')
  validateProvenance(value.provenance, 'breadth.provenance', cutoff)
  return { ...value, majorIndices, provenance: normalizeProvenance(value.provenance) }
}

function normalizeEmotion(value: EmotionFacts, cutoff: number): EmotionFacts {
  for (const field of ['promotionRate', 'brokenLimitRate', 'lossEffectRate'] as const) {
    requireFinite(value[field], `emotion.${field}`, 0)
    if (value[field] > 1) throw new MarketSnapshotValidationError(`emotion.${field} exceeds 1`)
  }
  const consecutiveBoardCounts = value.consecutiveBoardCounts.map((item) => {
    requireFinite(item.boards, 'emotion.consecutiveBoardCounts[].boards', 1)
    requireFinite(item.count, `emotion.consecutiveBoardCounts[${String(item.boards)}].count`, 0)
    return { ...item }
  }).sort((a, b) => a.boards - b.boards)
  assertUnique(consecutiveBoardCounts, item => String(item.boards), 'emotion.consecutiveBoardCounts')
  validateProvenance(value.provenance, 'emotion.provenance', cutoff)
  return { ...value, consecutiveBoardCounts, provenance: normalizeProvenance(value.provenance) }
}

function normalizeNews(news: readonly NewsEvidence[], cutoff: number): NewsEvidence[] {
  const eligible = news.filter((item) => {
    const published = parseInstant(item.publishedAt, `news[${item.id}].publishedAt`)
    const fetched = parseInstant(item.fetchedAt, `news[${item.id}].fetchedAt`)
    return published <= cutoff && fetched <= cutoff
  }).map((item) => {
    requireText(item.id, 'news[].id')
    requireText(item.title, `news[${item.id}].title`)
    requireText(item.url, `news[${item.id}].url`)
    requireText(item.publisher, `news[${item.id}].publisher`)
    parseInstant(item.eventAt, `news[${item.id}].eventAt`)
    requireFinite(item.confidence, `news[${item.id}].confidence`, 0)
    if (item.confidence > 1) throw new MarketSnapshotValidationError(`news ${item.id} confidence exceeds 1`)
    validateProvenance(item.provenance, `news[${item.id}].provenance`, cutoff)
    return { ...item, affectedSectors: [...item.affectedSectors].sort(), provenance: normalizeProvenance(item.provenance) }
  }).sort((a, b) => a.id.localeCompare(b.id))
  assertUnique(eligible, item => item.id, 'news')
  return eligible
}

/** Serialize JSON with recursively sorted object keys and no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

/** Compute the lowercase SHA-256 content address for canonical JSON. */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

/** Build one immutable snapshot, rejecting incomplete or conflicting facts. */
export function buildMarketSnapshot(draft: MarketSnapshotDraft): MarketSnapshot {
  const cutoff = validateIdentity(draft.identity)
  const stocks = draft.stocks
    .map(stock => normalizeStock(stock, draft.identity.tradingDate, cutoff))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
  if (stocks.length === 0) throw new MarketSnapshotValidationError('stocks must not be empty')
  assertUnique(stocks, stock => stock.symbol, 'stocks')
  const sectors = draft.sectors
    .map(sector => normalizeSector(sector, draft.identity.tradingDate, cutoff))
    .sort((a, b) => a.sectorId.localeCompare(b.sectorId))
  if (sectors.length === 0) throw new MarketSnapshotValidationError('sectors must not be empty')
  assertUnique(sectors, sector => sector.sectorId, 'sectors')
  const body = {
    schemaVersion: MARKET_SNAPSHOT_SCHEMA_VERSION,
    identity: { ...draft.identity, sourceVersions: [...draft.identity.sourceVersions].sort() },
    quality: { status: 'complete' as const, warnings: [] as string[] },
    stocks,
    sectors,
    breadth: normalizeBreadth(draft.breadth, cutoff),
    emotion: normalizeEmotion(draft.emotion, cutoff),
    news: normalizeNews(draft.news, cutoff),
  }
  const snapshot: MarketSnapshot = { ...body, identity: { ...body.identity, contentHash: contentHash(body) } }
  return deepFreeze(snapshot)
}

/** Verify that parsed persisted bytes still match their declared content address. */
export function verifyMarketSnapshot(snapshot: MarketSnapshot): void {
  const persistedVersion = (snapshot as { schemaVersion: number }).schemaVersion
  if (persistedVersion !== MARKET_SNAPSHOT_SCHEMA_VERSION) {
    throw new MarketSnapshotValidationError(`unsupported schema version ${String(persistedVersion)}`)
  }
  if (!HASH_PATTERN.test(snapshot.identity.contentHash)) throw new MarketSnapshotValidationError('identity.contentHash is not SHA-256')
  const { contentHash: declared, ...identity } = snapshot.identity
  const actual = contentHash({ ...snapshot, identity })
  if (declared !== actual) throw new MarketSnapshotValidationError(`content hash mismatch: declared ${declared}, computed ${actual}`)
}
