// Persist FileSystemFileHandle objects across page reloads. Sessions live in
// localStorage, which can't hold handles, but IndexedDB can (they survive the
// structured clone), so handles are stored here keyed by session id. On
// restore the handle may need permission re-granted; the save path handles
// that since permission prompts require a user gesture.

import { idbStore } from "./idb-store";

const handles = idbStore<FileSystemFileHandle>("pynote-file-handles", "handles");

export const saveFileHandle = async (sessionId: string, handle: FileSystemFileHandle) => {
  try {
    await handles.put(sessionId, handle);
  } catch {
    // Persistence is best-effort; saving still works via picker/download.
  }
};

export const loadFileHandle = async (sessionId: string): Promise<FileSystemFileHandle | null> => {
  try {
    return (await handles.get(sessionId)) ?? null;
  } catch {
    return null;
  }
};

export const deleteFileHandle = async (sessionId: string) => {
  try {
    await handles.delete(sessionId);
  } catch {
    // Stale entries are harmless.
  }
};
