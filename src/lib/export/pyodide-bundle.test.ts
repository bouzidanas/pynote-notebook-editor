import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { downloadPyodideFiles, filesFor, importedModules, packagesFor, PYODIDE_CORE_FILES, type PyodideLock } from "./pyodide-bundle";

const lock: PyodideLock = JSON.parse(readFileSync(resolve(__dirname, "../../../test/fixtures/pyodide/pyodide-lock.subset.json"), "utf8"));

describe("importedModules", () => {
  const modules = (...sources: string[]) => [...importedModules(sources)].sort();

  it("finds modules in import statements, ignoring comments, strings and `from . import`", () => {
    const sources = [
      "import numpy as np, os.path\nfrom pandas.api import types\n# import scipy\n",
      "def f():\n    import matplotlib.pyplot as plt\n    from . import local\n",
      "x = 'import json'  # a string, not a statement\n",
      's = """\nimport bs4\n"""\n',
    ];
    // Each dotted name with its prefixes, as Pyodide's find_imports reports it.
    expect(modules(...sources)).toEqual(["matplotlib", "matplotlib.pyplot", "numpy", "os", "os.path", "pandas", "pandas.api"]);
  });

  it("finds imports after a semicolon or a colon, as Pyodide does when the cell runs", () => {
    expect(modules("import numpy as np; import pandas as pd")).toEqual(["numpy", "pandas"]);
    expect(modules("x = 1; import pandas")).toEqual(["pandas"]);
    expect(modules("import os; from scipy import stats")).toEqual(["os", "scipy"]);
    expect(modules("if True: import sympy")).toEqual(["sympy"]);
    expect(modules("try: import networkx\nexcept ImportError: pass")).toEqual(["networkx"]);
  });

  it("reads every Python form of an import", () => {
    expect(modules("import a.b as c, d")).toEqual(["a", "a.b", "d"]);
    expect(modules("from x import (\n    y,\n    z as w,\n)")).toEqual(["x"]);
    expect(modules("from .helpers import f")).toEqual(["helpers"]); // find_imports keeps the module of a relative import
    expect(modules("import \\\n    lxml")).toEqual(["lxml"]);
    expect(modules('f"{d["k"]}"; import yaml')).toEqual(["yaml"]);
    expect(modules("class A:\n    import attrs\n")).toEqual(["attrs"]);
    expect(modules("__import__('q'); importlib = 1")).toEqual([]);
  });
});

describe("packagesFor", () => {
  it("always includes micropip and resolves dependency closures", () => {
    expect(packagesFor(lock, new Set())).toEqual(["micropip"]);
    expect(packagesFor(lock, new Set(["pandas", "os", "json"]))).toEqual(["micropip", "numpy", "pandas", "python-dateutil", "pytz", "six"]);
  });

  it("maps import names to packages through the lock file", () => {
    // matplotlib's package provides the "pylab" and "mpl_toolkits" imports too.
    expect(packagesFor(lock, new Set(["mpl_toolkits"]))).toContain("matplotlib");
    expect(packagesFor(lock, new Set(["sklearn"]))).toEqual(expect.arrayContaining(["scikit-learn", "scipy", "joblib", "threadpoolctl", "numpy"]));
  });
});

describe("filesFor and downloadPyodideFiles", () => {
  it("lists core files then package wheels with their hashes", () => {
    const files = filesFor(lock, ["micropip"]);
    expect(files.map((f) => f.name)).toEqual([...PYODIDE_CORE_FILES, lock.packages.micropip.file_name]);
    expect(files.at(-1)!.sha256).toBe(lock.packages.micropip.sha256);
  });

  it("rejects a download whose bytes do not match the lock file", async () => {
    const fakeFetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch;
    await expect(downloadPyodideFiles([{ name: "x.whl", sha256: "00" }], "https://cdn/", { fetch: fakeFetch })).rejects.toThrow("does not match");
  });

  it("returns the bytes and reports progress", async () => {
    const bytes = new Uint8Array([104, 105]);
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const fakeFetch = (async () => new Response(bytes)) as unknown as typeof fetch;
    const seen: number[] = [];
    const out = await downloadPyodideFiles([{ name: "a.js" }, { name: "b.whl", sha256: digest }], "https://cdn/", { onProgress: (p) => seen.push(p.done), fetch: fakeFetch });
    expect([...out.keys()]).toEqual(["a.js", "b.whl"]);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("stops when cancelled: the request in flight is aborted and no later file is fetched", async () => {
    const controller = new AbortController();
    const requested: string[] = [];
    // A server that never answers, until the request is aborted.
    const stalledFetch = ((url: string, init?: RequestInit) => {
      requested.push(url);
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }) as unknown as typeof fetch;
    const download = downloadPyodideFiles([{ name: "a.js" }, { name: "b.js" }], "https://cdn/", { signal: controller.signal, fetch: stalledFetch });
    controller.abort();
    await expect(download).rejects.toMatchObject({ name: "AbortError" });
    expect(requested).toEqual(["https://cdn/a.js"]);
  });
});
