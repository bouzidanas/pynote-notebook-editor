import { describe, expect, test } from "vitest";
import { allCellOptions, mergeConfig } from "./bridge";

describe("the page-wide bridge", () => {
  test("adapters name every cell option, so a prop left out goes back to its default", () => {
    // toStrictEqual: the options a page does not set are present, as undefined.
    expect(allCellOptions({ code: "x = 1", showCode: false })).toStrictEqual({
      code: "x = 1",
      id: undefined,
      editable: undefined,
      menu: undefined,
      autorun: undefined,
      showCode: false,
      showStdout: undefined,
      showStderr: undefined,
      showResult: undefined,
      showError: undefined,
      showStatusDot: undefined,
      visibilityToggle: undefined,
    });
  });

  test("later settings change only what they name; the theme merges key by key", () => {
    const config = mergeConfig({ executionMode: "reactive", theme: { colors: { background: "#000", primary: "#fff" } } }, { theme: { colors: { primary: "#f00" } } });
    expect(config).toEqual({ executionMode: "reactive", theme: { colors: { background: "#000", primary: "#f00" } } });
  });
});
