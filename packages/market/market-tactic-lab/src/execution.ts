import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  TACTIC_LAB_EXECUTION_ENGINE_VERSION,
  TACTIC_LAB_EXECUTION_SCHEMA_VERSION,
  type DailyExecutionFill,
  type DailyExecutionBar,
  type DailyExecutionOrder,
  type DailyExecutionPolicy,
  type DailyExecutionPosition,
  type DailyExecutionRejection,
  type DailyExecutionRejectionReason,
  type DailyExecutionResult,
  type DailyExecutionSession,
} from './types.ts'

/** Default conservative A-share next-open paper-execution policy. */
export const DEFAULT_A_SHARE_EXECUTION_POLICY: DailyExecutionPolicy = deepFreeze({
  initialCash: 1_000_000,
  lotSize: 100,
  commissionBps: 2.5,
  minimumCommission: 5,
  stampDutySellBps: 5,
  transferFeeBps: 0.1,
  slippageBps: 5,
})

/** Rejected execution policy or market input. */
export class DailyExecutionError extends Error {
  /** Stable machine-readable category. */
  readonly code = 'MAOQ_DAILY_EXECUTION_REJECTED' as const

  constructor(message: string) {
    super(`MAOQ daily execution rejected: ${message}`)
    this.name = 'DailyExecutionError'
  }
}

interface PositionLot {
  readonly acquiredDate: string
  quantity: number
}

interface ScheduledOrder {
  readonly order: DailyExecutionOrder
  readonly fillDate: string
}

function rounded(value: number): number {
  return Number(value.toFixed(6))
}

function validatePolicy(policy: DailyExecutionPolicy): void {
  const nonnegative: (keyof DailyExecutionPolicy)[] = [
    'initialCash',
    'commissionBps',
    'minimumCommission',
    'stampDutySellBps',
    'transferFeeBps',
    'slippageBps',
  ]
  for (const key of nonnegative) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0) throw new DailyExecutionError(`${key} must be finite and nonnegative`)
  }
  if (!Number.isSafeInteger(policy.lotSize) || policy.lotSize < 1) {
    throw new DailyExecutionError('lotSize must be a positive safe integer')
  }
}

function normalizedSessions(input: readonly DailyExecutionSession[]): readonly DailyExecutionSession[] {
  if (input.length < 2) throw new DailyExecutionError('at least two market sessions are required')
  const sessions = [...input].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index] as DailyExecutionSession
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(session.tradingDate)) throw new DailyExecutionError('market session date must use YYYY-MM-DD')
    if (!/^[a-f0-9]{64}$/u.test(session.contentHash)) throw new DailyExecutionError(`${session.tradingDate} content hash is not SHA-256`)
    if (index > 0 && sessions[index - 1]?.tradingDate === session.tradingDate) {
      throw new DailyExecutionError(`duplicate market session ${session.tradingDate}`)
    }
    const symbols = new Set<string>()
    for (const bar of session.bars) {
      if (symbols.has(bar.symbol)) throw new DailyExecutionError(`${session.tradingDate} contains duplicate bar ${bar.symbol}`)
      symbols.add(bar.symbol)
      if (bar.tradingDate !== session.tradingDate) throw new DailyExecutionError(`${bar.symbol} bar date does not match its session`)
      for (const field of ['open', 'high', 'low', 'close', 'upLimit', 'downLimit'] as const) {
        if (!Number.isFinite(bar[field]) || bar[field] <= 0) throw new DailyExecutionError(`${bar.symbol}.${field} must be positive and finite`)
      }
      if (bar.high < Math.max(bar.open, bar.close, bar.low)
        || bar.low > Math.min(bar.open, bar.close, bar.high)
        || bar.low > bar.high) {
        throw new DailyExecutionError(`${bar.symbol} raw OHLC is inconsistent`)
      }
      if (bar.downLimit >= bar.upLimit) throw new DailyExecutionError(`${bar.symbol} price limits are inconsistent`)
    }
  }
  return sessions
}

function reject(
  rejections: DailyExecutionRejection[],
  order: DailyExecutionOrder,
  reason: DailyExecutionRejectionReason,
): void {
  rejections.push({
    orderId: order.orderId,
    symbol: order.symbol,
    signalDate: order.signalDate,
    reason,
  })
}

