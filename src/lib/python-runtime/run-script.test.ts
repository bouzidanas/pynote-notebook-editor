import { beforeAll, describe, expect, test } from "vitest";
import { loadPyodide, type PyodideAPI } from "pyodide";
import { INIT_CODE } from "./init-code";

// run_script backs the Python export check: it must behave like
// `python notebook.py` (one module, no top-level await, fresh __main__) while
// routing output to the requesting id like a cell's.

let pyodide: PyodideAPI;
const streams: Array<[string, string, string]> = [];

const runScript = (source: string, id = "check-1"): string | null => {
  const fn = pyodide.globals.get("run_script");
  try {
    const result = fn(source, id);
    return typeof result === "string" ? result : null;
  } finally {
    fn.destroy();
  }
};

const output = (id: string, stream = "stdout") =>
  streams.filter(([sid, s]) => sid === id && s === stream).map(([, , text]) => text).join("");

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.runPythonAsync(INIT_CODE);
  const register = pyodide.globals.get("register_stream_callback");
  register((id: string, stream: string, text: string) => streams.push([id, stream, text]));
  register.destroy();
}, 30_000);

describe("run_script", () => {
  test("runs a whole script and routes its output to the run id", () => {
    expect(runScript("x = 21 * 2\nprint(x)\nprint(__name__)", "ok-run")).toBeNull();
    expect(output("ok-run")).toBe("42\n__main__\n");
  });

  test("uses a fresh namespace for every run", () => {
    expect(runScript("leaked = 1", "first")).toBeNull();
    const error = runScript("print(leaked)", "second");
    expect(error).toContain("NameError: name 'leaked' is not defined");
  });

  test("rejects top-level await like CPython does", () => {
    const error = runScript("import asyncio\nawait asyncio.sleep(0)", "await-run");
    expect(error).toContain("SyntaxError");
    expect(error).toContain("outside");
  });

  test("returns a traceback that points at the script line, without wrapper frames", () => {
    const error = runScript("a = 1\nb = 0\nc = a / b\n", "zero-run");
    expect(error).toMatch(/^Traceback \(most recent call last\):\n/);
    expect(error).toContain('File "notebook.py", line 3');
    expect(error).toContain("ZeroDivisionError");
    expect(error).not.toContain("run_script");
  });

  test("treats sys.exit(0) as success and other exit codes as failure", () => {
    expect(runScript("import sys\nsys.exit(0)")).toBeNull();
    expect(runScript("import sys\nsys.exit(3)")).toBe("SystemExit: 3");
  });
});
