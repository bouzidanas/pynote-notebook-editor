import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPyodide } from "pyodide";
import { PYODIDE_CDN_URL, PYODIDE_VERSION } from "./pyodide-config";
import { PYNOTE_PYTHON_VERSION } from "./formats/document";

// The kernel loads Pyodide PYODIDE_VERSION from the CDN while the Vitest
// suites load the `pyodide` npm package, and saved notebooks record the CPython
// version in language_info. These checks keep the three in step.
describe("Pyodide version pins", () => {
  test("the npm package the tests use is the release the kernel loads", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../node_modules/pyodide/package.json"), "utf8"));
    expect(pkg.version).toBe(PYODIDE_VERSION);
    expect(PYODIDE_CDN_URL).toBe(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`);
  });

  test("language_info.version is the CPython that release bundles", async () => {
    const pyodide = await loadPyodide();
    expect(pyodide.runPython("import sys; '.'.join(map(str, sys.version_info[:3]))")).toBe(PYNOTE_PYTHON_VERSION);
  }, 30_000);
});
