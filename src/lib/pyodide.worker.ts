// @ts-ignore
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs";

let pyodide: any = null;

const INIT_CODE = `
import sys
import io

class OutputCapture(io.StringIO):
    def __init__(self, callback):
        super().__init__()
        self.callback = callback

    def write(self, s):
        self.callback(s)
        return super().write(s)

# We will redirect stdout/stderr in the run function wrapper
`;

async function initPyodide() {
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/"
    });
    await pyodide.loadPackage("micropip");
    await pyodide.runPythonAsync(INIT_CODE);
    postMessage({ type: "ready" });
  } catch (e) {
    postMessage({ type: "error", error: String(e) });
  }
}

async function runCode(id: string, code: string) {
  if (!pyodide) {
    postMessage({ id, type: "error", error: "Kernel not ready" });
    return;
  }

  // Reset streams for this execution
  pyodide.setStdout({
    batched: (msg: string) => {
        postMessage({ id, type: "stdout", content: msg });
    }
  });
  pyodide.setStderr({
    batched: (msg: string) => {
        postMessage({ id, type: "stderr", content: msg });
    }
  });

  try {
    await pyodide.loadPackagesFromImports(code);
    const result = await pyodide.runPythonAsync(code);
    postMessage({ id, type: "success", result: result?.toString() });
  } catch (error: any) {
    postMessage({ id, type: "error", error: error.toString() });
  }
}

self.onmessage = async (e) => {
  const { type, id, code } = e.data;

  if (type === "init") {
    await initPyodide();
  } else if (type === "run") {
    await runCode(id, code);
  }
};
