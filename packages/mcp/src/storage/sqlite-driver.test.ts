import { describe, expect, test } from 'bun:test'
import { adaptNodeDatabase } from './sqlite-driver'

function createMockNodeDatabase() {
  const prepareCalls: string[] = []
  let closeCalls = 0

  const db = {
    exec(_sql: string): void {},
    prepare(sql: string) {
      prepareCalls.push(sql)
      const statement = {
        sql,
        all(this: { sql: string }, ...params: unknown[]) {
          if (this !== statement) throw new Error('illegal statement receiver')
          return [{ sql: this.sql, params }]
        },
        get(this: { sql: string }, ...params: unknown[]) {
          if (this !== statement) throw new Error('illegal statement receiver')
          return { sql: this.sql, params }
        },
        run(this: { sql: string }, ...params: unknown[]) {
          if (this !== statement) throw new Error('illegal statement receiver')
          return { changes: params.length, lastInsertRowid: 1 }
        },
      }
      return statement
    },
    close(): void {
      closeCalls += 1
    },
  }

  return {
    db,
    prepareCalls,
    get closeCalls() {
      return closeCalls
    },
  }
}

describe('adaptNodeDatabase statement cache', () => {
  test('reuses one prepared statement for identical SQL', () => {
    const mock = createMockNodeDatabase()
    const db = adaptNodeDatabase(mock.db)

    expect(db.query('SELECT ?').get(1)).toEqual({ sql: 'SELECT ?', params: [1] })
    expect(db.query('SELECT ?').get(2)).toEqual({ sql: 'SELECT ?', params: [2] })

    expect(mock.prepareCalls).toEqual(['SELECT ?'])
  })

  test('keeps different SQL statements independent', () => {
    const mock = createMockNodeDatabase()
    const db = adaptNodeDatabase(mock.db)

    expect(db.query('SELECT ?').get(1)).toEqual({ sql: 'SELECT ?', params: [1] })
    expect(db.query('SELECT ?, ?').get(1, 2)).toEqual({
      sql: 'SELECT ?, ?',
      params: [1, 2],
    })

    expect(mock.prepareCalls).toEqual(['SELECT ?', 'SELECT ?, ?'])
  })

  test('wraps statement methods without losing their receiver', () => {
    const mock = createMockNodeDatabase()
    const db = adaptNodeDatabase(mock.db)
    const statement = db.query('INSERT INTO t VALUES (?)')

    const { all, get, run } = statement

    expect(all('a')).toEqual([{ sql: 'INSERT INTO t VALUES (?)', params: ['a'] }])
    expect(get('b')).toEqual({ sql: 'INSERT INTO t VALUES (?)', params: ['b'] })
    expect(run('c')).toEqual({ changes: 1, lastInsertRowid: 1 })
  })

  test('close is idempotent and query fails after close', () => {
    const mock = createMockNodeDatabase()
    const db = adaptNodeDatabase(mock.db)

    db.query('SELECT ?').get(1)
    db.close()
    db.close()

    expect(mock.closeCalls).toBe(1)
    expect(() => db.query('SELECT ?')).toThrow('SQLite database is closed')
  })
})
