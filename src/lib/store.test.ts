import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { actions, notebookStore, defaultCells, type CellData } from "./store";
import { host, setHostProfile, standaloneProfile } from "./host";
import { kernel } from "./pyodide";

// Helper: reset the store to a deterministic baseline before each test.
// `loadNotebook` is the public entry point used by the file-load flow, so
// using it here keeps tests aligned with real-world initialization paths.
const seedNotebook = (cells: CellData[], activeCellId: string | null = null) => {
  actions.loadNotebook(cells, "test-notebook.ipynb", [], -1, activeCellId);
};

const makeMd = (id: string, content = ""): CellData => ({
  id,
  type: "markdown",
  content,
  isEditing: false,
});

beforeEach(() => {
  seedNotebook(structuredClone(defaultCells));
});

describe("actions.insertMarkdownCell", () => {
  it("inserts a markdown cell at the requested index with the given content", () => {
    seedNotebook([makeMd("a", "first"), makeMd("b", "second")]);

    const newId = actions.insertMarkdownCell(1, "inserted");

    expect(notebookStore.cells.map((c) => c.id)).toEqual(["a", newId, "b"]);
    const inserted = notebookStore.cells[1];
    expect(inserted.type).toBe("markdown");
    expect(inserted.content).toBe("inserted");
    expect(inserted.isEditing).toBe(false);
  });

  it("does NOT change the active cell (caller keeps focus)", () => {
    seedNotebook([makeMd("a"), makeMd("b")], "a");

    actions.insertMarkdownCell(1, "x");

    expect(notebookStore.activeCellId).toBe("a");
  });

  it("does NOT change isEditing on any sibling cell", () => {
    const cells: CellData[] = [
      { ...makeMd("a", "left"), isEditing: true },
      makeMd("b", "right"),
    ];
    seedNotebook(cells, "a");

    actions.insertMarkdownCell(1, "middle");

    const byId = Object.fromEntries(notebookStore.cells.map((c) => [c.id, c]));
    expect(byId["a"].isEditing).toBe(true);
    expect(byId["b"].isEditing).toBeFalsy();
    // The new cell itself must not auto-enter edit mode either.
    const newCell = notebookStore.cells.find((c) => c.id !== "a" && c.id !== "b");
    expect(newCell?.isEditing).toBe(false);
  });

  it("can insert at the beginning (index 0)", () => {
    seedNotebook([makeMd("a"), makeMd("b")]);

    const newId = actions.insertMarkdownCell(0, "head");

    expect(notebookStore.cells[0].id).toBe(newId);
    expect(notebookStore.cells[0].content).toBe("head");
  });

  it("can insert at the end (index === length)", () => {
    seedNotebook([makeMd("a"), makeMd("b")]);

    const newId = actions.insertMarkdownCell(2, "tail");

    expect(notebookStore.cells[notebookStore.cells.length - 1].id).toBe(newId);
  });

  it("is undoable as a single history entry (batched)", () => {
    seedNotebook([makeMd("a", "alpha")], "a");
    const initialIndex = notebookStore.historyIndex;

    actions.insertMarkdownCell(1, "beta");

    // The action records: add (`a`) + content set (`u`), batched into one
    // compound entry. Either way, undo should remove the new cell in a
    // single step.
    expect(notebookStore.historyIndex).toBeGreaterThan(initialIndex);
    actions.undo();
    expect(notebookStore.cells.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("a read-only host", () => {
  const appProfile = host();
  const savedOutputs = { stdout: ["42\n"], stderr: [], executionCount: 1 };

  // A read-only export of a notebook whose author left undo history behind.
  const seedExport = () => {
    actions.loadNotebook(
      [
        { id: "md", type: "markdown", content: "# Title", isEditing: false },
        { id: "code", type: "code", content: "print(42)", isEditing: false, outputs: savedOutputs },
      ],
      "export.ipynb",
      ["a|0|markdown|md", "u|md||# Title"],
      1,
      null,
    );
  };

  const snapshot = () => JSON.parse(JSON.stringify({
    cells: notebookStore.cells,
    history: notebookStore.history,
    historyIndex: notebookStore.historyIndex,
    executionQueue: notebookStore.executionQueue,
  }));

  beforeEach(() => {
    seedExport();
    setHostProfile(standaloneProfile({
      exportId: "test",
      filename: "export.ipynb",
      document: { cells: [], metadata: {} },
      theme: {},
      codeVisibility: {},
      mode: "readonly",
      startInPresentation: true,
    }));
  });

  afterEach(() => {
    setHostProfile(appProfile);
    vi.restoreAllMocks();
  });

  it("refuses every action that would change the notebook or run it", () => {
    const restart = vi.spyOn(kernel, "restart").mockImplementation(() => {});
    const terminate = vi.spyOn(kernel, "terminate").mockImplementation(() => {});
    const runKernel = vi.fn(async () => {});
    const before = snapshot();

    actions.addCell("code");
    actions.addCell("markdown", 0);
    actions.changeCellType("md", "raw");
    actions.moveCell(0, 1);
    actions.clearCellOutput("code");
    actions.clearAllOutputs();
    actions.deleteCell("md");
    actions.deleteAllCells();
    actions.undo();
    actions.redo();
    actions.runCell("code", runKernel);
    actions.setEditing("md", true);
    actions.restartKernel();
    actions.shutDownKernel();

    expect(snapshot()).toEqual(before);
    expect(notebookStore.cells.find((c) => c.id === "code")?.outputs).toEqual(savedOutputs);
    expect(notebookStore.cells.every((c) => !c.isEditing)).toBe(true);
    expect(runKernel).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
  });

  it("is a property of the host: the same notebook in the app can change", () => {
    setHostProfile(appProfile);
    const restart = vi.spyOn(kernel, "restart").mockImplementation(() => {});

    actions.undo();
    expect(notebookStore.cells.find((c) => c.id === "md")?.content).toBe("");
    actions.clearAllOutputs();
    expect(notebookStore.cells.find((c) => c.id === "code")?.outputs).toBeUndefined();
    actions.restartKernel();
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
