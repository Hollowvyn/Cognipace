import sqlite3InitModule, {
  type Database,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'

import sqliteWasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'

import { createProxyCallback } from './proxy'
import * as schema from './schema'

export type DbSchema = typeof schema
export type Db = SqliteRemoteDatabase<DbSchema>

export interface CreateDbOptions {
  onMutation?: ((sql: string) => void) | null
  filename?: string
  migrationSql?: string
  locateWasm?: (file: string) => string
}

export interface DbHandle {
  db: Db
  rawDb: Database
  sqlite3: Sqlite3Static
}

let cachedSqlite3: Promise<Sqlite3Static> | undefined
let cachedLocateKey: string | undefined

type SqliteInitOptions = { locateFile?: (file: string) => string }
const initializeSqliteWasm: (
  options?: SqliteInitOptions,
) => Promise<Sqlite3Static> = sqlite3InitModule

export function createSqliteWasmLocator() {
  return (file: string) => {
    if (file.endsWith('sqlite3.wasm')) {
      const cwd = getProcessCwd()

      if (cwd && sqliteWasmUrl.startsWith('/node_modules/')) {
        return `${cwd}${sqliteWasmUrl}`
      }

      return sqliteWasmUrl
    }

    return file
  }
}

function getProcessCwd() {
  const runtime = globalThis as {
    process?: {
      cwd?: () => string
    }
  }

  return runtime.process?.cwd?.()
}

async function loadSqlite3(locateWasm: ((file: string) => string) | undefined) {
  const locateKey = locateWasm ? 'custom' : 'default'

  if (!cachedSqlite3 || cachedLocateKey !== locateKey) {
    cachedSqlite3 = initializeSqliteWasm(
      locateWasm ? { locateFile: locateWasm } : undefined,
    )
    cachedLocateKey = locateKey
  }

  return cachedSqlite3
}

export async function createDb(
  options: CreateDbOptions = {},
): Promise<DbHandle> {
  const sqlite3 = await loadSqlite3(options.locateWasm)
  const rawDb = new sqlite3.oo1.DB(options.filename ?? ':memory:', 'c')

  rawDb.exec('PRAGMA foreign_keys = ON')

  if (options.migrationSql) {
    rawDb.exec(options.migrationSql)
  }

  return {
    db: drizzle(createProxyCallback(rawDb, options.onMutation), { schema }),
    rawDb,
    sqlite3,
  }
}
