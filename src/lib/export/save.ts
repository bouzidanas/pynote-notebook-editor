import { zipFiles } from "./zip";

// Where an export goes. Choosing happens first, while the click that started
// the export still counts as a user gesture (browsers only open file pickers
// then); building the export can take seconds (a web app downloads Python),
// so the content is written afterwards through the returned target.
//
// With the File System Access API (Chromium) files are written where the
// user picks; elsewhere they are downloaded: one file as itself, several as
// one .zip. A page that starts several downloads at once can lose some of
// them (Safari keeps only the last; other browsers may ask to allow multiple
// downloads), so an export is always a single download.

export type FileContent = string | Uint8Array;
export type OutputFiles = ReadonlyMap<string, FileContent>;

export interface SaveTarget {
  /** Write the export. Paths are relative ("index.html", "pyodide/x.js"). */
  write(files: OutputFiles): Promise<void>;
}

export interface FileKind {
  description: string;
  mime: string;
  extension: string; // with the dot
}

const asBlobPart = (content: FileContent): BlobPart => (typeof content === "string" ? content : (content as BlobPart));

const download = (name: string, content: FileContent, mime: string) => {
  const url = URL.createObjectURL(new Blob([asBlobPart(content)], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Some browsers start the download asynchronously; keep the URL alive briefly.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const writeHandle = async (handle: FileSystemFileHandle, content: FileContent) => {
  const writable = await handle.createWritable();
  await writable.write(asBlobPart(content) as FileSystemWriteChunkType);
  await writable.close();
};

/** One file. Resolves to null when the user cancels the picker. */
export async function chooseFile(name: string, kind: FileKind): Promise<SaveTarget | null> {
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker !== "function") {
    return { write: async (files) => download(name, single(files), kind.mime) };
  }
  let handle: FileSystemFileHandle;
  try {
    handle = await picker({ suggestedName: name, types: [{ description: kind.description, accept: { [kind.mime]: [kind.extension] } }] });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
  return { write: (files) => writeHandle(handle, single(files)) };
}

const single = (files: OutputFiles): FileContent => {
  const [content] = files.values();
  if (files.size !== 1 || content === undefined) throw new Error("Expected exactly one file.");
  return content;
};

// Iterating a folder (FileSystemDirectoryHandle.values) is typed in the
// DOM.AsyncIterable lib, which the app's TypeScript setup leaves out.
type ListedDirectory = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };

const isNotFound = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

const isEmpty = async (dir: FileSystemDirectoryHandle) => (await (dir as ListedDirectory).values()[Symbol.asyncIterator]().next()).done === true;

const pickFolder = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    return await (window as any).showDirectoryPicker({ id: "pynote-export", mode: "readwrite" });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
};

const hasFolderAccess = () => typeof (window as any).showDirectoryPicker === "function";

const writeFiles = async (root: FileSystemDirectoryHandle, files: OutputFiles) => {
  for (const [path, content] of files) {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
    await writeHandle(await dir.getFileHandle(parts[parts.length - 1], { create: true }), content);
  }
};

/** "a", "a and b", "a, b and c". */
const listText = (items: readonly string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * Several files, straight into a folder the user picks; files already there
 * with these names are replaced only after asking. Without folder access,
 * they download as one .zip named `archive`, with the files at its top.
 * Resolves to null when the user cancels.
 */
export async function chooseFolder(paths: readonly string[], archive: string): Promise<SaveTarget | null> {
  if (!hasFolderAccess()) {
    return { write: async (files) => download(archive, zipFiles(files), "application/zip") };
  }
  const base = await pickFolder();
  if (!base) return null;
  const exists = async (path: string) => {
    try {
      await base.getFileHandle(path);
      return true;
    } catch {
      return false;
    }
  };
  const taken = (await Promise.all(paths.map(async (path) => ((await exists(path)) ? path : null)))).filter((p): p is string => p !== null);
  if (taken.length > 0 && !confirm(`Replace ${listText(taken)} in “${base.name}”?`)) return null;
  return { write: (files) => writeFiles(base, files) };
}

/**
 * How to tell an earlier export of a kind in a folder, and the files it wrote
 * there. Exporting into that folder again replaces those files and nothing
 * else; a folder that is not recognizably such an export is never touched.
 */
export interface EarlierExport {
  /** A top-level file whose start shows an earlier export (its index.html). */
  marker: { path: string; matches: (start: string) => boolean };
  /** Folders inside it where such an export also writes files. */
  folders: readonly string[];
  /** Whether a file there is one the export wrote, from its path and its start. */
  owns: (path: string, start: string) => boolean;
}

// The start of a file: enough for a marker or a signature.
const startOf = async (handle: FileSystemFileHandle) => (await handle.getFile()).slice(0, 4096).text();

// The files in `folder` an earlier export wrote (paths relative to it), and
// how many other files and folders sit next to them.
async function earlierFiles(folder: FileSystemDirectoryHandle, earlier: EarlierExport): Promise<{ owned: string[]; others: number }> {
  const owned: string[] = [];
  let others = 0;
  const visit = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const entry of (dir as ListedDirectory).values()) {
      const path = `${prefix}${entry.name}`;
      if (entry.kind === "directory") {
        if (!prefix && earlier.folders.includes(entry.name)) await visit(entry as FileSystemDirectoryHandle, `${path}/`);
        else others++;
      } else if (earlier.owns(path, await startOf(entry as FileSystemFileHandle))) {
        owned.push(path);
      } else {
        others++;
      }
    }
  };
  await visit(folder, "");
  return { owned, others };
}

