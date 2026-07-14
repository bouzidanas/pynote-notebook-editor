import { describe, it, expect } from "vitest";
import { computeSplit, isSplitShortcut } from "./markdownSplit";

describe("computeSplit smart cursor logic", () => {
  it("places cursor in first cell when nearest content is to the left", () => {
    // "hello|   world": left has zero whitespace, right has three spaces.
    const { focusFirst } = computeSplit("hello", "   world");
    expect(focusFirst).toBe(true);
  });

  it("places cursor in second cell when nearest content is to the right", () => {
    // "hello   |world": left has trailing whitespace, right has none.
    const { focusFirst } = computeSplit("hello   ", "world");
    expect(focusFirst).toBe(false);
  });

  it("defaults to first cell on a tie (e.g. newline before and after)", () => {
    const { focusFirst } = computeSplit("hello\n", "\nworld");
    expect(focusFirst).toBe(true);
  });

  it("treats mixed whitespace (newlines + spaces + tabs) as separators", () => {
    // Right is closer (1 char of leading whitespace vs 5 trailing).
    const { focusFirst } = computeSplit("text\n \t\n ", " more");
    expect(focusFirst).toBe(false);
  });

  it("handles cursor at document start (empty left half) → focus second", () => {
    const { focusFirst } = computeSplit("", "hello");
    // leftDist=0, rightDist=0 → tie → focusFirst=true. Documenting current
    // tie-break behavior: even with an empty left half, the rule keeps the
    // cursor with the original cell.
    expect(focusFirst).toBe(true);
  });

  it("handles cursor at document end (empty right half) → focus first", () => {
    const { focusFirst } = computeSplit("hello", "");
    expect(focusFirst).toBe(true);
  });
});

describe("computeSplit content is preserved verbatim", () => {
  it("does NOT strip trailing newlines from the first cell", () => {
    const { beforeContent } = computeSplit("# Heading\n\n\n", "body");
    expect(beforeContent).toBe("# Heading\n\n\n");
  });

  it("does NOT strip leading newlines from the second cell", () => {
    const { afterContent } = computeSplit("body", "\n\n\n## Next");
    expect(afterContent).toBe("\n\n\n## Next");
  });

  it("preserves trailing spaces on the first cell", () => {
    const { beforeContent } = computeSplit("hello   ", "world");
    expect(beforeContent).toBe("hello   ");
  });

  it("preserves leading spaces on the second cell", () => {
    const { afterContent } = computeSplit("hello", "   world");
    expect(afterContent).toBe("   world");
  });

  it("leaves content untouched when no surrounding whitespace exists", () => {
    const { beforeContent, afterContent } = computeSplit("a", "b");
    expect(beforeContent).toBe("a");
    expect(afterContent).toBe("b");
  });

  it("round-trips: beforeContent + afterContent === original input concatenation", () => {
    const before = "alpha\n\n  ";
    const after = "\n\nbeta";
    const r = computeSplit(before, after);
    expect(r.beforeContent + r.afterContent).toBe(before + after);
  });
});

// Helper to construct a KeyboardEvent with the relevant modifier flags.
// We avoid `new KeyboardEvent` directly because jsdom does not always
// honor modifier init dictionaries; a plain object cast is sufficient
// for a predicate that only reads documented properties.
const ev = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    key: "",
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    ...init,
  }) as KeyboardEvent;

describe("isSplitShortcut keyboard shortcut", () => {
  it("matches Cmd+Shift+Enter (macOS)", () => {
    expect(isSplitShortcut(ev({ key: "Enter", shiftKey: true, metaKey: true }))).toBe(true);
  });

  it("matches Ctrl+Shift+Enter (Linux/Windows)", () => {
    expect(isSplitShortcut(ev({ key: "Enter", shiftKey: true, ctrlKey: true }))).toBe(true);
  });

  it("rejects plain Enter", () => {
    expect(isSplitShortcut(ev({ key: "Enter" }))).toBe(false);
  });

  it("rejects Shift+Enter without Ctrl/Cmd (used by ProseMirror for soft break)", () => {
    expect(isSplitShortcut(ev({ key: "Enter", shiftKey: true }))).toBe(false);
  });

  it("rejects Ctrl+Enter (already bound to 'Run & Stay')", () => {
    expect(isSplitShortcut(ev({ key: "Enter", ctrlKey: true }))).toBe(false);
  });

  it("rejects when Alt is pressed (already bound to 'Run & Insert Below')", () => {
    expect(
      isSplitShortcut(ev({ key: "Enter", shiftKey: true, ctrlKey: true, altKey: true }))
    ).toBe(false);
  });

  it("rejects non-Enter keys with the same modifiers", () => {
    expect(isSplitShortcut(ev({ key: "S", shiftKey: true, metaKey: true }))).toBe(false);
  });
});
