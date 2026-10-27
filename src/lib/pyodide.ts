import { createSignal } from "solid-js";
import { DEFAULT_PYODIDE_SOURCE, type PyodideSource } from "./pyodide-config";

export type KernelStatus = "loading" | "ready" | "running" | "error" | "stopped";

export interface KernelOptions {
  // Creates the worker that runs Pyodide (src/lib/pyodide.worker.ts). Each
  // host wires its own: the app entry passes its bundled module worker
  // (src/index.tsx), offline exports a classic worker made from embedded
  // source (a page opened from file:// cannot start a module worker from a
  // Blob). Keeping the worker URL out of this module means bundles that never
  // use the app's worker do not carry it.
  // May be async: offline exports decode the worker and Pyodide's loader
  // from compressed data embedded in the page.
  createWorker?: () => Worker | Promise<Worker>;
  // Where the worker loads Pyodide from (see pyodide-config.ts).
  pyodide?: PyodideSource;
  // Supplies embedded Pyodide assets by file name (offline exports).
  provideAsset?: (name: string) => Promise<ArrayBuffer | null>;
}

export interface ScriptResult {
  stdout: string;
  stderr: string;
  // The traceback, or null when the script ran to completion.
  error: string | null;
}

const noWorkerConfigured = (): Worker | Promise<Worker> => {
  throw new Error("Kernel has no worker factory: call kernel.configure({ createWorker }) before init()");
};

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

export type KernelFsRequest =
  | { op: "list"; path?: string }
  | { op: "mkdir"; path: string }
  | { op: "upload"; path: string; files: Array<{ name: string; data_base64: string }> }
  | { op: "delete"; path: string }
  | { op: "rename"; path: string; newName: string }
  | { op: "move"; sourcePath: string; destinationDir: string; onConflict?: "error" | "replace" | "keep_both" | "skip" }
  | { op: "copy"; sourcePath: string; destinationDir: string; onConflict?: "error" | "replace" | "keep_both" | "skip" }
  | { op: "download"; path: string }
  | { op: "read_text"; path: string; maxBytes?: number };

export class Kernel {
  private worker: Worker | null = null;
  private options: Required<Pick<KernelOptions, "createWorker" | "pyodide">> & Pick<KernelOptions, "provideAsset"> = {
    createWorker: noWorkerConfigured,
    pyodide: DEFAULT_PYODIDE_SOURCE,
  };
  private readyWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private listeners: Map<string, (msg: any) => void> = new Map();
  private componentListeners: Map<string, (data: any) => void> = new Map();
  private componentToCellMap: Map<string, string> = new Map(); // Track which cell each component belongs to
  // What each mounted component currently displays (its props after Python
  // updates and user interaction), read when exporting saved outputs. It
  // belongs to the components on screen, not to a Python process: a restart
  // or shutdown leaves the outputs showing, so entries go only when their
  // component unmounts or its cell runs again.
  private componentSnapshots: Map<string, () => Record<string, unknown>> = new Map();
  private currentCellContext: string | null = null;

  private _status;
  private _setStatus;
  private _started;
  private _setStarted;

  public id: string = "";
  public executionCount: number = 0;
  private activeExecutions: number = 0;

  constructor() {
    const [status, setStatus] = createSignal<KernelStatus>("loading");
    this._status = status;
    this._setStatus = setStatus;
    const [started, setStarted] = createSignal(false);
    this._started = started;
    this._setStarted = setStarted;
  }

  get status() {
    return this._status();
  }

  /** Whether init() has run (reactive, like status). Cells embedded in other sites start Python on first use. */
  get started() {
    return this._started();
  }

  /** Set before init(); later calls apply to the next init or restart. */
  configure(options: KernelOptions) {
    this.options = { ...this.options, ...options };
  }

  get configuration(): Readonly<KernelOptions> {
    return this.options;
  }

  /** Resolves once the kernel is ready; rejects if it fails to start or stops first. */
  whenReady(): Promise<void> {
    if (this.status === "ready" || this.status === "running") return Promise.resolve();
    if (this.status === "error") return Promise.reject(new Error("Kernel failed to start"));
    return new Promise((resolve, reject) => this.readyWaiters.push({ resolve, reject }));
  }

