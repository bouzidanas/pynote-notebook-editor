// Persist FileSystemFileHandle objects across page reloads. Sessions live in
// localStorage, which can't hold handles, but IndexedDB can (they survive the
// structured clone), so handles are stored here keyed by session id. On
// restore the handle may need permission re-granted; the save path handles
// that since permission prompts require a user gesture.

const DB_NAME = "pynote-file-handles";
const STORE = "handles";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
};

export const saveFileHandle = async (sessionId: string, handle: FileSystemFileHandle) => {
  try {
    await withStore("readwrite", (s) => s.put(handle, sessionId));
  } catch {
    // Persistence is best-effort; saving still works via picker/download.
  }
};

export const loadFileHandle = async (sessionId: string): Promise<FileSystemFileHandle | null> => {
  try {
    return ((await withStore("readonly", (s) => s.get(sessionId))) as FileSystemFileHandle) ?? null;
  } catch {
    return null;
  }
};

export const deleteFileHandle = async (sessionId: string) => {
  try {
    await withStore("readwrite", (s) => s.delete(sessionId));
  } catch {
    // Stale entries are harmless.
  }
};
