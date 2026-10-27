import { afterEach, describe, expect, test } from "vitest";
import { actions, notebookStore } from "../lib/store";
import { changeCellCodeview, mergeCodeview } from "./codeview";

const codeview = (id: string) => notebookStore.cells.find((c) => c.id === id)?.metadata?.pynote?.codeview;

afterEach(() => {
  for (const cell of [...notebookStore.cells]) actions.detachCell(cell.id);
});

describe("an embedded cell's view options", () => {
  test("change one at a time, keeping the others", () => {
    expect(mergeCodeview({ showCode: false, showStdout: false }, { showStdout: true })).toEqual({ showCode: false, showStdout: true });
    expect(mergeCodeview({ showStdout: false }, { showCode: false })).toEqual({ showStdout: false, showCode: false });
  });

  test("undefined takes an option back to the notebook's setting", () => {
    expect(mergeCodeview({ showCode: false, showStdout: false }, { showStdout: undefined })).toEqual({ showCode: false });
    expect(mergeCodeview({ showCode: false }, { showCode: undefined })).toBeUndefined();
    expect(mergeCodeview(undefined, {})).toBeUndefined();
  });

  test("a prop, an attribute or the menu changing one option keeps the cell's others", () => {
    actions.attachCell({ id: "c1", content: "print(1)", metadata: { pynote: { codeview: { showCode: false, showStdout: false }, autorun: true } } }, 0);
    changeCellCodeview("c1", { showStdout: true });
    expect(codeview("c1")).toEqual({ showCode: false, showStdout: true });
    changeCellCodeview("c1", { showCode: true });
    expect(codeview("c1")).toEqual({ showCode: true, showStdout: true });
    // The rest of the cell's PyNote metadata stays.
    expect(notebookStore.cells[0].metadata?.pynote?.autorun).toBe(true);
  });

  test("removing the last option removes the cell's view options", () => {
    actions.attachCell({ id: "c2", content: "", metadata: { pynote: { codeview: { showCode: false } } } }, 0);
    changeCellCodeview("c2", { showCode: undefined });
    expect(notebookStore.cells.find((c) => c.id === "c2")?.metadata).toBeUndefined();
  });
});
