import { describe, expect, test } from "vitest";
import { DEFAULT_PREFERENCES, componentOptionsFor, parsePreferences, storedComponent } from "./preferences";
import { FORMATS } from "./formats";

describe("parsePreferences", () => {
  test("nothing stored, or not JSON, gives the defaults", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("{not json")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("42")).toEqual(DEFAULT_PREFERENCES);
  });

  test("a first export preselects .ipynb, the default file format, listed first", () => {
    expect(parsePreferences(null).format).toBe("ipynb");
    expect(FORMATS[0].id).toBe("ipynb");
  });

  test("keeps stored choices", () => {
    const stored = {
      format: "component",
      text: { ipynbClean: true, pythonMarkdown: false, markdownCode: true },
      webapp: { ...DEFAULT_PREFERENCES.webapp, mode: "readonly", staticHtml: true },
      component: { ...DEFAULT_PREFERENCES.component, framework: "next", theme: "default", python: "site", pyodideUrl: "/py/" },
    };
    expect(parsePreferences(JSON.stringify(stored))).toEqual(stored);
  });

  test("an older or broken shape falls back value by value", () => {
    const prefs = parsePreferences(
      JSON.stringify({
        format: "pdf",
        text: { ipynbClean: "yes", pythonMarkdown: false },
        webapp: { mode: "kiosk", layout: "folder" },
        component: { framework: "vue", editable: false, view: 3, removed: true },
      }),
    );
    expect(prefs.format).toBe(DEFAULT_PREFERENCES.format);
    expect(prefs.text).toEqual({ ...DEFAULT_PREFERENCES.text, pythonMarkdown: false });
    expect(prefs.webapp).toEqual({ ...DEFAULT_PREFERENCES.webapp, layout: "folder" });
    expect(prefs.component).toEqual({ ...DEFAULT_PREFERENCES.component, editable: false });
  });
});

test("the execution mode is the notebook's, never a stored preference", () => {
  const options = componentOptionsFor(DEFAULT_PREFERENCES, "reactive");
  expect(options.executionMode).toBe("reactive");
  expect(storedComponent(options)).not.toHaveProperty("executionMode");
  expect(parsePreferences(JSON.stringify({ component: { ...options } })).component).not.toHaveProperty("executionMode");
});
