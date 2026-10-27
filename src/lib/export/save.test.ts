// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseExportFolder, chooseFolder } from "./save";
import { EARLIER_WEB_APP_FOLDER, type WebAppInput, assembleWebApp } from "./web-app";
import { WEB_APP_PAYLOAD_VERSION } from "./web-app-payload";

// Saving into folders, with an in-memory stand-in for the File System Access
// API (the folder the user picks). Node's Blob, unlike jsdom's, can stream,
// which the real asset encoder needs. The Export dialog's own folder flows run
// in e2e/tests/export-dialog.spec.ts.

type Entry = FakeFile | FakeFolder;

class FakeFile {
  readonly kind = "file";
  readonly name: string;
  content: string;
  constructor(name: string, content: string) {
    this.name = name;
    this.content = content;
  }
  async getFile() {
    return new File([this.content], this.name);
  }
  async createWritable() {
    const chunks: string[] = [];
    return {
      write: async (data: unknown) => void chunks.push(typeof data === "string" ? data : await new Blob([data as BlobPart]).text()),
      close: async () => void (this.content = chunks.join("")),
    };
  }
}

const error = (name: string) => new DOMException(name, name);

class FakeFolder {
  readonly kind = "directory";
  readonly entries = new Map<string, Entry>();
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const entry = this.entries.get(name);
    if (entry instanceof FakeFile) return entry;
    if (entry) throw error("TypeMismatchError");
    if (!options?.create) throw error("NotFoundError");
    const file = new FakeFile(name, "");
    this.entries.set(name, file);
    return file;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const entry = this.entries.get(name);
    if (entry instanceof FakeFolder) return entry;
    if (entry) throw error("TypeMismatchError");
    if (!options?.create) throw error("NotFoundError");
    const folder = new FakeFolder(name);
    this.entries.set(name, folder);
    return folder;
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    const entry = this.entries.get(name);
    if (!entry) throw error("NotFoundError");
    if (entry instanceof FakeFolder && entry.entries.size > 0 && !options?.recursive) throw error("InvalidModificationError");
    this.entries.delete(name);
  }
  async *values() {
    yield* this.entries.values();
  }
  /** Every file below this folder: path -> content. */
  tree(prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, entry] of this.entries) {
      if (entry instanceof FakeFile) out[`${prefix}${name}`] = entry.content;
      else Object.assign(out, entry.tree(`${prefix}${name}/`));
    }
    return out;
  }
  add(path: string, content: string) {
    const parts = path.split("/");
    let folder: FakeFolder = this;
    for (const part of parts.slice(0, -1)) {
      const next = folder.entries.get(part) ?? new FakeFolder(part);
      folder.entries.set(part, next);
      folder = next as FakeFolder;
    }
    folder.entries.set(parts[parts.length - 1], new FakeFile(parts[parts.length - 1], content));
    return this;
  }
}

// A real folder export, as the Export dialog writes it.
const webApp = async (pyodideFiles?: Record<string, string>) => {
  const input: WebAppInput = {
    runtime: { appJs: "/* app */", appCss: "", workerJs: "/* worker */" },
    payload: {
      pynoteExport: WEB_APP_PAYLOAD_VERSION,
      exportId: "test",
      filename: "sales.ipynb",
      mode: pyodideFiles ? "interactive" : "readonly",
      startInPresentation: false,
      document: { metadata: {}, cells: [] },
      theme: {},
      codeVisibility: {},
      ...(pyodideFiles ? { pyodide: { kind: "embedded" as const, layout: "folder" as const } } : {}),
    },
    fonts: { families: new Set(), text: "", math: false },
    pyodideFiles: pyodideFiles && new Map(Object.entries(pyodideFiles).map(([name, text]) => [name, new TextEncoder().encode(text)])),
    layout: "folder",
    title: "sales",
    colors: { background: "#1e1e2e", text: "#cdd6f4" },
  };
  return assembleWebApp(input);
};

let picked: FakeFolder;
let confirmText: string | null;
let confirmAnswer: boolean;

