import { describe, expect, it, vi } from 'vitest'
import type mysql from 'mysql2/promise'
import { createReadOnlyMysqlQuery } from '../src/query.ts'

describe('read-only MySQL query', () => {
  it('bounds connection and statement latency while closing the connection', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ value: 1 }], []])
    const end = vi.fn().mockResolvedValue(undefined)
    const createConnection = vi.fn().mockResolvedValue({ query, end }) as unknown as typeof mysql.createConnection
    const executor = createReadOnlyMysqlQuery({ user: 'reader' }, async () => undefined, createConnection)

    await expect(executor.rows<{ value: number }>('SELECT ?', [1])).resolves.toEqual([{ value: 1 }])
    expect(createConnection).toHaveBeenCalledWith(expect.objectContaining({
      user: 'reader',
      connectTimeout: 5_000,
    }))
    expect(query).toHaveBeenNthCalledWith(1, 'SET SESSION TRANSACTION READ ONLY')
    expect(query).toHaveBeenNthCalledWith(2, { sql: 'SELECT ?', timeout: 60_000 }, [1])
    expect(end).toHaveBeenCalledOnce()
  })

  it('honors shorter canary deadlines and closes after statement failure', async () => {
    const failure = new Error('statement timeout')
    const query = vi.fn()
      .mockResolvedValueOnce([[], []])
      .mockRejectedValueOnce(failure)
    const end = vi.fn().mockResolvedValue(undefined)
    const createConnection = vi.fn().mockResolvedValue({ query, end }) as unknown as typeof mysql.createConnection
    const executor = createReadOnlyMysqlQuery({
      user: 'reader',
      socketPath: '/tmp/maoq-mysql.sock',
      connectTimeoutMs: 1_500,
      queryTimeoutMs: 3_000,
    }, async () => 'secret', createConnection)

    await expect(executor.rows('SELECT 1', [])).rejects.toBe(failure)
    expect(createConnection).toHaveBeenCalledWith(expect.objectContaining({
      socketPath: '/tmp/maoq-mysql.sock',
      password: 'secret',
      connectTimeout: 1_500,
    }))
    expect(query).toHaveBeenNthCalledWith(2, { sql: 'SELECT 1', timeout: 3_000 }, [])
    expect(end).toHaveBeenCalledOnce()
  })
})
