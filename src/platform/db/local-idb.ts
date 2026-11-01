import { localDatabaseVersion, upgradeLocalDatabase } from './local-idb-schema'
import {
  isBinary,
  localHeadSchema,
  type LocalIdbStore,
  type LocalStores,
} from './local-store-types'

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function createLocalIdbStore(
  factory: IDBFactory,
  databaseName = 'cognipace-local-v1',
): LocalIdbStore {
  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(databaseName, localDatabaseVersion)
      let settled = false
      let failure: unknown
      request.onupgradeneeded = () => {
        try {
          upgradeLocalDatabase(request.result, request.transaction!)
        } catch (error) {
          failure = error
          request.transaction!.abort()
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        if (settled) {
          database.close()
          return
        }
        settled = true
        resolve(database)
      }
      request.onerror = () => {
        if (settled) return
        settled = true
        reject(asError(failure ?? request.error))
      }
      request.onblocked = () => {
        if (settled) return
        settled = true
        reject(new Error('The local snapshot database is blocked.'))
      }
    })
  }
  const store: LocalIdbStore = {
    async transact<T, Name extends string>(
      names: readonly Name[],
      mode: IDBTransactionMode,
      operate: (
        stores: LocalStores<Name>,
        finish: (value: T) => void,
        fail: (error: unknown) => void,
      ) => void,
    ): Promise<T> {
      const database = await openDatabase()
      return new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction
        try {
          transaction = database.transaction(
            [...names],
            mode,
            mode === 'readwrite' ? { durability: 'strict' } : undefined,
          )
        } catch (error) {
          database.close()
          reject(asError(error))
          return
        }
        let result: T
        let failure: unknown
        transaction.oncomplete = () => {
          database.close()
          resolve(result)
        }
        transaction.onerror = () => {
          database.close()
          reject(asError(failure ?? transaction.error))
        }
        transaction.onabort = () => {
          database.close()
          reject(
            asError(
              failure ??
                transaction.error ??
                new Error('Local transaction aborted.'),
            ),
          )
        }
        const fail = (error: unknown) => {
          failure = error
          transaction.abort()
        }
        try {
          const stores = Object.fromEntries(
            names.map((name) => [name, transaction.objectStore(name)]),
          ) as LocalStores<Name>
          operate(
            stores,
            (value) => {
              result = value
            },
            fail,
          )
        } catch (error) {
          fail(error)
        }
      })
    },
    readRecord(key) {
      return store.transact(['records'], 'readonly', (stores, finish) => {
        const request = stores.records.get(key)
        request.onsuccess = () => finish(request.result)
      })
    },
    writeTechnicalRecord(key, value) {
      return store.transact(['records'], 'readwrite', (stores, finish) => {
        stores.records.put(value, key)
        finish(undefined)
      })
    },
    async readHead() {
      const value = await store.readRecord('active')
      return value === undefined ? null : localHeadSchema.parse(value)
    },
    readCore(id) {
      return store.transact(
        ['coreSnapshots'],
        'readonly',
        (stores, finish, fail) => {
          const request = stores.coreSnapshots.get(id)
          request.onsuccess = () => {
            if (request.result === undefined) finish(null)
            else if (isBinary(request.result)) finish(request.result)
            else fail(new Error('The stored core snapshot is invalid.'))
          }
        },
      )
    },
  }
  return store
}