beforeEach(() => {
  picked = new FakeFolder("projects");
  confirmText = null;
  confirmAnswer = true;
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("showDirectoryPicker", async () => picked);
  vi.stubGlobal("confirm", (text: string) => {
    confirmText = text;
    return confirmAnswer;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const exportTo = async (files: Map<string, string>) => {
  const target = await chooseExportFolder("sales", EARLIER_WEB_APP_FOLDER);
  await target?.write(files);
  return target;
};

describe("chooseExportFolder", () => {
  it("writes a new folder of that name", async () => {
    await exportTo(await webApp());
    expect(Object.keys((picked.entries.get("sales") as FakeFolder).tree()).sort()).toEqual(["README.txt", "index.html", "pynote.css", "pynote.js"]);
    expect(confirmText).toBeNull();
  });

  it("never touches a folder of that name that is not a PyNote export", async () => {
    picked.add("sales/data.csv", "region,total").add("sales/sales.ipynb", "{}").add("sales/index.html", "<!doctype html><title>My site</title>");
    const before = picked.tree();
    await expect(chooseExportFolder("sales", EARLIER_WEB_APP_FOLDER)).rejects.toThrow("not a PyNote export, so nothing was changed");
    expect(picked.tree()).toEqual(before);
    expect(confirmText).toBeNull();
  });

  it("stops when a file has that name", async () => {
    picked.add("sales", "a file");
    await expect(chooseExportFolder("sales", EARLIER_WEB_APP_FOLDER)).rejects.toThrow("already has a file named “sales”");
    expect(picked.tree()).toEqual({ sales: "a file" });
  });

  it("replaces an earlier export's files, after saying exactly which, and keeps everything else", async () => {
    await exportTo(await webApp({ "pyodide.asm.wasm": "wasm", "numpy.whl": "numpy" }));
    picked.add("sales/pyodide/NOTES.txt", "mine").add("sales/data.csv", "mine").add("sales/images/logo.png", "mine");

    await exportTo(await webApp({ "pyodide.asm.wasm": "wasm 2" }));
    expect(confirmText).toBe(
      "Replace the PyNote export in “projects/sales”? Its index.html, pynote.js, pynote.css, README.txt and 2 files in pyodide/ will be replaced. Other files in the folder stay.",
    );
    const tree = (picked.entries.get("sales") as FakeFolder).tree();
    expect(Object.keys(tree).sort()).toEqual([
      "README.txt", "data.csv", "images/logo.png", "index.html", "pynote.css", "pynote.js", "pyodide/NOTES.txt", "pyodide/pyodide.asm.wasm.js",
    ]);
    expect(tree["pyodide/NOTES.txt"]).toBe("mine");
  });

  it("removes the earlier export's pyodide/ folder when nothing else is in it", async () => {
    await exportTo(await webApp({ "pyodide.asm.wasm": "wasm" }));
    await exportTo(await webApp());
    expect(confirmText).toBe("Replace the PyNote export in “projects/sales”? Its index.html, pynote.js, pynote.css, README.txt and 1 file in pyodide/ will be replaced.");
    expect(Object.keys((picked.entries.get("sales") as FakeFolder).tree()).sort()).toEqual(["README.txt", "index.html", "pynote.css", "pynote.js"]);
  });

  it("changes nothing when the user says no", async () => {
    await exportTo(await webApp({ "pyodide.asm.wasm": "wasm" }));
    const before = picked.tree();
    confirmAnswer = false;
    expect(await exportTo(await webApp())).toBeNull();
    expect(picked.tree()).toEqual(before);
  });
});

describe("chooseFolder", () => {
  it("asks before replacing files of the same names, and writes only those", async () => {
    picked.add("notes.py", "old").add("other.txt", "mine");
    const target = await chooseFolder(["notes.py", "notes.md"], "notes.zip");
    expect(confirmText).toBe("Replace notes.py in “projects”?");
    await target!.write(new Map([["notes.py", "new"], ["notes.md", "prose"]]));
    expect(picked.tree()).toEqual({ "notes.py": "new", "notes.md": "prose", "other.txt": "mine" });
  });

  it("without folder access, downloads every file in one .zip", async () => {
    // A browser without the File System Access API (Firefox, Safari): files
    // download. Safari keeps only the last of downloads started together.
    vi.stubGlobal("showDirectoryPicker", undefined);
    const downloads: Array<{ name: string; blob: Blob }> = [];
    const blobs = new Map<string, Blob>();
    vi.stubGlobal("URL", Object.assign(Object.create(URL), {
      createObjectURL: (blob: Blob) => {
        const url = `blob:test/${blobs.size}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL: () => {},
    }));
    vi.stubGlobal("document", {
      createElement: () => {
        const anchor = { href: "", download: "", click: () => downloads.push({ name: anchor.download, blob: blobs.get(anchor.href)! }) };
        return anchor;
      },
    });
    const target = await chooseFolder(["notes.py", "notes.md"], "notes.zip");
    await target!.write(new Map([["notes.py", "print('hi')\n"], ["notes.md", "# Notes\n"]]));
    expect(downloads.map((d) => d.name)).toEqual(["notes.zip"]);
    const zip = new Uint8Array(await downloads[0].blob.arrayBuffer());
    expect(downloads[0].blob.type).toBe("application/zip");
    expect(storedEntries(zip)).toEqual({ "notes.py": "print('hi')\n", "notes.md": "# Notes\n" });
  });
});

// The entries of a zip of stored (uncompressed) files, as zipFiles writes them
// (zip.test.ts checks those against Python's zipfile).
const storedEntries = (zip: Uint8Array): Record<string, string> => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const entries: Record<string, string> = {};
  for (let at = 0; view.getUint32(at, true) === 0x04034b50; ) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = decoder.decode(zip.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extra;
    entries[name] = decoder.decode(zip.subarray(start, start + size));
    at = start + size;
  }
  return entries;
};
