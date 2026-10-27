import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fc, test } from "@fast-check/vitest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPyodide, type PyodideAPI } from "pyodide";
import type { PyCallable } from "pyodide/ffi";
import { INIT_CODE } from "../../src/lib/python-runtime/init-code";
import type { DocCell, NotebookDocument } from "../../src/lib/formats/document";
import { parseIpynb } from "../../src/lib/formats/ipynb";
import { exportMarkdown } from "../../src/lib/formats/markdown";
import { exportPair, mergePair } from "../../src/lib/formats/pair";
import { type DependencyInfo, exportPython, parsePython } from "../../src/lib/formats/python";
import { hazardText, notebookDocument } from "../arbitraries/notebook";
import { markdownCell } from "../arbitraries/markdown";

// Booting Pyodide and running hundreds of generated programs takes seconds,
// more when the machine is busy (the suite runs files in parallel).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// The reviewed golden files of the exports: they are the contract. Update
// them with `npx vitest run -u` only for an intended format change, review
// the diff, and run `npm run test:oracle` (it checks the scripts with CPython
// and jupytext).
// The tests that run exported scripts in Python live here too, so the suite
// boots Pyodide once for the exports.

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const golden = (path: string) => resolve(root, "test/golden", path);

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const FIXTURES = ["reactive-analysis", "tutorial-hybrid", "jupyter-kitchen-sink"];
const load = (name: string) => unwrap(parseIpynb(read(`test/fixtures/notebooks/${name}.ipynb`)));

let pyodide: PyodideAPI;
let compile: PyCallable;
const output: string[] = [];

beforeAll(async () => {
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: (line) => output.push(line) });
  compile = pyodide.globals.get("compile");
  // The dependency analysis reactive mode uses, as the app runs it.
  pyodide.runPython(`import ast\n${INIT_CODE.slice(INIT_CODE.indexOf("def analyze_cell_dependencies"))}`);
});

afterAll(() => compile?.destroy());

/** Dependencies of every code cell, from PyNote's own analysis. */
const dependenciesOf = (doc: NotebookDocument): Map<string, DependencyInfo> =>
  new Map(doc.cells.filter((c) => c.type === "code").map((cell) => {
    const proxy = pyodide.runPython(`analyze_cell_dependencies(${JSON.stringify(cell.source)})`);
    const { definitions, references } = proxy.toJs({ dict_converter: Object.fromEntries }) as { definitions: string[]; references: string[] };
    proxy.destroy();
    return [cell.id, { definitions: [...definitions].sort(), references: [...references].sort() }];
  }));

describe.each(FIXTURES)("%s", (name) => {
  it("exports as a .py script", async () => {
    const doc = load(name);
    await expect(exportPython(doc, { includeMarkdown: true, dependencies: dependenciesOf(doc) }).text).toMatchFileSnapshot(golden(`python/${name}.py`));
  });

  it("exports as Markdown", async () => {
    await expect(exportMarkdown(load(name), { includeCode: true })).toMatchFileSnapshot(golden(`markdown/${name}.md`));
  });

  it("exports as a .py/.md pair that merges back into the notebook", async () => {
    const doc = load(name);
    const { py, md, python } = exportPair(doc, { baseName: name, dependencies: dependenciesOf(doc) });
    await expect(py).toMatchFileSnapshot(golden(`pair/${name}.py`));
    await expect(md).toMatchFileSnapshot(golden(`pair/${name}.md`));
    const merged = unwrap(mergePair(py, md));
    // The documented normalizations: LF line endings, and the last cell of
    // each file loses its trailing line breaks.
    const lastPy = python.codeOrder[python.codeOrder.length - 1];
    const lastMd = doc.cells[doc.cells.length - 1];
    const expected = doc.cells.map((c) => {
      const source = c.source.replace(/\r\n?/g, "\n");
      const last = (c.type === "code" && c.id === lastPy) || (c.type === "markdown" && c === lastMd);
      return [c.id, c.type, last ? source.replace(/\n+$/, "") : source];
    });
    expect(merged.cells.map((c) => [c.id, c.type, c.source])).toEqual(expected);
  });
});

describe("the reactive notebook stored out of order", () => {
  it("is exported in dependency order, prose traveling with its code", () => {
    const doc = load("reactive-analysis");
    const result = exportPython(doc, { includeMarkdown: true, dependencies: dependenciesOf(doc) });
    expect(result.codeOrder).toEqual(["records", "stats", "report", "check"]);
    // stats keeps its position among the code cells (second).
    expect(result.moved).toEqual(["records", "report"]);
    expect(result.orderNote).toBeUndefined();
    expect(result.duplicateDefinitions).toEqual([]);
    expect(unwrap(parsePython(result.text)).cells.map((c) => c.type)).toEqual(["markdown", "markdown", "code", "markdown", "code", "code", "markdown", "code"]);
  });

  it("also exports its code alone", async () => {
    const doc = load("reactive-analysis");
    await expect(exportPython(doc, { includeMarkdown: false, dependencies: dependenciesOf(doc) }).text).toMatchFileSnapshot(golden("python/reactive-analysis.code.py"));
  });
});

describe("the hybrid notebook that redefines a name", () => {
  it("keeps notebook order and reports the duplicate definition", () => {
    const doc = load("tutorial-hybrid");
    const result = exportPython(doc, { includeMarkdown: true, dependencies: dependenciesOf(doc) });
    expect(result.orderNote).toBe("duplicates");
    expect(result.duplicateDefinitions).toEqual([{ name: "words", cellIds: ["sentence", "filter"] }]);
    expect(result.codeOrder).toEqual(doc.cells.filter((c) => c.type === "code").map((c) => c.id));
  });
});

