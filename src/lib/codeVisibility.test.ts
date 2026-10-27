import { describe, expect, test } from "vitest";
import {
  DEFAULT_CODE_VISIBILITY,
  getCellOverrides,
  getEffectiveVisibility,
  getVisibilitySettings,
  hidesAnyPart,
  isCellShowingAll,
  removeCellOverride,
  setVisibilitySettings,
  toggleCellShowAll,
} from "./codeVisibility";

describe("hidesAnyPart", () => {
  test("is false when every part of a cell shows", () => {
    expect(hidesAnyPart({ ...DEFAULT_CODE_VISIBILITY })).toBe(false);
  });

  test("is true when any part is hidden", () => {
    for (const key of ["showCode", "showStdout", "showStderr", "showResult", "showError", "showStatusDot", "showExecutionCount"] as const) {
      expect(hidesAnyPart({ ...DEFAULT_CODE_VISIBILITY, [key]: false }), key).toBe(true);
    }
  });

  test("ignores how code is laid out: line numbers and wrapping are not parts", () => {
    expect(hidesAnyPart({ ...DEFAULT_CODE_VISIBILITY, showLineNumbers: false, lineWrap: false })).toBe(false);
  });
});

describe("the default view settings", () => {
  test("stay the defaults whatever the settings become: the store starts from a copy", () => {
    const defaults = { ...DEFAULT_CODE_VISIBILITY };
    setVisibilitySettings({ showCode: false, showLineNumbers: true });
    expect(getVisibilitySettings()).toMatchObject({ showCode: false, showLineNumbers: true });
    // What Reset and the Export dialog's differences compare with.
    expect(DEFAULT_CODE_VISIBILITY).toEqual(defaults);
    expect(DEFAULT_CODE_VISIBILITY.showCode).toBe(true);
    setVisibilitySettings({ ...defaults });
  });
});

describe("a cell's show-all (the eye)", () => {
  test("is forgotten with the cell: a cell that comes later with its id starts from its own view", () => {
    toggleCellShowAll("gone");
    expect(getEffectiveVisibility("gone", { showCode: false }).showCode).toBe(true);
    removeCellOverride("gone");
    expect(isCellShowingAll("gone")).toBe(false);
    expect(getCellOverrides()).not.toHaveProperty("gone");
    expect(getEffectiveVisibility("gone", { showCode: false }).showCode).toBe(false);
  });
});
