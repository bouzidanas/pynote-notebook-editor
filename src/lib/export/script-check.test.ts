import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cellForLine, failingLine, startScriptChecker } from "./script-check";

// A stand-in for the throwaway kernel: scripts finish when the test says so
// (or after a set time, with fake timers), so scheduling and time limits can
// be checked without Pyodide. The real check runs in e2e/tests/export-dialog.spec.ts.
const fake = vi.hoisted(() => {
  type Outcome = { stdout: string; stderr: string; error: string | null };
  class FakeKernel {
    static instances: FakeKernel[] = [];
    static failStart = false;
    status = "loading";
    terminated = false;
    scripts: string[] = [];
    private pending: Array<(outcome: Outcome) => void> = [];

    constructor() {
      FakeKernel.instances.push(this);
    }
    configure() {}
    init() {}
    whenReady() {
      if (FakeKernel.failStart) return Promise.reject(new Error("Failed to load Pyodide"));
      this.status = "ready";
      return Promise.resolve();
    }
    analyzeCell() {
      return Promise.resolve({ definitions: [], references: [] });
    }
    // The find_imports evaluation: no imports.
    run(_code: string, onUpdate: (result: { result?: string }) => void) {
      if (this.status !== "ready") throw new Error(this.status === "stopped" ? "Kernel is stopped" : "Kernel not ready");
      onUpdate({ result: "[]" });
      return Promise.resolve();
    }
    runScript(source: string): Promise<Outcome> {
      if (this.status !== "ready") return Promise.reject(new Error("Kernel is stopped"));
      this.scripts.push(source);
      return new Promise((resolve) => this.pending.push(resolve));
    }
    /** Finish the running script. */
    finish(error: string | null = null) {
      this.pending.shift()?.({ stdout: "", stderr: "", error });
    }
    terminate() {
      this.terminated = true;
      this.status = "stopped";
      for (const resolve of this.pending.splice(0)) resolve({ stdout: "", stderr: "", error: "Kernel interrupted" });
    }
  }
  return { FakeKernel };
});

vi.mock("../pyodide", () => ({ Kernel: fake.FakeKernel, kernel: { configuration: {} } }));

const { FakeKernel } = fake;
const starts = [{ id: "a", line: 1 }];
// Let queued promise callbacks run.
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("mapping a script error back to its cell", () => {
  const cells = [{ id: "a", line: 6 }, { id: "b", line: 10 }, { id: "c", line: 15 }];

  it("finds the cell whose lines contain the failing line", () => {
    expect(cellForLine(6, cells)).toBe("a");
    expect(cellForLine(12, cells)).toBe("b");
    expect(cellForLine(40, cells)).toBe("c");
    expect(cellForLine(2, cells)).toBeUndefined(); // the header
  });

  it("reads the innermost notebook.py line from a traceback", () => {
    const traceback = [
      "Traceback (most recent call last):",
      '  File "notebook.py", line 12, in <module>',
      '  File "notebook.py", line 4, in helper',
      "ZeroDivisionError: division by zero",
    ].join("\n");
    expect(failingLine(traceback)).toBe(4);
    expect(failingLine('  File "notebook.py", line 7\n    await x\n    ^\nSyntaxError: \'await\' outside function')).toBe(7);
    expect(failingLine("SystemExit: 3")).toBeUndefined();
  });
});

describe("startScriptChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeKernel.instances = [];
    FakeKernel.failStart = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates its worker when Python fails to start", async () => {
    FakeKernel.failStart = true;
    await expect(startScriptChecker()).rejects.toThrow("Failed to load Pyodide");
    expect(FakeKernel.instances).toHaveLength(1);
    expect(FakeKernel.instances[0].terminated).toBe(true);
  });

  it("runs one check at a time, and a newer check replaces one still waiting", async () => {
    const checker = await startScriptChecker();
    const kernel = FakeKernel.instances[0];
    const first = checker.run("first", starts);
    await settle();
    const replaced = checker.run("replaced", starts);
    const latest = checker.run("latest", starts);
    await settle();
    expect(kernel.scripts).toEqual(["first"]);

    kernel.finish();
    expect((await first)?.status).toBe("passed");
    expect(await replaced).toBeNull();
    await settle();
    expect(kernel.scripts).toEqual(["first", "latest"]);
    kernel.finish();
    expect((await latest)?.status).toBe("passed");
  });

  it("counts the time limit from when a check starts, not from when it was asked for", async () => {
    const checker = await startScriptChecker();
    const kernel = FakeKernel.instances[0];
    const first = checker.run("first", starts);
    await settle();
    const second = checker.run("second", starts); // waits for the first
    await vi.advanceTimersByTimeAsync(50_000);
    kernel.finish();
    expect((await first)?.status).toBe("passed");
    await settle();
    expect(kernel.scripts).toEqual(["first", "second"]);
    // 80 s after it was asked for, but 30 s after it started.
    await vi.advanceTimersByTimeAsync(30_000);
    kernel.finish();
    expect((await second)?.status).toBe("passed");
  });

  it("times out a script that runs too long, then checks the next one in a fresh kernel", async () => {
    const checker = await startScriptChecker();
    const stuck = checker.run("while True: pass", starts);
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await stuck)?.status).toBe("timeout");
    expect(FakeKernel.instances[0].terminated).toBe(true);

    const next = checker.run("print(1)", starts);
    await settle();
    expect(FakeKernel.instances).toHaveLength(2);
    FakeKernel.instances[1].finish();
    expect((await next)?.status).toBe("passed");
  });

  it("dispose stops the kernel; a check asked for later does not start another", async () => {
    const checker = await startScriptChecker();
    checker.dispose();
    expect(FakeKernel.instances[0].terminated).toBe(true);
    expect(await checker.run("print(1)", starts)).toBeNull();
    expect(FakeKernel.instances).toHaveLength(1);
  });
});
