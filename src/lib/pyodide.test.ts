import { describe, expect, test } from "vitest";
import { Kernel } from "./pyodide";

// The snapshot registry: what each mounted pynote_ui component shows, which
// read-only and static exports save. It follows the components on screen, not
// the Python process behind them.

const fakeWorker = () => ({ postMessage() {}, terminate() {}, onmessage: null }) as unknown as Worker;

const startedKernel = () => {
  const kernel = new Kernel();
  kernel.configure({ createWorker: fakeWorker });
  kernel.init();
  return kernel;
};

describe("Kernel component snapshots", () => {
  test("survive a kernel restart, as the components and what they show stay on screen", () => {
    const kernel = startedKernel();
    let shown = { value: 7, min: 0, max: 10 };
    kernel.setCellContext("cell-1");
    kernel.registerComponentListener("slider-1", () => {}, () => shown);
    shown = { ...shown, value: 8 }; // the reader moved the slider

    kernel.restart();
    expect(kernel.componentSnapshot("slider-1")).toEqual({ value: 8, min: 0, max: 10 });
    kernel.terminate(); // shut down: the outputs still show
    expect(kernel.componentSnapshot("slider-1")).toEqual({ value: 8, min: 0, max: 10 });
  });

  test("go when their component unmounts, after a restart too", () => {
    const kernel = startedKernel();
    kernel.setCellContext("cell-1");
    kernel.registerComponentListener("slider-1", () => {}, () => ({ value: 8 }));
    kernel.restart();
    kernel.unregisterComponentListener("slider-1");
    expect(kernel.componentSnapshot("slider-1")).toBeUndefined();
  });

  test("of a cell that runs again are replaced by its new components'", () => {
    const kernel = startedKernel();
    kernel.setCellContext("cell-1");
    kernel.registerComponentListener("old", () => {}, () => ({ value: 1 }));
    kernel.clearCellState("cell-1");
    expect(kernel.componentSnapshot("old")).toBeUndefined();
    kernel.registerComponentListener("new", () => {}, () => ({ value: 2 }));
    expect(kernel.componentSnapshot("new")).toEqual({ value: 2 });
  });
});
