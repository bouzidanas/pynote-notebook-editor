import { beforeEach, describe, expect, it } from "vitest";
import { actions, notebookStore, registerEditorFlush, type CellData } from "./store";
import { appNotebookFromDocument, documentFromApp } from "./notebook-io";
import { parseIpynb, serializeIpynb } from "./formats/ipynb";
import { PYNOTE_PYTHON_VERSION } from "./formats/document";

// The bridge between the store and the document model: what a save writes and
// what an open loads. Browser-level coverage of the same paths lives in
// e2e/tests/ipynb-fidelity.spec.ts.

const open = (nb: unknown) => {
  const parsed = parseIpynb(JSON.stringify(nb));
  if (!parsed.ok) throw new Error(parsed.error);
  const loaded = appNotebookFromDocument(parsed.value);
  actions.loadNotebook(
    loaded.cells, "test.ipynb", loaded.settings.history, loaded.settings.history.length - 1, null,
    loaded.settings.executionMode, undefined, undefined, undefined, undefined, loaded.metadata,
  );
  return loaded;
};

const foreignNotebook = () => ({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { display_name: "Python 3 (ipykernel)", language: "python", name: "python3" },
    language_info: { name: "python", version: "3.12.4", file_extension: ".py" },
    colab: { provenance: [] },
    PyNote: { history: [], executionMode: "reactive", futureSetting: 1 },
  },
  cells: [
    { id: "md-1", cell_type: "markdown", metadata: { tags: ["intro"] }, source: "# Hi", attachments: { "a.png": { "image/png": "AAAA" } } },
    { id: "code-1", cell_type: "code", metadata: { pynote: { autorun: false }, collapsed: true }, source: "x = 1", outputs: [], execution_count: 7 },
    { id: "raw-1", cell_type: "raw", metadata: { format: "text/latex" }, source: "\\\\LaTeX" },
  ],
});

describe("open then save", () => {
  beforeEach(() => actions.loadNotebook([], "empty.ipynb"));

  it("keeps ids, raw cells, attachments and other tools' metadata", () => {
    open(foreignNotebook());
    const saved = JSON.parse(serializeIpynb(documentFromApp()));
    expect(saved.cells.map((c: any) => [c.id, c.cell_type])).toEqual([["md-1", "markdown"], ["code-1", "code"], ["raw-1", "raw"]]);
    expect(saved.cells[0]).toMatchObject({ metadata: { tags: ["intro"] }, attachments: { "a.png": { "image/png": "AAAA" } } });
    expect(saved.cells[1].metadata).toEqual({ pynote: { autorun: false }, collapsed: true });
    expect(saved.cells[2]).toMatchObject({ metadata: { format: "text/latex" }, source: ["\\\\LaTeX"] });
    expect(saved.metadata.colab).toEqual({ provenance: [] });
    expect(saved.metadata.PyNote).toMatchObject({ executionMode: "reactive", futureSetting: 1 });
  });

  it("leaves another tool's kernel details alone but refreshes PyNote's own", () => {
    open(foreignNotebook());
    expect(documentFromApp().metadata.language_info).toEqual({ name: "python", version: "3.12.4", file_extension: ".py" });

    const pynoteMade = foreignNotebook();
    pynoteMade.metadata.kernelspec.display_name = "Python 3 (Pyodide)";
    pynoteMade.metadata.language_info.version = "3.11.3"; // what older PyNote versions wrote
    open(pynoteMade);
    expect(documentFromApp().metadata.language_info).toEqual({ name: "python", version: PYNOTE_PYTHON_VERSION, file_extension: ".py" });
  });

  it("forgets the previous notebook's metadata when a new one loads", () => {
    open(foreignNotebook());
    actions.loadNotebook([{ id: "n1", type: "code", content: "" }], "new.ipynb");
    expect(notebookStore.documentMetadata).toEqual({});
    expect(documentFromApp().metadata).not.toHaveProperty("colab");
  });

  it("keeps undo history pointing at the right cells after reopening", () => {
    // Session 1: add a markdown cell, then edit it (records "a" and "u").
    actions.loadNotebook([{ id: "c1", type: "code", content: "x = 1" }], "s1.ipynb");
    actions.addCell("markdown");
    const added = notebookStore.cells[1].id;
    actions.updateCell(added, "Hello");
    actions.setEditing(added, false);
    const file = serializeIpynb(documentFromApp());

    // Reopen the saved file and walk the history back and forth.
    actions.loadNotebook([], "empty.ipynb");
    open(JSON.parse(file));
    expect(notebookStore.cells[1]).toMatchObject({ id: added, content: "Hello" });
    actions.undo();
    expect(notebookStore.cells[1].content).toBe("");
    actions.undo();
    expect(notebookStore.cells).toHaveLength(1);
    actions.redo();
    actions.redo();
    expect(notebookStore.cells[1]).toMatchObject({ id: added, content: "Hello" });
  });

  it("asks debouncing editors for their latest text before snapshotting", () => {
    actions.loadNotebook([{ id: "m1", type: "markdown", content: "old" }], "flush.ipynb");
    const unregister = registerEditorFlush("m1", () => actions.updateCell("m1", "typed just now"));
    try {
      expect(documentFromApp().cells[0].source).toBe("typed just now");
    } finally {
      unregister();
    }
  });
});

describe("store actions that touch cell metadata", () => {
  const cell = (): CellData => ({
    id: "c1", type: "code", content: "",
    metadata: { tags: ["keep"], pynote: { autorun: false, placeholder: "p" } },
  });
  beforeEach(() => actions.loadNotebook([cell()], "meta.ipynb"));

  it("setting code visibility keeps the cell's other settings and other tools' keys", () => {
    actions.setCellCodeVisibility("c1", { showCode: false });
    expect(notebookStore.cells[0].metadata).toEqual({ tags: ["keep"], pynote: { autorun: false, placeholder: "p", codeview: { showCode: false } } });
  });

  it("clearing code visibility removes only the code visibility override", () => {
    actions.setCellCodeVisibility("c1", { showCode: false });
    actions.clearCellCodeVisibility("c1");
    expect(notebookStore.cells[0].metadata).toEqual({ tags: ["keep"], pynote: { autorun: false, placeholder: "p" } });
  });

  it("clearing the last setting leaves no empty metadata behind", () => {
    actions.loadNotebook([{ id: "c2", type: "code", content: "" }], "bare.ipynb");
    actions.setCellCodeVisibility("c2", { showCode: false });
    actions.clearCellCodeVisibility("c2");
    expect(notebookStore.cells[0].metadata).toBeUndefined();
  });
});

describe("ending a markdown edit session", () => {
  it("flushes the editor first, so the history entry has the final text", () => {
    actions.loadNotebook([{ id: "m1", type: "markdown", content: "" }], "edit.ipynb");
    actions.setActiveCell("m1");
    actions.setEditing("m1", true);
    const unregister = registerEditorFlush("m1", () => actions.updateCell("m1", "last keystrokes"));
    try {
      actions.setEditing("m1", false);
    } finally {
      unregister();
    }
    expect(notebookStore.cells[0].content).toBe("last keystrokes");
    expect(notebookStore.history[notebookStore.history.length - 1]).toBe("u|m1||last keystrokes");
  });

  it("new cells get short nbformat-style ids", () => {
    actions.loadNotebook([], "ids.ipynb");
    actions.addCell("code");
    actions.addCell("raw");
    for (const c of notebookStore.cells) expect(c.id).toMatch(/^[0-9a-f]{8}$/);
    expect(notebookStore.cells[1].type).toBe("raw");
  });
});
