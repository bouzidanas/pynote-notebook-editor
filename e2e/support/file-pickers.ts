import type { Page } from "@playwright/test";

/**
 * In-memory stand-ins for the File System Access API pickers.
 *
 * Chromium exposes `showOpenFilePicker` / `showSaveFilePicker` /
 * `showDirectoryPicker`, which open native dialogs that Playwright cannot
 * drive. Installing these stubs before the app loads keeps the app on its
 * real handle-based code path (open without reload, save back to the same
 * handle, write into a folder) while the test decides which files are
 * "picked" and reads back every byte the app writes.
 */
export interface PickedFile {
  name: string;
  content: string;
}

declare global {
  interface Window {
    __pynoteFilePickers?: {
      nextOpen: PickedFile | null;
      nextSaveName: string | null;
      writes: PickedFile[];
      lastSavePickerOptions: unknown;
      lastOpenPickerOptions: unknown;
      // What the directory picker's folder already holds (paths), so tests
      // can exercise "replace?" prompts.
      folderEntries: string[];
      folderName: string;
    };
  }
}

export interface FilePickerStubOptions {
  // false removes showOpenFilePicker entirely (including Chromium's native
  // one), so the app falls back to its hidden <input type=file>. Done in this
  // same init script because Playwright does not order separate init scripts.
  openPicker?: boolean;
  // false removes the save and directory pickers too: the app takes the
  // download path other browsers use.
  savePickers?: boolean;
  // true makes the open picker hand out real file handles (files in the
  // origin private file system holding the queued content). Unlike the
  // in-memory stand-ins they survive in IndexedDB, as a picked file's handle
  // does, so a reload keeps them as the save target. Read them back with
  // originPrivateFile.
  realOpenHandles?: boolean;
}

export async function installFilePickerStubs(page: Page, options: FilePickerStubOptions = {}): Promise<void> {
  await page.addInitScript(({ openPicker, savePickers, realOpenHandles }) => {
    const state = {
      nextOpen: null as PickedFile | null,
      nextSaveName: null as string | null,
      writes: [] as PickedFile[],
      lastSavePickerOptions: null as unknown,
      lastOpenPickerOptions: null as unknown,
      folderEntries: [] as string[],
      folderName: "Exports",
    };
    window.__pynoteFilePickers = state;

    const asText = async (data: unknown) => (typeof data === "string" ? data : await new Blob([data as BlobPart]).text());

    // `path` is what the write is recorded as (a name, or a path inside the
    // picked folder).
    const makeFileHandle = (name: string, initialContent: string, path = name) => {
      let content = initialContent;
      const handle = {
        kind: "file" as const,
        name,
        getFile: async () => new File([content], name),
        createWritable: async () => {
          const chunks: string[] = [];
          return {
            write: async (data: unknown) => {
              chunks.push(await asText(data));
            },
            close: async () => {
              content = chunks.join("");
              state.writes.push({ name: path, content });
            },
          };
        },
        queryPermission: async () => "granted",
        requestPermission: async () => "granted",
        isSameEntry: async (other: unknown) => other === handle,
      };
      return handle;
    };

    const notFound = () => new DOMException("Not found", "NotFoundError");

    const makeDirectoryHandle = (name: string, prefix: string): any => ({
      kind: "directory" as const,
      name,
      getFileHandle: async (child: string, opts?: { create?: boolean }) => {
        const path = `${prefix}${child}`;
        if (!opts?.create && !state.folderEntries.includes(path)) throw notFound();
        if (!state.folderEntries.includes(path)) state.folderEntries.push(path);
        return makeFileHandle(child, "", path);
      },
      getDirectoryHandle: async (child: string, opts?: { create?: boolean }) => {
        const path = `${prefix}${child}/`;
        if (!opts?.create && !state.folderEntries.some((entry) => entry.startsWith(path))) throw notFound();
        if (!state.folderEntries.includes(path)) state.folderEntries.push(path);
        return makeDirectoryHandle(child, path);
      },
      removeEntry: async (child: string) => {
        const path = `${prefix}${child}`;
        state.folderEntries = state.folderEntries.filter((entry) => entry !== path && !entry.startsWith(`${path}/`));
      },
    });

    if (openPicker) {
      (window as any).showOpenFilePicker = async (options?: unknown) => {
        state.lastOpenPickerOptions = options ?? null;
        const file = state.nextOpen;
        state.nextOpen = null;
        if (!file) throw new DOMException("No file queued by the test", "AbortError");
        if (realOpenHandles) {
          const handle = await (await navigator.storage.getDirectory()).getFileHandle(file.name, { create: true });
          const writable = await handle.createWritable();
          await writable.write(file.content);
          await writable.close();
          return [handle];
        }
        return [makeFileHandle(file.name, file.content)];
      };
    } else {
      delete (window as any).showOpenFilePicker;
      delete (Window.prototype as any).showOpenFilePicker;
    }

    if (savePickers) {
      (window as any).showSaveFilePicker = async (options?: { suggestedName?: string }) => {
        state.lastSavePickerOptions = options ?? null;
        // A queued name stands for the user renaming the file or switching its
        // type in the save dialog.
        const name = state.nextSaveName ?? options?.suggestedName ?? "untitled";
        state.nextSaveName = null;
        return makeFileHandle(name, "");
      };
      (window as any).showDirectoryPicker = async () => makeDirectoryHandle(state.folderName, "");
    } else {
      for (const api of ["showSaveFilePicker", "showDirectoryPicker"]) {
        delete (window as any)[api];
        delete (Window.prototype as any)[api];
      }
    }
  }, { openPicker: options.openPicker ?? true, savePickers: options.savePickers ?? true, realOpenHandles: options.realOpenHandles ?? false });
}

/** The content of a file in the origin private file system, or null. */
export async function originPrivateFile(page: Page, name: string): Promise<string | null> {
  return page.evaluate(async (fileName) => {
    try {
      const handle = await (await navigator.storage.getDirectory()).getFileHandle(fileName);
      return await (await handle.getFile()).text();
    } catch {
      return null;
    }
  }, name);
}

/** Queue the file the next `showOpenFilePicker` call returns. */
export async function queueFileToOpen(page: Page, file: PickedFile): Promise<void> {
  await page.evaluate((f) => {
    window.__pynoteFilePickers!.nextOpen = f;
  }, file);
}

/** Name the next save dialog returns (as if the user chose it there). */
export async function queueSaveName(page: Page, name: string): Promise<void> {
  await page.evaluate((n) => {
    window.__pynoteFilePickers!.nextSaveName = n;
  }, name);
}

/** Paths the folder the directory picker returns already contains. */
export async function setFolderEntries(page: Page, entries: string[]): Promise<void> {
  await page.evaluate((e) => {
    window.__pynoteFilePickers!.folderEntries = e;
  }, entries);
}

/** The options the app passed to the last showOpenFilePicker call. */
export async function lastOpenPickerOptions(page: Page): Promise<any> {
  return page.evaluate(() => window.__pynoteFilePickers?.lastOpenPickerOptions ?? null);
}

/** The options the app passed to the last showSaveFilePicker call. */
export async function lastSavePickerOptions(page: Page): Promise<any> {
  return page.evaluate(() => window.__pynoteFilePickers?.lastSavePickerOptions ?? null);
}

/** Every file the app has written through a stubbed handle, oldest first. */
export async function writtenFiles(page: Page): Promise<PickedFile[]> {
  return page.evaluate(() => window.__pynoteFilePickers?.writes ?? []);
}
