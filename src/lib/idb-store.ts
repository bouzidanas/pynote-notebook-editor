// A key-value store in IndexedDB: one object store in a database of its own.
// Each call opens the database and closes it when done, so no connection
// stays open between uses. Writes resolve once their transaction has
// committed, so the data is stored for good when the promise resolves (a
// write still pending when the page unloads can be dropped).

export interface IdbStore<T> {
  get(key: string): Promise<T | undefined>;
  put(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export function idbStore<T>(dbName: string, storeName: string): IdbStore<T> {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const run = async <R>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const db = await open();
    try {
      return await new Promise<R>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = request(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new DOMException("The transaction was aborted.", "AbortError"));
      });
    } finally {
      db.close();
    }
  };

  return {
    get: (key) => run("readonly", (store) => store.get(key) as IDBRequest<T | undefined>),
    put: async (key, value) => {
      await run("readwrite", (store) => store.put(value, key));
    },
    delete: async (key) => {
      await run("readwrite", (store) => store.delete(key));
    },
  };
}
