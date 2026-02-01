import { createSignal } from "solid-js";

export type KernelStatus = "loading" | "ready" | "running" | "error" | "stopped";

export interface ExecutionResult {
  stdout: string[];
  stderr: string[];
  result?: string;
  mimebundle?: any;
  error?: string;
  executionTime?: number;
  executionDuration?: number;
  executionCount?: number;
  executionKernelId?: string;
}

class Kernel {
  private worker: Worker | null = null;
  private listeners: Map<string, (msg: any) => void> = new Map();
  private componentListeners: Map<string, (data: any) => void> = new Map();

  private _status;
  private _setStatus;

  public id: string = "";
  public executionCount: number = 0;

  constructor() {
    const [status, setStatus] = createSignal<KernelStatus>("loading");
    this._status = status;
    this._setStatus = setStatus;
  }

  get status() {
    return this._status();
  }

  init() {
    if (this.worker) this.terminate();

    this.id = Math.random().toString(36).substring(7);
    this.executionCount = 0;
    this._setStatus("loading");
    this.worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (e) => {
      const { type, id, error } = e.data;

      if (type === "ready") {
        this._setStatus("ready");
      } else if (type === "error" && !id) {
        // Global init error
        console.error("Pyodide Init Error:", error);
        this._setStatus("error");
      } else if (type === "component_update") {
        const { uid, data } = e.data;
        if (this.componentListeners.has(uid)) {
          this.componentListeners.get(uid)!(data);
        }
      } else if (id && this.listeners.has(id)) {
        this.listeners.get(id)!(e.data);
      }
    };

    this.worker.postMessage({ type: "init" });
  }

  sendInteraction(uid: string, data: any) {
    if (this.worker && (this.status === "ready" || this.status === "running")) {
      this.worker.postMessage({ type: "interaction", uid, data });
    }
  }

  registerComponentListener(uid: string, callback: (data: any) => void) {
    this.componentListeners.set(uid, callback);
  }

  unregisterComponentListener(uid: string) {
    this.componentListeners.delete(uid);
  }

  setCellContext(cellId: string) {
    if (this.worker && this.status === "ready") {
      this.worker.postMessage({ type: "set_cell_context", id: cellId });
    }
  }

  clearCellState(cellId: string) {
    if (this.worker && this.status === "ready") {
      this.worker.postMessage({ type: "clear_cell_context", id: cellId });
    }
  }

  // Analyze cell for reactive execution mode (extracts variable definitions and references)
  analyzeCell(cellId: string, code: string): Promise<{ definitions: string[], references: string[] }> {
    if (!this.worker || this.status === "loading") {
      return Promise.resolve({ definitions: [], references: [] });
    }

    return new Promise((resolve) => {
      const listenerId = `analyze_${cellId}_${Date.now()}`;

      this.listeners.set(listenerId, (msg) => {
        if (msg.type === "analyze_cell_result") {
          this.listeners.delete(listenerId);
          resolve({
            definitions: msg.definitions || [],
            references: msg.references || []
          });
        }
      });

      this.worker!.postMessage({ type: "analyze_cell", id: listenerId, code });
    });
  }

  lint(code: string, extractDefs: boolean = false): Promise<{ diagnostics: any[], definitions: { name: string, line: number, col: number }[] }> {
    if (this.status === "loading") return Promise.resolve({ diagnostics: [], definitions: [] });
    if (this.status === "running") return Promise.resolve({ diagnostics: [], definitions: [] }); // Skip linting while running

    return new Promise((resolve) => {
      const id = `lint_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      this.listeners.set(id, (msg) => {
        if (msg.type === "lint_result") {
          this.listeners.delete(id);
          resolve({ diagnostics: msg.diagnostics, definitions: msg.definitions || [] });
        }
      });
      this.worker!.postMessage({ type: "lint", id, code, extract_defs: extractDefs });
    });
  }

  complete(code: string, offset: number): Promise<any[]> {
    if (!this.worker || this.status === "loading" || this.status === "running") return Promise.resolve([]);

    return new Promise((resolve) => {
      const id = `comp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      this.listeners.set(id, (msg) => {
        if (msg.type === "complete_result") {
          this.listeners.delete(id);
          resolve(msg.completions || []);
        }
      });
      this.worker!.postMessage({ type: "complete", id, code, offset });
    });
  }

  inspect(code: string, offset: number): Promise<any> {
    if (!this.worker || this.status === "loading") return Promise.resolve({ found: false });
    // Note: We intentionally allow inspect calls even if running (it just might hang until free)
    // But UI will handle the "running" tooltip check, so here we just try.
    // However, if we block here, we might accumulate promises.
    // If running, we should just return "kernel busy" signal or null.
    if (this.status === "running") return Promise.resolve({ found: false, busy: true });

    return new Promise((resolve) => {
      const id = `insp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      this.listeners.set(id, (msg) => {
        if (msg.type === "inspect_result") {
          this.listeners.delete(id);
          resolve(msg.result);
        }
      });
      this.worker!.postMessage({ type: "inspect", id, code, offset });
    });
  }

  run(code: string, onUpdate: (data: ExecutionResult) => void = () => { }): Promise<void> {
    if (!this.worker || (this.status !== "ready" && this.status !== "running")) {
      if (this.status === "stopped") throw new Error("Kernel is stopped");
      throw new Error("Kernel not ready");
    }

    const id = Math.random().toString(36).substring(7);
    this._setStatus("running");

    this.executionCount++;
    const startTime = Date.now();
    const kernelId = this.id;
    const execCount = this.executionCount;

    const currentResult: ExecutionResult = {
      stdout: [],
      stderr: [],
      result: undefined,
      mimebundle: undefined,
      error: undefined,
      executionTime: startTime,
      executionCount: execCount,
      executionKernelId: kernelId
    };

    return new Promise((resolve) => {
      this.listeners.set(id, (msg) => {
        if (msg.type === "stdout") {
          currentResult.stdout = [...currentResult.stdout, msg.content];
          onUpdate({ ...currentResult });
        } else if (msg.type === "stderr") {
          currentResult.stderr = [...currentResult.stderr, msg.content];
          onUpdate({ ...currentResult });
        } else if (msg.type === "success") {
          currentResult.result = msg.result;
          currentResult.mimebundle = msg.mimebundle;
          currentResult.executionDuration = Date.now() - startTime;
          onUpdate({ ...currentResult });
          this.listeners.delete(id);
          this._setStatus("ready");
          resolve();
        } else if (msg.type === "error") {
          currentResult.error = msg.error;
          currentResult.executionDuration = Date.now() - startTime;
          onUpdate({ ...currentResult });
          this.listeners.delete(id);
          this._setStatus("ready");
          resolve();
        }
      });

      this.worker!.postMessage({ type: "run", id, code });
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Reject all pending promises
    for (const [, listener] of this.listeners) {
      listener({ type: "error", error: "Kernel interrupted" });
    }
    this.listeners.clear();
    this._setStatus("stopped");
  }

  restart() {
    this.terminate();
    this.init();
  }
}

export const kernel = new Kernel();