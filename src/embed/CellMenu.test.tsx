import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, test } from "vitest";
import { kernel } from "../lib/pyodide";
import { actions, notebookStore } from "../lib/store";
import {
  codeVisibility,
  getEffectiveVisibility,
  isCellShowingAll,
  removeCellOverride,
  resetUserOverride,
  setVisibilitySettings,
  toggleCellShowAll,
} from "../lib/codeVisibility";
import CellMenu from "./CellMenu";

// The menu of a cell embedded in a web page (the pynote package): built when
// the cell mounts, usually before Python has started, so everything it shows
// must follow the kernel and the cell from then on.

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage() {}
  terminate() {}
}

let worker: FakeWorker | null = null;
kernel.configure({ createWorker: () => (worker = new FakeWorker()) as unknown as Worker });
const pythonReady = () => worker!.onmessage!({ data: { type: "ready" } });

const menuOf = (cellId: string, lockExecutionMode = false) => {
  render(() => (
    <div data-testid={`cell-${cellId}`}>
      <CellMenu cellId={cellId} run={() => {}} runAll={() => {}} startPython={() => kernel.init()} lockExecutionMode={() => lockExecutionMode} />
    </div>
  ));
  const cell = within(screen.getByTestId(`cell-${cellId}`));
  return {
    open: () => fireEvent.click(cell.getByRole("button", { name: "Cell menu" })),
    menu: () => within(cell.getByRole("menu")),
    status: () => cell.getByRole("status").textContent,
  };
};

const codeview = (id: string) => notebookStore.cells.find((c) => c.id === id)?.metadata?.pynote?.codeview;

afterEach(() => {
  for (const cell of [...notebookStore.cells]) {
    actions.detachCell(cell.id);
    removeCellOverride(cell.id);
  }
  setVisibilitySettings({ showLineNumbers: false });
  resetUserOverride();
});

describe("the cell menu of an embedded cell", () => {
  test("follows Python as it starts, shuts down and starts again", async () => {
    actions.attachCell({ id: "c1", content: "x = 1", metadata: undefined }, 0);
    const cell = menuOf("c1");
    await cell.open();
    expect(cell.status()).toBe("Python starts when a cell runs");
    expect(cell.menu().getByRole("menuitem", { name: /Start/ })).toBeInTheDocument();

    kernel.init(); // a cell runs
    expect(cell.status()).toBe("Starting Python…");
    pythonReady();
    expect(cell.status()).toBe("Python is ready");
    expect(cell.menu().queryByRole("menuitem", { name: /Start/ })).toBeNull();
    expect(cell.menu().getByRole("menuitem", { name: /Restart/ })).toBeInTheDocument();

    await fireEvent.click(cell.menu().getByRole("menuitem", { name: /Shut Down/ }));
    await cell.open();
    expect(cell.status()).toBe("Python is shut down");
    await fireEvent.click(cell.menu().getByRole("menuitem", { name: /Start/ }));
    await cell.open();
    expect(cell.status()).toBe("Starting Python…");
    pythonReady();
    expect(cell.status()).toBe("Python is ready");
    kernel.terminate();
  });

  test("line numbers change for every cell without undoing a cell's own view options", async () => {
    actions.attachCell({ id: "hidden", content: "secret = 42", metadata: { pynote: { codeview: { showCode: false } } } }, 0);
    actions.attachCell({ id: "other", content: "print(1)", metadata: undefined }, 1);
    const other = menuOf("other");
    await other.open();
    await fireEvent.click(other.menu().getByRole("menuitem", { name: /Show Line Numbers/ }));
    expect(codeVisibility.showLineNumbers).toBe(true);
    expect(getEffectiveVisibility("hidden", codeview("hidden")).showCode).toBe(false);

    // ...and Show Code still works on that cell afterwards.
    const hidden = menuOf("hidden");
    await hidden.open();
    await fireEvent.click(hidden.menu().getByRole("menuitem", { name: /Show Code/ }));
    expect(getEffectiveVisibility("hidden", codeview("hidden")).showCode).toBe(true);
  });

  test("Show Code and Hide Code keep the cell's other view options", async () => {
    actions.attachCell({ id: "quiet", content: "print('x')", metadata: { pynote: { codeview: { showCode: false, showStdout: false } } } }, 0);
    const cell = menuOf("quiet");
    await cell.open();
    await fireEvent.click(cell.menu().getByRole("menuitem", { name: /Show Code/ }));
    expect(codeview("quiet")).toEqual({ showCode: true, showStdout: false });
    await cell.open();
    await fireEvent.click(cell.menu().getByRole("menuitem", { name: /Hide Code/ }));
    expect(codeview("quiet")).toEqual({ showCode: false, showStdout: false });
  });

  test("Hide Code while the eye shows everything hides the code at once, and the eye is released", async () => {
    actions.attachCell({ id: "peek", content: "answer = 42", metadata: { pynote: { codeview: { showCode: false, showStdout: false } } } }, 0);
    toggleCellShowAll("peek"); // the eye
    const cell = menuOf("peek");
    await cell.open();
    await fireEvent.click(cell.menu().getByRole("menuitem", { name: /Hide Code/ }));
    expect(isCellShowingAll("peek")).toBe(false);
    expect(getEffectiveVisibility("peek", codeview("peek"))).toMatchObject({ showCode: false, showStdout: false });
    await cell.open();
    expect(cell.menu().getByRole("menuitem", { name: /Show Code/ })).toBeInTheDocument();
  });

  test("a locked execution mode leaves out the Execution section", async () => {
    actions.attachCell({ id: "c1", content: "", metadata: undefined }, 0);
    const locked = menuOf("c1", true);
    await locked.open();
    expect(locked.menu().queryByText("Execution")).toBeNull();
    expect(locked.menu().queryByRole("menuitemradio")).toBeNull();
  });
});