  private settleReadyWaiters(error?: Error) {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const waiter of waiters) error ? waiter.reject(error) : waiter.resolve();
  }

  init() {
    if (this.worker) this.terminate();

    this.id = Math.random().toString(36).substring(7);
    this.executionCount = 0;
    this.activeExecutions = 0;
    this._setStatus("loading");
    this._setStarted(true);
    const generation = ++this.initGeneration;
    let created: Worker | Promise<Worker>;
    try {
      created = this.options.createWorker();
    } catch (err) {
      this.failToStart(err);
      return;
    }
    if (!(created instanceof Promise)) {
      this.attachWorker(created);
    } else {
      created.then(
        // A restart or shutdown during the wait makes this worker stale.
        (worker) => (generation === this.initGeneration ? this.attachWorker(worker) : worker.terminate()),
        (err) => { if (generation === this.initGeneration) this.failToStart(err); },
      );
    }
  }

  private initGeneration = 0;

  private failToStart(err: unknown) {
    console.error("Pyodide Init Error:", err);
    this._setStatus("error");
    this.settleReadyWaiters(err instanceof Error ? err : new Error(String(err)));
  }

  private attachWorker(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e) => {
      const { type, id, error } = e.data;

      if (type === "ready") {
        this._setStatus("ready");
        this.settleReadyWaiters();
      } else if (type === "error" && !id) {
        // Global init error
        console.error("Pyodide Init Error:", error);
        this._setStatus("error");
        this.settleReadyWaiters(new Error(String(error)));
      } else if (type === "asset_request") {
        void this.answerAssetRequest(e.data.requestId, e.data.name);
      } else if (type === "component_update") {
        const { uid, data } = e.data;
        if (this.componentListeners.has(uid)) {
          this.componentListeners.get(uid)!(data);
        }
      } else if (id && this.listeners.has(id)) {
        this.listeners.get(id)!(e.data);
      }
    };

    this.worker.postMessage({ type: "init", pyodide: this.options.pyodide });
  }

  private async answerAssetRequest(requestId: number, name: string) {
    let bytes: ArrayBuffer | null = null;
    try {
      bytes = (await this.options.provideAsset?.(name)) ?? null;
    } catch (err) {
      console.error(`Failed to provide embedded asset ${name}:`, err);
    }
    this.worker?.postMessage({ type: "asset_response", requestId, bytes }, bytes ? [bytes] : []);
  }

  /**
   * Run a whole script as `python script.py` would, in this kernel's worker
   * (used on a throwaway kernel to check exported .py files).
   */
  runScript(source: string): Promise<ScriptResult> {
    if (!this.worker || (this.status !== "ready" && this.status !== "running")) {
      return Promise.reject(new Error(this.status === "stopped" ? "Kernel is stopped" : "Kernel not ready"));
    }
    const id = `script_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const stdout: string[] = [];
    const stderr: string[] = [];
    return new Promise((resolve) => {
      this.listeners.set(id, (msg) => {
        if (msg.type === "stdout") stdout.push(msg.content);
        else if (msg.type === "stderr") stderr.push(msg.content);
        else if (msg.type === "script_result" || msg.type === "error") {
          this.listeners.delete(id);
          resolve({ stdout: stdout.join(""), stderr: stderr.join(""), error: msg.type === "error" ? String(msg.error) : msg.error ?? null });
        }
      });
      this.worker!.postMessage({ type: "run_script", id, source });
    });
  }

  sendInteraction(uid: string, data: any) {
    if (this.worker && (this.status === "ready" || this.status === "running")) {
      this.worker.postMessage({ type: "interaction", uid, data });
    }
  }

  registerComponentListener(uid: string, callback: (data: any) => void, snapshot?: () => Record<string, unknown>) {
    this.componentListeners.set(uid, callback);
    if (snapshot) this.componentSnapshots.set(uid, snapshot);
    // Track which cell this component belongs to
    if (this.currentCellContext) {
      this.componentToCellMap.set(uid, this.currentCellContext);
    }
  }

  unregisterComponentListener(uid: string) {
    // Only unregister if this component isn't part of an active cell re-registration
    // Race condition: When a cell re-executes, clearCellState removes old listeners,
    // then new components register with same IDs. If old components cleanup after 
    // new ones register, they'd remove the new listeners. Prevent this by checking
    // if the component belongs to the current cell context (meaning it was just re-registered)
    const cellId = this.componentToCellMap.get(uid);
    if (!cellId || cellId !== this.currentCellContext) {
      // Safe to unregister: either already cleared, or belongs to a different cell
      this.componentListeners.delete(uid);
      this.componentToCellMap.delete(uid);
      this.componentSnapshots.delete(uid);
    }
    // If cellId === currentCellContext, this is a new registration, don't remove it
  }

  /** The props a mounted component currently displays, if it reports them. */
  componentSnapshot(uid: string): Record<string, unknown> | undefined {
    return this.componentSnapshots.get(uid)?.();
  }

  setCellContext(cellId: string) {
    this.currentCellContext = cellId;
    if (this.worker && this.status === "ready") {
      this.worker.postMessage({ type: "set_cell_context", id: cellId });
    }
  }

  clearCellState(cellId: string) {
    // Clear all JavaScript component listeners for this cell
    const componentsToRemove: string[] = [];
    for (const [componentId, cellId_] of this.componentToCellMap.entries()) {
      if (cellId_ === cellId) {
        componentsToRemove.push(componentId);
      }
    }
    for (const componentId of componentsToRemove) {
      this.componentListeners.delete(componentId);
      this.componentToCellMap.delete(componentId);
      this.componentSnapshots.delete(componentId);
    }

    // Clear Python-side state
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

  filesystem<T = unknown>(request: KernelFsRequest): Promise<T> {
    if (!this.worker || this.status === "loading") {
      return Promise.reject(new Error("Kernel not ready"));
    }

    return new Promise((resolve, reject) => {
      const id = `fs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      this.listeners.set(id, (msg) => {
        if (msg.type === "filesystem_result") {
          this.listeners.delete(id);
          if (msg.ok) {
            resolve(msg.result as T);
          } else {
            reject(new Error(msg.error || "Filesystem request failed"));
          }
        }
      });
      this.worker!.postMessage({ type: "filesystem", id, request });
    });
  }

  run(code: string, onUpdate: (data: ExecutionResult) => void = () => { }): Promise<void> {
    if (!this.worker || (this.status !== "ready" && this.status !== "running")) {
      if (this.status === "stopped") throw new Error("Kernel is stopped");
      throw new Error("Kernel not ready");
    }

    const id = Math.random().toString(36).substring(7);
    this.activeExecutions++;
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
          this.activeExecutions = Math.max(0, this.activeExecutions - 1);
          if (this.activeExecutions === 0) this._setStatus("ready");
          resolve();
        } else if (msg.type === "error") {
          currentResult.error = msg.error;
          currentResult.executionDuration = Date.now() - startTime;
          onUpdate({ ...currentResult });
          this.listeners.delete(id);
          this.activeExecutions = Math.max(0, this.activeExecutions - 1);
          if (this.activeExecutions === 0) this._setStatus("ready");
          resolve();
        }
      });

      this.worker!.postMessage({ type: "run", id, code });
    });
  }

  terminate() {
    this.initGeneration++; // a worker still being created will be discarded
    if (this.worker) {
      const oldWorker = this.worker;
      this.worker = null;

      // Terminate immediately. No need for cleanup since restart() creates
      // a fresh Pyodide instance with empty caches anyway, and terminate()
      // on its own doesn't need cache clearing since everything is discarded.
      oldWorker.terminate();
    }
    // Reject all pending promises
    for (const [, listener] of this.listeners) {
      listener({ type: "error", error: "Kernel interrupted" });
    }
    this.listeners.clear();
    this.componentListeners.clear();
    this.componentToCellMap.clear();
    // componentSnapshots stay: the components and what they show stay on screen.
    this.currentCellContext = null;
    this.activeExecutions = 0;
    this._setStatus("stopped");
    this.settleReadyWaiters(new Error("Kernel stopped"));
  }

  restart() {
    this.terminate();
    this.init();
  }
}

export const kernel = new Kernel();