import { describe, expect, it } from "vitest";
import {
  buildNotebookSettings,
  pruneEmptyThemeOverrides,
  readNotebookSettings,
  sanitizeCellMetadata,
  type NotebookSettingsInputs,
} from "./pynote-settings";

const codeview = {
  showCode: true, showStdout: false, showStderr: true, showResult: true,
  showError: true, showStatusDot: false, showExecutionCount: true,
};

const baseInputs = (overrides: Partial<NotebookSettingsInputs> = {}): NotebookSettingsInputs => ({
  history: ["a|0|code|c1"],
  executionMode: "hybrid",
  codeVisibility: { ...codeview, saveToExport: false },
  theme: { saveToExport: false, outputLayout: "below", colors: { primary: "#f38ba8" }, font: "" },
  defaultTheme: { colors: { primary: "#f38ba8" }, font: "" },
  loaded: null,
  ...overrides,
});

describe("buildNotebookSettings (save rules carried over from Notebook.tsx)", () => {
  it("always writes history and execution mode, optional notebook settings only when set", () => {
    expect(buildNotebookSettings(baseInputs())).toEqual({ history: ["a|0|code|c1"], executionMode: "hybrid" });
    expect(buildNotebookSettings(baseInputs({ notebookAutorun: false, notebookAutorunOnRefresh: true, codeHiddenPlaceholder: "hidden" })))
      .toMatchObject({ autorun: false, autorunOnRefresh: true, codeHiddenPlaceholder: "hidden" });
  });

  // The theme / code view matrix: save-to-export checkbox x what the file was loaded with.
  const loadedTheme = { colors: { primary: "#000000" }, outputLayout: "above" };
  const loadedCodeview = { showCode: false };

  it("code view: checkbox on writes the live settings", () => {
    const out = buildNotebookSettings(baseInputs({ codeVisibility: { ...codeview, saveToExport: true }, loaded: { codeview: loadedCodeview } }));
    expect(out.codeview).toEqual(codeview);
  });

  it("code view: checkbox off writes back the loaded settings, or nothing", () => {
    expect(buildNotebookSettings(baseInputs({ loaded: { codeview: loadedCodeview } })).codeview).toEqual(loadedCodeview);
    expect(buildNotebookSettings(baseInputs())).not.toHaveProperty("codeview");
  });

  it("theme: checkbox on writes the live theme, pruned of no-op empty values", () => {
    const out = buildNotebookSettings(baseInputs({ theme: { saveToExport: true, outputLayout: "below", colors: { primary: "#111111" }, font: "" }, loaded: { theme: loadedTheme } }));
    expect(out.theme).toEqual({ outputLayout: "below", colors: { primary: "#111111" } });
  });

  it("theme: checkbox off writes back the loaded theme", () => {
    expect(buildNotebookSettings(baseInputs({ loaded: { theme: loadedTheme } })).theme).toEqual(loadedTheme);
  });

  it("theme: the Code dialog's output toggle wins over the loaded theme when its checkbox is on", () => {
    const out = buildNotebookSettings(baseInputs({ codeVisibility: { ...codeview, saveToExport: true }, loaded: { theme: loadedTheme } }));
    expect(out.theme).toEqual({ ...loadedTheme, outputLayout: "below" });
  });

  it("theme: no loaded theme and only the Code checkbox on writes just the output toggle", () => {
    const out = buildNotebookSettings(baseInputs({ codeVisibility: { ...codeview, saveToExport: true } }));
    expect(out.theme).toEqual({ outputLayout: "below" });
  });

  it("carries through keys from newer PyNote versions but never stale managed keys", () => {
    const out = buildNotebookSettings(baseInputs({
      loaded: { futureSetting: { on: true }, showTrailingAddButtons: false, autorun: true, history: ["old"], executionMode: "reactive" },
    }));
    expect(out).toEqual({ futureSetting: { on: true }, showTrailingAddButtons: false, history: ["a|0|code|c1"], executionMode: "hybrid" });
  });

  it("does not share objects with its inputs", () => {
    const loaded = { theme: { colors: { primary: "#000000" } } };
    const out = buildNotebookSettings(baseInputs({ loaded })) as any;
    out.theme.colors.primary = "#ffffff";
    expect(loaded.theme.colors.primary).toBe("#000000");
  });
});

describe("pruneEmptyThemeOverrides", () => {
  it("drops empty strings whose default is also empty, and emptied objects", () => {
    expect(pruneEmptyThemeOverrides({ a: "", b: "", c: { d: "" }, e: "x" }, { a: "", b: "set", c: { d: "" } }))
      .toEqual({ b: "", e: "x" });
  });
});

describe("readNotebookSettings", () => {
  it("validates every value and ignores the rest", () => {
    expect(readNotebookSettings({
      PyNote: {
        history: ["a|0|code|x", 7, null],
        executionMode: "turbo",
        autorun: "yes",
        autorunOnRefresh: false,
        codeHiddenPlaceholder: 3,
        showTrailingAddButtons: false,
        codeview: { showCode: false, showStdout: "no", bogus: true },
        theme: { colors: { primary: "#123456" } },
      },
    })).toEqual({
      history: ["a|0|code|x"],
      autorunOnRefresh: false,
      showTrailingAddButtons: false,
      codeview: { showCode: false },
      theme: { colors: { primary: "#123456" } },
    });
  });

  it("returns empty settings for notebooks without PyNote metadata", () => {
    expect(readNotebookSettings({})).toEqual({ history: [] });
    expect(readNotebookSettings({ PyNote: "nonsense" })).toEqual({ history: [] });
  });
});

describe("sanitizeCellMetadata", () => {
  it("keeps other tools' keys and valid PyNote keys, drops invalid PyNote values", () => {
    const { metadata, dropped } = sanitizeCellMetadata({
      tags: ["x"],
      pynote: { autorun: "yes", autorunOnRefresh: true, placeholder: 5, codeview: { showCode: false, showStdout: 1 }, future: 1 },
    });
    expect(metadata).toEqual({ tags: ["x"], pynote: { autorunOnRefresh: true, codeview: { showCode: false }, future: 1 } });
    expect(dropped.sort()).toEqual(["pynote.autorun", "pynote.placeholder"]);
  });

  it("removes a pynote entry that is not an object or ends up empty", () => {
    expect(sanitizeCellMetadata({ pynote: 3 }).metadata).toEqual({});
    expect(sanitizeCellMetadata({ pynote: { autorun: "x" } }).metadata).toEqual({});
  });

  it("does not mutate its input", () => {
    const input = { pynote: { autorun: "yes" } };
    sanitizeCellMetadata(input);
    expect(input).toEqual({ pynote: { autorun: "yes" } });
  });
});