function isValidOrder(order: DailyExecutionOrder, policy: DailyExecutionPolicy): boolean {
  return order.orderId.length > 0
    && order.symbol.length > 0
    && /^\d{4}-\d{2}-\d{2}$/u.test(order.signalDate)
    && Number.isSafeInteger(order.quantity)
    && order.quantity > 0
    && order.quantity % policy.lotSize === 0
}

function scheduleOrders(
  orders: readonly DailyExecutionOrder[],
  sessions: readonly string[],
  policy: DailyExecutionPolicy,
  rejections: DailyExecutionRejection[],
): ScheduledOrder[] {
  const scheduled: ScheduledOrder[] = []
  const sessionIndex = new Map(sessions.map((date, index) => [date, index]))
  const seenIds = new Set<string>()
  for (const order of orders) {
    if (seenIds.has(order.orderId)) {
      reject(rejections, order, 'duplicate_order_id')
      continue
    }
    seenIds.add(order.orderId)
    if (!isValidOrder(order, policy)) {
      reject(rejections, order, 'invalid_order')
      continue
    }
    const index = sessionIndex.get(order.signalDate)
    if (index === undefined) {
      reject(rejections, order, 'unknown_signal_session')
      continue
    }
    const fillDate = sessions[index + 1]
    if (fillDate === undefined) {
      reject(rejections, order, 'no_next_session')
      continue
    }
    scheduled.push({ order, fillDate })
  }
  return scheduled.sort((left, right) => left.fillDate.localeCompare(right.fillDate)
    || Number(left.order.side === 'buy') - Number(right.order.side === 'buy')
    || left.order.orderId.localeCompare(right.order.orderId))
}

function openBlocked(bar: DailyExecutionBar, side: DailyExecutionOrder['side']): DailyExecutionRejectionReason | undefined {
  if (bar.tradingStatus !== 'trading') return 'not_trading'
  const epsilon = Math.max(1, Math.abs(bar.open), Math.abs(bar.upLimit), Math.abs(bar.downLimit)) * 1e-10
  if (side === 'buy' && bar.open >= bar.upLimit - epsilon) return 'open_limit_up'
  if (side === 'sell' && bar.open <= bar.downLimit + epsilon) return 'open_limit_down'
  return undefined
}

function fillPrice(bar: DailyExecutionBar, side: DailyExecutionOrder['side'], slippageBps: number): number {
  const ratio = slippageBps / 10_000
  const slipped = side === 'buy' ? bar.open * (1 + ratio) : bar.open * (1 - ratio)
  return rounded(side === 'buy' ? Math.min(bar.high, slipped) : Math.max(bar.low, slipped))
}

function totalQuantity(lots: readonly PositionLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.quantity, 0)
}

function sellableQuantity(lots: readonly PositionLot[], fillDate: string): number {
  return lots.filter(lot => lot.acquiredDate < fillDate).reduce((sum, lot) => sum + lot.quantity, 0)
}

function consumeSellable(lots: PositionLot[], fillDate: string, quantity: number): void {
  let remaining = quantity
  for (const lot of lots) {
    if (lot.acquiredDate >= fillDate || remaining === 0) continue
    const consumed = Math.min(lot.quantity, remaining)
    lot.quantity -= consumed
    remaining -= consumed
  }
  for (let index = lots.length - 1; index >= 0; index -= 1) {
    if (lots[index]?.quantity === 0) lots.splice(index, 1)
  }
}

function costs(
  side: DailyExecutionOrder['side'],
  notional: number,
  policy: DailyExecutionPolicy,
): { commission: number; stampDuty: number; transferFee: number; totalFees: number } {
  const commission = rounded(Math.max(policy.minimumCommission, notional * policy.commissionBps / 10_000))
  const stampDuty = rounded(side === 'sell' ? notional * policy.stampDutySellBps / 10_000 : 0)
  const transferFee = rounded(notional * policy.transferFeeBps / 10_000)
  return { commission, stampDuty, transferFee, totalFees: rounded(commission + stampDuty + transferFee) }
}

