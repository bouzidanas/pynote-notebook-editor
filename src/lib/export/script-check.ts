import { Kernel, kernel as appKernel } from "../pyodide";

// Checks that an exported Python script runs top to bottom, without touching
// the notebook being edited: everything happens in a throwaway kernel that is
// configured like the app's (same worker, same Pyodide source) and
// terminated afterwards. Used by the Python and Python + Markdown exports.
//
// The kernel runs one check at a time. A check asked for while another runs
// waits, and a newer one replaces it, so changing options or typing during a
// long check costs one more run, not one per change.

export interface DependencyInfo {
  definitions: string[];
  references: string[];
}

export interface CodeCellInput {
  id: string;
  source: string;
}

// Modules that only exist inside PyNote / Pyodide: a script importing them
// runs in the check but not with a regular `python`.
const PYNOTE_ONLY_MODULES = ["pynote_ui", "micropip", "js", "pyodide", "pyodide_js"];

export interface ScriptCheckResult {
  status: "passed" | "failed" | "timeout" | "error";
  // The traceback (failed), or what went wrong starting the check (error).
  message?: string;
  // The cell whose lines the failing line falls in, when known.
  cellId?: string;
  // Modules the script imports that a regular Python does not have.
  pynoteOnlyImports: string[];
  stdout: string;
  durationMs: number;
}

export interface ScriptChecker {
  analyze(cells: CodeCellInput[]): Promise<Map<string, DependencyInfo>>;
  /** Check a script; null when a newer check replaced it before it ran. */
  run(script: string, cellStarts: ReadonlyArray<{ id: string; line: number }>): Promise<ScriptCheckResult | null>;
  dispose(): void;
}

/** The cell a 1-based script line belongs to, given each cell's first line. */
export const cellForLine = (line: number, cellStarts: ReadonlyArray<{ id: string; line: number }>): string | undefined => {
  let found: string | undefined;
  for (const start of cellStarts) {
    if (start.line <= line) found = start.id;
    else break;
  }
  return found;
};

/** The line number in "notebook.py" where a traceback says the error is. */
export const failingLine = (traceback: string): number | undefined => {
  const matches = [...traceback.matchAll(/File "notebook\.py", line (\d+)/g)];
  return matches.length > 0 ? Number(matches[matches.length - 1][1]) : undefined;
};

const TIMEOUT_MS = 60_000;

/** Start a throwaway kernel for checking scripts. Call dispose() when done. */
export async function startScriptChecker(): Promise<ScriptChecker> {
  let disposed = false;
  // The kernel checks run in; null after a timeout stopped it.
  let current: Kernel | null = null;
  let ready: Promise<Kernel>;

  const startKernel = async (): Promise<Kernel> => {
    const kernel = new Kernel();
    current = kernel;
    kernel.configure(appKernel.configuration);
    kernel.init();
    try {
      await kernel.whenReady();
    } catch (err) {
      // A worker that failed to start Python would otherwise live on.
      kernel.terminate();
      if (current === kernel) current = null;
      throw err;
    }
    return kernel;
  };
  const kernelForCheck = (): Promise<Kernel> => {
    if (disposed) return Promise.reject(new Error("The script check was closed."));
    if (!current) ready = startKernel();
    return ready;
  };

  ready = startKernel();
  await ready;

  // One task at a time, in the order asked.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };

  const check = async (kernel: Kernel, script: string, cellStarts: ReadonlyArray<{ id: string; line: number }>): Promise<ScriptCheckResult> => {
    const started = performance.now();
    const finish = (result: Omit<ScriptCheckResult, "durationMs">): ScriptCheckResult => ({
      ...result,
      durationMs: Math.round(performance.now() - started),
    });

    let pynoteOnlyImports: string[] = [];
    try {
      // Pyodide's own import finder: module names the script imports.
      const found = await evaluate(kernel, `import json\nfrom pyodide.code import find_imports\njson.dumps(sorted(set(find_imports(${JSON.stringify(script)}))))`);
      pynoteOnlyImports = (JSON.parse(found) as string[]).filter((m) => PYNOTE_ONLY_MODULES.includes(m));
    } catch {
      // The script may not even parse; runScript below reports that properly.
    }

    // The kernel is free (checks run one at a time), so the time limit
    // counts this script alone.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), TIMEOUT_MS); });
    try {
      const outcome = await Promise.race([kernel.runScript(script), timeout]);
      if (outcome === "timeout") {
        // Python cannot be interrupted: this kernel goes, and the next check
        // starts a fresh one.
        kernel.terminate();
        if (current === kernel) current = null;
        return finish({ status: "timeout", message: `Still running after ${TIMEOUT_MS / 1000} s; stopped the check.`, pynoteOnlyImports, stdout: "" });
      }
      if (outcome.error === null) return finish({ status: "passed", pynoteOnlyImports, stdout: outcome.stdout });
      const line = failingLine(outcome.error);
      return finish({
        status: "failed",
        message: outcome.error,
        cellId: line === undefined ? undefined : cellForLine(line, cellStarts),
        pynoteOnlyImports,
        stdout: outcome.stdout,
      });
    } catch (err) {
      return finish({ status: "error", message: err instanceof Error ? err.message : String(err), pynoteOnlyImports, stdout: "" });
    } finally {
      clearTimeout(timer);
    }
  };

  let latest = 0;
  return {
    analyze: (cells) =>
      serial(async () => {
        const kernel = await kernelForCheck();
        const entries = await Promise.all(cells.map(async (cell) => [cell.id, await kernel.analyzeCell(cell.id, cell.source)] as const));
        return new Map(entries);
      }),

    run(script, cellStarts) {
      const id = ++latest;
      return serial(async () => {
        if (disposed || id !== latest) return null; // replaced while it waited
        return check(await kernelForCheck(), script, cellStarts);
      });
    },

    dispose() {
      disposed = true;
      current?.terminate();
      current = null;
    },
  };
}

// Evaluate an expression-ending snippet in the checker kernel and return the
// final expression's string value.
const evaluate = (k: Kernel, code: string): Promise<string> =>
  new Promise((resolve, reject) => {
    k.run(code, (result) => {
      if (result.error) reject(new Error(result.error));
      // A Python str arrives as the JS string itself (no repr quotes).
      else if (result.result !== undefined) resolve(result.result);
    }).catch(reject);
  });
