import type { BindableValue, Database, SqlValue } from '@sqlite.org/sqlite-wasm'
import type { RemoteCallback } from 'drizzle-orm/sqlite-proxy'

export type ProxyMethod = 'run' | 'all' | 'get' | 'values'

export interface ProxyResult {
  rows: SqlValue[] | SqlValue[][]
}

export function execProxy(
  rawDb: Database,
  sql: string,
  params: readonly BindableValue[],
  method: ProxyMethod,
): ProxyResult {
  const stmt = rawDb.prepare(sql)

  try {
    if (params.length > 0) {
      stmt.bind([...params])
    }

    if (method === 'run') {
      stmt.step()
      return { rows: [] }
    }

    const rows: SqlValue[][] = []
    while (stmt.step()) {
      const row: SqlValue[] = []
      for (let index = 0; index < stmt.columnCount; index += 1) {
        row.push(stmt.get(index))
      }
      rows.push(row)

      if (method === 'get') {
        break
      }
    }

    return method === 'get' ? { rows: rows[0] ?? [] } : { rows }
  } finally {
    stmt.finalize()
  }
}

let onMutationHook: ((sql: string) => void) | null = null

export function setOnMutationHook(hook: ((sql: string) => void) | null) {
  onMutationHook = hook
}

export function createProxyCallback(
  rawDb: Database,
  onMutation?: ((sql: string) => void) | null,
): RemoteCallback {
  return (sql, params, method) => {
    const result = execProxy(rawDb, sql, normalizeProxyParams(params), method)

    const hook = onMutation === undefined ? onMutationHook : onMutation
    if (method === 'run' && hook && isMutationStatement(sql)) {
      hook(sql)
    }

    return Promise.resolve(result)
  }
}

export function isMutationStatement(sql: string) {
  return /^\s*(insert|update|delete|replace|create|alter|drop)\b/i.test(sql)
}

function normalizeProxyParams(params: readonly unknown[]): BindableValue[] {
  return params.map((param) => {
    if (
      param === null ||
      param === undefined ||
      typeof param === 'string' ||
      typeof param === 'number' ||
      typeof param === 'bigint' ||
      typeof param === 'boolean' ||
      param instanceof Uint8Array ||
      param instanceof Int8Array ||
      param instanceof ArrayBuffer
    ) {
      return param
    }

    throw new Error(
      `Unsupported SQLite bind parameter type: ${Object.prototype.toString.call(param)}`,
    )
  })
}
