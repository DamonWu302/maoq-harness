import { describe, expect, it } from 'vitest'
import { parseP3CanaryOptions } from './maoq-p3-canary.ts'

describe('MAOQ P3 production canary CLI', () => {
  it('defaults to a one-session low-load probe with an explicit date range', () => {
    expect(parseP3CanaryOptions(['--start', '2026-09-01', '--end', '2026-09-01'], {})).toEqual({
      mode: 'probe',
      tacticId: 'industry_relative_exhaustion_repair',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      minimumStocks: 3000,
      chunkSessions: 1,
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      database: 'long_short_stock',
      connectTimeoutMs: 5000,
      queryTimeoutMs: 60000,
    })
  })

  it('accepts a bounded fixed-tactic evaluation and deployment endpoint', () => {
    expect(parseP3CanaryOptions([
      '--mode', 'evaluate',
      '--tactic', 'openable_emotion_leader',
      '--start', '2026-01-01',
      '--end', '2026-08-31',
      '--chunk-sessions', '20',
      '--connect-timeout-ms', '1500',
      '--query-timeout-ms', '30000',
    ], {
      MAOQ_MYSQL_SOCKET: '/tmp/mysql.sock',
      MAOQ_MYSQL_USER: 'reader',
      MAOQ_MYSQL_DATABASE: 'market',
    })).toMatchObject({
      mode: 'evaluate',
      tacticId: 'openable_emotion_leader',
      chunkSessions: 20,
      socketPath: '/tmp/mysql.sock',
      user: 'reader',
      database: 'market',
      connectTimeoutMs: 1500,
      queryTimeoutMs: 30000,
    })
  })

  it.each([
    [['--start', '2026-09-02', '--end', '2026-09-01'], /must not exceed/],
    [['--start', '2026-09-01', '--end', '2026-09-01', '--mode', 'all'], /probe or evaluate/],
    [['--start', '2026-09-01', '--end', '2026-09-01', '--tactic', 'unknown'], /must be one of/],
    [['--start', '2026-02-30', '--end', '2026-09-01'], /ISO calendar date/],
  ] as const)('rejects unsafe or irreproducible arguments %#', (args, message) => {
    expect(() => parseP3CanaryOptions(args, {})).toThrow(message)
  })
})