// "index.html, pynote.js and 3 files in pyodide/".
const describeFiles = (paths: readonly string[]) => {
  const inFolders = new Map<string, number>();
  const top: string[] = [];
  for (const path of paths) {
    const slash = path.indexOf("/");
    if (slash < 0) top.push(path);
    else inFolders.set(path.slice(0, slash), (inFolders.get(path.slice(0, slash)) ?? 0) + 1);
  }
  return listText([...top, ...[...inFolders].map(([dir, n]) => `${n} ${n === 1 ? "file" : "files"} in ${dir}/`)]);
};

/**
 * A folder export: the files go into a folder named `name` inside the folder
 * the user picks. If that folder exists, it must be an earlier export of the
 * same kind (see EarlierExport): after asking, the files that export wrote
 * are replaced, and the files this one does not write again are removed;
 * everything else in the folder stays. Any other folder of that name stops
 * the export with an error. Without folder access, the files download as one
 * `name.zip`. Resolves to null when the user cancels.
 */
export async function chooseExportFolder(name: string, earlier: EarlierExport): Promise<SaveTarget | null> {
  if (!hasFolderAccess()) {
    return {
      write: async (files) => {
        const prefixed = new Map([...files].map(([path, content]) => [`${name}/${path}`, content]));
        download(`${name}.zip`, zipFiles(prefixed), "application/zip");
      },
    };
  }
  const base = await pickFolder();
  if (!base) return null;

  let existing: FileSystemDirectoryHandle | null = null;
  try {
    existing = await base.getDirectoryHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === "TypeMismatchError") {
      throw new Error(`“${base.name}” already has a file named “${name}”. Choose another name or folder.`);
    }
    if (!isNotFound(error)) throw error;
  }

  let owned: string[] = [];
  if (existing) {
    let marker: string | null = null;
    try {
      marker = await startOf(await existing.getFileHandle(earlier.marker.path));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    if (marker === null || !earlier.marker.matches(marker)) {
      throw new Error(`“${base.name}” already has a folder named “${name}” that is not a PyNote export, so nothing was changed. Choose another name or folder.`);
    }
    const found = await earlierFiles(existing, earlier);
    owned = found.owned;
    const stays = found.others > 0 ? " Other files in the folder stay." : "";
    if (!confirm(`Replace the PyNote export in “${base.name}/${name}”? Its ${describeFiles(owned)} will be replaced.${stays}`)) return null;
  }

  return {
    write: async (files) => {
      const folder = existing ?? (await base.getDirectoryHandle(name, { create: true }));
      // What the earlier export wrote and this one does not write again.
      const emptied = new Set<string>();
      for (const path of owned) {
        if (files.has(path)) continue;
        const parts = path.split("/");
        let dir = folder;
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
        await dir.removeEntry(parts[parts.length - 1]);
        if (parts.length > 1) emptied.add(parts[0]);
      }
      for (const dir of emptied) {
        if (await isEmpty(await folder.getDirectoryHandle(dir))) await folder.removeEntry(dir);
      }
      await writeFiles(folder, files);
    },
  };
}
