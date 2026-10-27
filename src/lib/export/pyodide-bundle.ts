import { pythonLanguage } from "@codemirror/lang-python";

// Which Pyodide files an offline web app export carries, and fetching them.
//
// Always: the runtime core and micropip (the kernel loads it at start).
// Plus: every package whose import names appear in the notebook's code, with
// the full dependency closure from Pyodide's lock file. Pyodide resolves
// imports through the same lock file at run time, so the export can satisfy
// exactly the requests the notebook will make.

export interface PyodideLockPackage {
  name: string;
  file_name: string;
  depends: string[];
  imports: string[];
  package_type: string;
  sha256: string;
}

export interface PyodideLock {
  info: Record<string, unknown>;
  packages: Record<string, PyodideLockPackage>;
}

// Loaded by the classic worker (pyodide.asm.js and pyodide.js are put in front
// of PyNote's worker code; the rest is requested over postMessage).
export const PYODIDE_CORE_FILES = ["pyodide.asm.js", "pyodide.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

const ALWAYS_PACKAGES = ["micropip"];

/**
 * Module names the sources import, as Pyodide's find_imports reports them
 * when a cell runs (it loads packages for these): every import statement
 * anywhere in the code (after a semicolon, in a function or an if block),
 * each dotted name with its prefixes ("a", "a.b"). Strings and comments are
 * not code. Parsed with the Python grammar the editor uses.
 */
export function importedModules(sources: readonly string[]): Set<string> {
  const modules = new Set<string>();
  const add = (dotted: string[]) => {
    for (let i = 1; i <= dotted.length; i++) modules.add(dotted.slice(0, i).join("."));
  };
  for (const source of sources) {
    pythonLanguage.parser.parse(source).iterate({
      enter(node) {
        if (node.name !== "ImportStatement") return;
        // The statement's tokens: `import a.b as c, d` or `from .a.b import c`.
        const tokens: Array<{ name: string; text: string }> = [];
        const cursor = node.node.cursor();
        const end = node.to;
        while (cursor.next() && cursor.from < end) {
          if (!cursor.node.firstChild) tokens.push({ name: cursor.name, text: source.slice(cursor.from, cursor.to) });
        }
        if (tokens[0]?.name === "from") {
          // The module before `import`; `from . import x` names none.
          const names: string[] = [];
          for (const token of tokens.slice(1)) {
            if (token.name === "import") break;
            if (token.name === "VariableName") names.push(token.text);
          }
          if (names.length > 0) add(names);
        } else {
          // Each dotted name up to its alias, or the next comma.
          let dotted: string[] = [];
          let alias = false;
          for (const token of tokens.slice(1)) {
            if (token.name === "VariableName" && !alias) dotted.push(token.text);
            else if (token.name === "as") alias = true;
            else if (token.name === ",") {
              add(dotted);
              dotted = [];
              alias = false;
            }
          }
          add(dotted);
        }
        return false;
      },
    });
  }
  return modules;
}

/** Lock packages (closure included) needed for the given imported modules. */
export function packagesFor(lock: PyodideLock, modules: ReadonlySet<string>): string[] {
  const byImport = new Map<string, string>();
  for (const [name, pkg] of Object.entries(lock.packages)) for (const imp of pkg.imports) byImport.set(imp, name);
  const wanted = [...ALWAYS_PACKAGES];
  for (const module of modules) {
    const pkg = byImport.get(module);
    if (pkg) wanted.push(pkg);
  }
  const seen = new Set<string>();
  const stack = [...wanted];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (seen.has(name) || !lock.packages[name]) continue;
    seen.add(name);
    stack.push(...lock.packages[name].depends);
  }
  return [...seen].sort();
}

export interface PyodideFile {
  name: string;
  sha256?: string; // lock-file packages carry a hash; the core files do not
}

export function filesFor(lock: PyodideLock, packages: readonly string[]): PyodideFile[] {
  return [
    ...PYODIDE_CORE_FILES.map((name) => ({ name })),
    ...packages.map((pkg) => ({ name: lock.packages[pkg].file_name, sha256: lock.packages[pkg].sha256 })),
  ];
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export interface DownloadProgress {
  file: string;
  done: number;
  total: number;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  /** Stops the download: the promise rejects with the signal's reason. */
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/**
 * Fetch the files from `baseUrl` (the CDN Pyodide is pinned to), checking each
 * package against its lock-file hash.
 */
export async function downloadPyodideFiles(
  files: readonly PyodideFile[],
  baseUrl: string,
  { onProgress, signal, fetch: fetchImpl = fetch }: DownloadOptions = {},
): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  let done = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    onProgress?.({ file: file.name, done, total: files.length });
    const response = await fetchImpl(`${baseUrl}${file.name}`, { signal });
    if (!response.ok) throw new Error(`Could not download ${file.name} (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (file.sha256) {
      const digest = hex(await crypto.subtle.digest("SHA-256", buffer));
      if (digest !== file.sha256) throw new Error(`${file.name} does not match Pyodide's lock file (corrupted download?).`);
    }
    result.set(file.name, new Uint8Array(buffer));
    done += 1;
  }
  onProgress?.({ file: "", done, total: files.length });
  return result;
}
