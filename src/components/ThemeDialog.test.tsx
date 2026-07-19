// Component tests for the Theme dialog's behavioural features (as opposed to
// the per-input → CSS-variable mapping, which is covered by theme-vars.test.ts).
//
// Verified here:
//   1) The App / Session scope toggle, and that Save reports the chosen scope.
//   2) The two header reset buttons (Undo changes, Reset to app defaults).
//   3) The "Save settings to .ipynb" (saveToExport) checkbox is persisted on Save.
//   4) A representative input (markdown border Color) is wired to updateTheme.
//
// Heavy children are stubbed so the component renders only its own JSX.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@solidjs/testing-library";

vi.mock("../lib/syntax-highlighter", () => ({
  highlightPython: (code: string) => code,
}));
vi.mock("./ui/ComboBox", () => ({ default: () => null }));

import ThemeDialog from "./ThemeDialog";
import { currentTheme, updateTheme, defaultTheme } from "../lib/theme";

afterEach(() => {
  cleanup();
  // Reset the shared theme store so tests stay independent.
  updateTheme(defaultTheme);
});

describe("scope toggle (session vs app-wide)", () => {
  it("defaults to session-only and reports it on Save", () => {
    const onSave = vi.fn();
    render(() => <ThemeDialog onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // onSave receives `applyToSession`; session-only is the default.
    expect(onSave).toHaveBeenCalledWith(true);
  });

  it("reports app-wide after toggling the scope", () => {
    const onSave = vi.fn();
    render(() => <ThemeDialog onClose={() => {}} onSave={onSave} />);

    // Clicking either label flips the toggle (session-only -> app-wide).
    fireEvent.click(screen.getByText("App"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(false);
  });

  it("honours the initialScope prop", () => {
    const onSave = vi.fn();
    render(() => <ThemeDialog onClose={() => {}} onSave={onSave} initialScope="app-wide" />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(false);
  });
});

describe("reset buttons", () => {
  it("Undo restores the theme captured when the dialog opened", () => {
    updateTheme({ colors: { accent: "#0a0a0a" } });
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    // Simulate the user editing a value inside the dialog.
    updateTheme({ colors: { accent: "#ffffff" } });
    expect(currentTheme.colors.accent).toBe("#ffffff");

    fireEvent.click(screen.getByTitle("Undo Changes (Reset to initial state)"));
    expect(currentTheme.colors.accent).toBe("#0a0a0a");
  });

  it("Reset to App Defaults restores the default theme", () => {
    updateTheme({ colors: { accent: "#abcdef" } });
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    fireEvent.click(screen.getByTitle("Reset to App Defaults"));
    expect(currentTheme.colors.accent).toBe(defaultTheme.colors.accent);
  });
});

describe("save to .ipynb toggle", () => {
  beforeEach(() => {
    updateTheme({ saveToExport: false });
  });

  it("persists saveToExport=true through Save", () => {
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    fireEvent.click(screen.getByText("Save settings to .ipynb"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(currentTheme.saveToExport).toBe(true);
  });

  it("leaves saveToExport=false when the box is untouched", () => {
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(currentTheme.saveToExport).toBe(false);
  });
});

describe("input wiring", () => {
  it("the markdown border Color input updates the theme store", () => {
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    // The markdown border Color field is a ColorInput (swatch + picker). Its
    // text field has no placeholder, so target it via the "Color" label; the
    // markdown section's Color is the first such label in DOM order.
    const colorLabel = screen.getAllByText("Color", {
      selector: "label",
    })[0];
    const input = colorLabel.parentElement!.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "#abc123" } });
    expect(currentTheme.mdBorder.color).toBe("#abc123");
  });

  it("the markdown border Border and Divider inputs update the theme store", () => {
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    const [borderInput, dividerInput] = screen.getAllByPlaceholderText(
      "2px"
    ) as HTMLInputElement[];
    fireEvent.input(borderInput, { target: { value: "3px dashed #fff" } });
    fireEvent.input(dividerInput, { target: { value: "1px" } });
    expect(currentTheme.mdBorder.border).toBe("3px dashed #fff");
    expect(currentTheme.mdBorder.divider).toBe("1px");
  });

  it("the markdown Shadow input updates the theme store", () => {
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    const input = screen.getByPlaceholderText("none") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "0 2px 8px #000" } });
    expect(currentTheme.mdShadow).toBe("0 2px 8px #000");
  });

  it("the code cell Background inputs pass any CSS value through verbatim", () => {
    render(() => <ThemeDialog onClose={() => {}} onSave={() => {}} />);

    // The Advanced sections start collapsed; expand Code Cell first.
    fireEvent.click(screen.getByText("Advanced — Code Cell"));

    const outer = screen.getByPlaceholderText("transparent") as HTMLInputElement;
    const value = "url('/bg.png') center / cover no-repeat, linear-gradient(#111, #222)";
    fireEvent.input(outer, { target: { value } });
    // Free-text mode: stored and displayed with no color parsing or reformatting.
    expect(currentTheme.codeBlock.outerBackground).toBe(value);
    expect(outer.value).toBe(value);
  });
});