function markedPositions(
  lotsBySymbol: ReadonlyMap<string, readonly PositionLot[]>,
  sessions: readonly DailyExecutionSession[],
): readonly DailyExecutionPosition[] {
  const positions: DailyExecutionPosition[] = []
  for (const [symbol, lots] of lotsBySymbol) {
    const quantity = totalQuantity(lots)
    if (quantity === 0) continue
    let close: number | undefined
    for (let index = sessions.length - 1; index >= 0 && close === undefined; index -= 1) {
      close = sessions[index]?.bars.find(bar => bar.symbol === symbol)?.close
    }
    positions.push({ symbol, quantity, marketValue: rounded(quantity * (close ?? 0)) })
  }
  return positions.sort((left, right) => left.symbol.localeCompare(right.symbol))
}

/**
 * Replay close-authored orders at the next market session's open under one shared A-share policy.
 * @param input - Market sessions whose raw bars determine tradability, fills, and final marks.
 * @param orders - Explicit orders generated after their `signalDate` close.
 * @param policy - Predeclared costs, lot size, starting cash, and slippage.
 * @returns Frozen fills, rejections, positions, cash, and marked final equity.
 */
export function simulateNextOpenExecution(
  input: readonly DailyExecutionSession[],
  orders: readonly DailyExecutionOrder[],
  policy: DailyExecutionPolicy = DEFAULT_A_SHARE_EXECUTION_POLICY,
): DailyExecutionResult {
  validatePolicy(policy)
  const sessions = normalizedSessions(input)
  const sessionDates = sessions.map(session => session.tradingDate)
  const sessionByDate = new Map(sessions.map(session => [session.tradingDate, session]))
  const rejections: DailyExecutionRejection[] = []
  const scheduled = scheduleOrders(orders, sessionDates, policy, rejections)
  const lotsBySymbol = new Map<string, PositionLot[]>()
  const fills: DailyExecutionFill[] = []
  let cash = policy.initialCash

  for (const { order, fillDate } of scheduled) {
    const bar = sessionByDate.get(fillDate)?.bars.find(candidate => candidate.symbol === order.symbol)
    if (bar === undefined) {
      reject(rejections, order, 'missing_bar')
      continue
    }
    const blocked = openBlocked(bar, order.side)
    if (blocked !== undefined) {
      reject(rejections, order, blocked)
      continue
    }
    const price = fillPrice(bar, order.side, policy.slippageBps)
    const notional = rounded(price * order.quantity)
    const fee = costs(order.side, notional, policy)
    const lots = lotsBySymbol.get(order.symbol) ?? []

    if (order.side === 'buy') {
      const required = rounded(notional + fee.totalFees)
      if (cash < required) {
        reject(rejections, order, 'insufficient_cash')
        continue
      }
      cash = rounded(cash - required)
      lots.push({ acquiredDate: fillDate, quantity: order.quantity })
      lotsBySymbol.set(order.symbol, lots)
    } else {
      if (totalQuantity(lots) < order.quantity) {
        reject(rejections, order, 'insufficient_position')
        continue
      }
      if (sellableQuantity(lots, fillDate) < order.quantity) {
        reject(rejections, order, 't_plus_one')
        continue
      }
      consumeSellable(lots, fillDate, order.quantity)
      cash = rounded(cash + notional - fee.totalFees)
    }

    fills.push({
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      signalDate: order.signalDate,
      fillDate,
      quantity: order.quantity,
      price,
      notional,
      ...fee,
      cashAfter: cash,
    })
  }

  const positions = markedPositions(lotsBySymbol, sessions)
  return deepFreeze({
    schemaVersion: TACTIC_LAB_EXECUTION_SCHEMA_VERSION,
    engineVersion: TACTIC_LAB_EXECUTION_ENGINE_VERSION,
    policy: { ...policy },
    sessionDates,
    inputSessionHashes: sessions.map(session => session.contentHash),
    fills,
    rejections,
    finalCash: cash,
    positions,
    finalEquity: rounded(cash + positions.reduce((sum, position) => sum + position.marketValue, 0)),
  })
}
