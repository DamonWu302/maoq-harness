/** Read-only MySQL acquisition adapter for MAOQ MarketSnapshot v1. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-market-news-web'
import type {} from '@deepseek-ai/dsh-market-snapshot'
import mysql from 'mysql2/promise'
import { LongShortStockMysqlAdapter, type MarketSnapshotQuery } from './adapter.ts'

export { LongShortStockMysqlAdapter, MarketSnapshotMysqlError } from './adapter.ts'
export type { MarketSnapshotQuery } from './adapter.ts'
export {
  LONG_SHORT_STOCK_HISTORY_MAPPING_VERSION,
  LongShortStockTacticHistoryAdapter,
  MarketTacticHistoryMysqlError,
} from './history-adapter.ts'

/** Read-only database endpoint and quality thresholds. */
export interface Config {
  /** Registry name used by snapshot build requests. */
  readonly adapterName?: string
  /** MySQL TCP host when no Unix socket is selected. */
  readonly host?: string
  /** MySQL TCP port when no Unix socket is selected. */
  readonly port?: number
  /** Optional Unix-domain socket path, which takes precedence over TCP. */
  readonly socketPath?: string
  /** Database account restricted to SELECT access. */
  readonly user: string
  /** Database containing the upstream quality-gated market tables. */
  readonly database?: string
  /** Credential reference for the database password; literal passwords are unsupported. */
  readonly passwordEnv?: string
  /** Local stock-count floor applied in addition to the upstream quality threshold. */
  readonly minimumStocks?: number
  /** Number of usable sessions read to derive consecutive-board facts. */
  readonly historySessions?: number
}

export const name = 'market-snapshot-mysql'
export const inject = ['marketSnapshots']

/** Configuration schema. Passwords remain credential references, never literals. */
export const Config: z<Config> = z.object({
  adapterName: z.string().default('long-short-stock-mysql'),
  host: z.string().default('127.0.0.1'),
  port: z.number().step(1).min(1).max(65535).default(3306),
  socketPath: z.string(),
  user: z.string().required(),
  database: z.string().default('long_short_stock'),
  passwordEnv: z.string().role('credential-ref'),
  minimumStocks: z.number().step(1).min(1).default(3000),
  historySessions: z.number().step(1).min(2).max(60).default(20),
})

/** Register a read-only adapter; a fresh connection resolves rotated credentials per build. */
export function apply(ctx: Context, config: Config): void {
  const query: MarketSnapshotQuery = {
    async rows<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
      const password = config.passwordEnv === undefined
        ? undefined
        : (await ctx.get('credentials')?.resolve(credentialRef(config.passwordEnv)))?.value
      if (config.passwordEnv !== undefined && password === undefined) throw new Error(`mysql credential ${config.passwordEnv} is not configured`)
      const connection = await mysql.createConnection({
        host: config.host ?? '127.0.0.1',
        port: config.port ?? 3306,
        ...config.socketPath === undefined ? {} : { socketPath: config.socketPath },
        user: config.user,
        database: config.database ?? 'long_short_stock',
        ...password === undefined ? {} : { password },
        dateStrings: true,
      })
      try {
        await connection.query('SET SESSION TRANSACTION READ ONLY')
        const [result] = await connection.query(sql, [...parameters])
        return result as T[]
      } finally {
        await connection.end()
      }
    },
  }
  const adapter = new LongShortStockMysqlAdapter(query, {
    ...config.adapterName === undefined ? {} : { adapterName: config.adapterName },
    ...config.minimumStocks === undefined ? {} : { minimumStocks: config.minimumStocks },
    ...config.historySessions === undefined ? {} : { historySessions: config.historySessions },
    readNewsBatch: async (hash) => {
      const news = ctx.get('marketNews')
      if (news === undefined) throw new Error('market news evidence service is not mounted')
      return news.get(hash)
    },
  })
  ctx.effect(() => ctx.marketSnapshots.register(adapter))
}