describe("the examples in docs/formats/exports.md", () => {
  // The documented notebook: the summary comes before the cell it depends on.
  const doc: NotebookDocument = {
    metadata: { PyNote: { executionMode: "reactive" } },
    cells: [
      { id: "intro", type: "markdown", source: "# Sales report\n\nThe summary comes first, although it uses the total that a later cell computes: in reactive mode the order of cells does not matter.", metadata: {} },
      { id: "summary", type: "code", source: 'print(f"Total: {total} units")', metadata: {} },
      { id: "data", type: "markdown", source: "## Data\n\n| Region | Units |\n|---|---:|\n| North | 120 |\n| South | 80 |", metadata: {} },
      { id: "total", type: "code", source: 'sales = {"North": 120, "South": 80}\ntotal = sum(sales.values())', metadata: {} },
    ],
  };
  const spec = read("docs/formats/exports.md");
  // Each example is a fenced block of the document, verbatim.
  const fencedIn = (text: string, info: string, fence = "```") => expect(spec).toContain(`${fence}${info}\n${text}${fence}\n`);

  it("are what the writers produce", () => {
    const dependencies = dependenciesOf(doc);
    fencedIn(exportPython(doc, { includeMarkdown: true, dependencies }).text, "python");
    fencedIn(exportMarkdown(doc, { includeCode: true }), "markdown", "````");
    const pair = exportPair(doc, { baseName: "sales", dependencies });
    fencedIn(pair.py, "python");
    fencedIn(pair.md, "markdown");
  });

  it("merge back as documented", () => {
    const pair = exportPair(doc, { baseName: "sales", dependencies: dependenciesOf(doc) });
    expect(unwrap(mergePair(pair.py, pair.md)).cells).toEqual(doc.cells);
  });
});

// --- Running the scripts -----------------------------------------------------

// Programs whose cells form a random dependency DAG: cell k assigns v<k>
// from earlier variables and prints it. The notebook stores the cells in a
// random order; the exported script must run top to bottom in Python and
// print the values in the emitted order.
const dagProgram = fc.integer({ min: 1, max: 9 }).chain((n) => fc.record({
  refs: fc.tuple(...Array.from({ length: n }, (_, k) => fc.subarray(Array.from({ length: k }, (_, j) => j)))),
  constants: fc.array(fc.integer({ min: 0, max: 99 }), { minLength: n, maxLength: n }),
  order: fc.shuffledSubarray(Array.from({ length: n }, (_, k) => k), { minLength: n, maxLength: n }),
  prose: fc.array(fc.tuple(fc.nat(n), fc.boolean(), fc.oneof(hazardText(60), markdownCell)), { maxLength: 4 }),
  lineWidth: fc.integer({ min: 12, max: 100 }),
}));

/** The small analysis the test needs: `vN = ...` defines vN and reads the v's on the right. */
const analyze = (source: string): DependencyInfo => {
  const assignment = /^(v\d+) = (.*)$/m.exec(source);
  if (!assignment) return { definitions: [], references: [] };
  return { definitions: [assignment[1]], references: [...new Set(assignment[2].match(/\bv\d+\b/g) ?? [])] };
};

describe("exported scripts run in Python", () => {
  test.prop([dagProgram], { numRuns: 150 })("in dependency order, printing every value as computed", ({ refs, constants, order, prose, lineWidth }) => {
    const values: number[] = [];
    const sources = refs.map((r, k) => {
      values.push((r.reduce((sum, j) => sum + values[j], 0) + constants[k]) % 1000);
      return `v${k} = (${[...r.map((j) => `v${j}`), String(constants[k])].join(" + ")}) % 1000\nprint("v${k}", v${k})`;
    });
    const cells: DocCell[] = [];
    order.forEach((k, position) => {
      for (const [at, isRaw, text] of prose) {
        if (at === position) cells.push({ id: `p${cells.length}`, type: isRaw ? "raw" : "markdown", source: text, metadata: {} });
      }
      cells.push({ id: `c${k}`, type: "code", source: sources[k], metadata: {} });
    });
    const dependencies = new Map(cells.filter((c) => c.type === "code").map((c) => [c.id, analyze(c.source)]));
    const result = exportPython({ cells, metadata: {} }, { includeMarkdown: true, dependencies, lineWidth });
    expect(result.orderNote).toBeUndefined();

    output.length = 0;
    const globals = pyodide.toPy({});
    try {
      pyodide.runPython(result.text, { globals });
    } finally {
      globals.destroy();
    }
    expect(output).toEqual(result.codeOrder.map((id) => `v${id.slice(1)} ${values[Number(id.slice(1))]}`));
  });

  // Documents whose markdown cells are real Markdown documents too.
  const notebook = fc.tuple(notebookDocument, fc.array(markdownCell, { maxLength: 3 })).map(([doc, prose]): NotebookDocument => ({
    ...doc,
    cells: doc.cells.map((cell, i) => (cell.type === "markdown" && i < prose.length ? { ...cell, source: prose[i] } : cell)),
  }));

  test.prop([notebook], { numRuns: 150 })("whatever the prose: comments never break Python syntax", (doc) => {
    // Valid code in every code cell, hazards everywhere else.
    const cells = doc.cells.map((c, i) => (c.type === "code" ? { ...c, source: `x${i} = ${i}` } : c));
    const text = exportPython({ ...doc, cells }, { includeMarkdown: true }).text;
    compile(text, "export.py", "exec").destroy();
  });
});
