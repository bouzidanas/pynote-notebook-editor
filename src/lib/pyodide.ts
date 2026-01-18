import { createSignal } from "solid-js";

export type KernelStatus = "loading" | "ready" | "running" | "error" | "stopped";

export interface ExecutionResult {
  stdout: string[];
  stderr: string[];
  result?: string;
  error?: string;
}

class Kernel {
  private worker: Worker | null = null;
  private listeners: Map<string, (msg: any) => void> = new Map();
  
  private _status;
  private _setStatus;

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
      } else if (id && this.listeners.has(id)) {
        this.listeners.get(id)!(e.data);
      }
    };

    this.worker.postMessage({ type: "init" });
  }

  run(code: string, onUpdate: (data: ExecutionResult) => void): Promise<void> {
    if (!this.worker || (this.status !== "ready" && this.status !== "running")) {
       if (this.status === "stopped") throw new Error("Kernel is stopped");
       throw new Error("Kernel not ready");
    }

    const id = Math.random().toString(36).substring(7);
    this._setStatus("running");

    const currentResult: ExecutionResult = {
      stdout: [],
      stderr: [],
    };

    return new Promise((resolve) => {
      this.listeners.set(id, (msg) => {
        if (msg.type === "stdout") {
          currentResult.stdout.push(msg.content);
          onUpdate({ ...currentResult });
        } else if (msg.type === "stderr") {
          currentResult.stderr.push(msg.content);
          onUpdate({ ...currentResult });
        } else if (msg.type === "success") {
          currentResult.result = msg.result;
          onUpdate({ ...currentResult });
          this.listeners.delete(id);
          this._setStatus("ready");
          resolve();
        } else if (msg.type === "error") {
          currentResult.error = msg.error;
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
    this._setStatus("stopped");
  }

  restart() {
    this.terminate();
    this.init();
  }
}

export const kernel = new Kernel();