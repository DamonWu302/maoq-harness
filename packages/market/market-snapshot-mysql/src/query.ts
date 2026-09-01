import type { MarketSnapshotQuery } from './adapter.ts'
import mysql from 'mysql2/promise'

/** Bounded connection settings shared by snapshot and tactic-history reads. */
export interface ReadOnlyMysqlQueryConfig {
  readonly host?: string
  readonly port?: number
  readonly socketPath?: string
  readonly user: string
  readonly database?: string
  readonly connectTimeoutMs?: number
  readonly queryTimeoutMs?: number
}

/**
 * Build a fresh-connection SELECT executor with explicit connection and statement deadlines.
 * @param config - Database endpoint and bounded latency settings.
 * @param resolvePassword - Resolve the current credential for each operation.
 * @param createConnection - Injectable mysql2 connection factory used by deterministic tests.
 * @returns A SELECT-only query seam shared by snapshot and tactic-history adapters.
 */
export function createReadOnlyMysqlQuery(
  config: ReadOnlyMysqlQueryConfig,
  resolvePassword: () => Promise<string | undefined>,
  createConnection: typeof mysql.createConnection = mysql.createConnection,
): MarketSnapshotQuery {
  return {
    async rows<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
      const password = await resolvePassword()
      const connection = await createConnection({
        host: config.host ?? '127.0.0.1',
        port: config.port ?? 3306,
        ...config.socketPath === undefined ? {} : { socketPath: config.socketPath },
        user: config.user,
        database: config.database ?? 'long_short_stock',
        ...password === undefined ? {} : { password },
        dateStrings: true,
        connectTimeout: config.connectTimeoutMs ?? 5_000,
      })
      try {
        await connection.query('SET SESSION TRANSACTION READ ONLY')
        const [result] = await connection.query({
          sql,
          timeout: config.queryTimeoutMs ?? 60_000,
        }, [...parameters])
        return result as T[]
      } finally {
        await connection.end()
      }
    },
  }
}
