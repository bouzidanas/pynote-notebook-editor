import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { TextField } from "./controls";
import ComponentSettings from "./ComponentSettings";
import type { ComponentOptions } from "../../lib/export/component-export";
import { PYODIDE_VERSION } from "../../lib/pyodide-config";

// The sliding toggles measure their choices; jsdom has no layout to observe.
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("TextField", () => {
  test("is named by its label alone, and described by its hint", async () => {
    const onInput = vi.fn();
    render(() => <TextField label="Folder URL" value="/pyodide/" hint="Where the files go." onInput={onInput} />);
    const field = screen.getByRole("textbox", { name: "Folder URL" });
    expect(field).toHaveAccessibleName("Folder URL");
    expect(field).toHaveAccessibleDescription("Where the files go.");
    await fireEvent.input(field, { target: { value: "/static/" } });
    expect(onInput).toHaveBeenCalledWith("/static/");
  });
});

describe("ComponentSettings", () => {
  const options: ComponentOptions = {
    framework: "astro",
    editable: true,
    menu: true,
    autorun: false,
    executionMode: "hybrid",
    lockExecutionMode: false,
    theme: "notebook",
    view: "notebook",
    python: "site",
    pyodideUrl: "/pyodide/",
  };

  test("a self-hosted Pyodide folder needs Pyodide's full release, which has the packages", () => {
    render(() => (
      <ComponentSettings options={options} onChange={() => {}} customTheme={false} customView={false} fileName="pynote.config.json" showPreview={() => {}} />
    ));
    const field = screen.getByRole("textbox", { name: "Folder URL" });
    // The npm package has Pyodide's core files only: no micropip, which
    // Python loads when it starts, and no package wheels.
    expect(field).toHaveAccessibleDescription(expect.stringContaining(`pyodide-${PYODIDE_VERSION}.tar.bz2`));
    expect(field).not.toHaveAccessibleDescription(expect.stringContaining("node_modules"));
    const releases = screen.getByRole("link", { name: "Pyodide's releases" });
    expect(releases).toHaveAttribute("href", `https://github.com/pyodide/pyodide/releases/tag/${PYODIDE_VERSION}`);
  });
});
