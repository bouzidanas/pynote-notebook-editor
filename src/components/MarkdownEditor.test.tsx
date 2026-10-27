// Component tests for the markdown editor toolbar's "Split Cell" feature.
//
// Strategy: stub out Milkdown and ProseMirror so the component renders only
// its surrounding toolbar JSX. We never need a real editor instance to
// verify that:
//   1) The desktop toolbar exposes the Split button between the Table and
//      "More" controls.
//   2) The mobile "More" dropdown lists the Split action.
// Both checks are pure DOM presence assertions.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@solidjs/testing-library";

// --- Mocks ----------------------------------------------------------------
// A chainable no-op Editor that satisfies the fluent API used in
// `MarkdownEditor`'s onMount. Each method returns the same object so any
// `.config().use()...create()` chain resolves to a benign editor stub.
const defaultCreate = () => Promise.resolve({ action: () => {}, destroy: () => {} });
const editorStub: any = {
  config: () => editorStub,
  use: () => editorStub,
  create: defaultCreate,
};
// What the mocked getMarkdown serializes the editor's document to.
const serialized = vi.hoisted(() => ({ markdown: "" }));

vi.mock("@milkdown/kit/core", () => ({
  Editor: { make: () => editorStub },
  rootCtx: {},
  defaultValueCtx: {},
  editorViewCtx: {},
  schemaCtx: {},
  remarkStringifyOptionsCtx: {},
}));
vi.mock("@milkdown/kit/preset/commonmark", () => ({
  commonmark: {},
  toggleStrongCommand: { key: "toggleStrong" },
  toggleEmphasisCommand: { key: "toggleEmphasis" },
  wrapInHeadingCommand: { key: "wrapInHeading" },
  toggleLinkCommand: { key: "toggleLink" },
  wrapInBulletListCommand: { key: "wrapInBulletList" },
  wrapInOrderedListCommand: { key: "wrapInOrderedList" },
  toggleInlineCodeCommand: { key: "toggleInlineCode" },
  createCodeBlockCommand: { key: "createCodeBlock" },
  insertImageCommand: { key: "insertImage" },
}));
vi.mock("@milkdown/kit/preset/gfm", () => ({
  gfm: {},
  insertTableCommand: { key: "insertTable" },
  addRowBeforeCommand: { key: "addRowBefore" },
  addRowAfterCommand: { key: "addRowAfter" },
  addColBeforeCommand: { key: "addColBefore" },
  addColAfterCommand: { key: "addColAfter" },
  deleteSelectedCellsCommand: { key: "deleteSelectedCells" },
}));
vi.mock("@milkdown/theme-nord", () => ({ nord: () => {} }));
vi.mock("@milkdown/kit/plugin/listener", () => ({
  listener: {},
  listenerCtx: {},
}));
vi.mock("@milkdown/kit/plugin/history", () => ({ history: {} }));
vi.mock("@milkdown/kit/plugin/clipboard", () => ({ clipboard: {} }));
vi.mock("@milkdown/kit/utils", () => ({
  callCommand: () => () => {},
  getMarkdown: () => () => serialized.markdown,
  replaceAll: () => () => {},
  $prose: () => ({}),
}));
vi.mock("@milkdown/kit/prose/state", () => ({
  TextSelection: { atEnd: () => ({}), atStart: () => ({}), near: () => ({}), fromJSON: () => ({}) },
  Plugin: class {},
  PluginKey: class {},
}));
vi.mock("@milkdown/kit/prose/commands", () => ({
  lift: () => {},
  wrapIn: () => () => {},
  setBlockType: () => () => {},
  toggleMark: () => () => {},
}));
vi.mock("@milkdown/kit/prose/history", () => ({ undo: () => {}, redo: () => {} }));
vi.mock("prosemirror-history", () => ({ undoDepth: () => 0, redoDepth: () => 0 }));
vi.mock("../lib/sectionScopePlugin", () => ({ sectionScopePlugin: {} }));
vi.mock("../lib/codeBlockNavigationPlugin", () => ({ codeBlockNavigationPlugin: {} }));
vi.mock("../lib/captionPlugin", () => ({
  captionMark: {},
  toggleCaptionCommand: { key: "toggleCaption" },
}));
vi.mock("../lib/videoEmbedPlugin", () => ({ videoEmbed: {} }));
vi.mock("../lib/markdownSyntax", () => ({ markdownSyntax: (editor: unknown) => editor }));
// The cell gets back its own text for an untouched document, and otherwise
// what the mocked getMarkdown serializes (the real write-back, which keeps
// untouched blocks, is tested with Milkdown in MarkdownEditor.roundtrip.test.ts).
vi.mock("../lib/markdownWriteBack", () => ({
  cellWriteBack: (text: string) => (ctx: { get: (key: unknown) => any }) => {
    const opened = ctx.get(editorViewCtx).state.doc;
    return (doc: { eq: (other: unknown) => boolean }) => (doc.eq(opened) ? text : serialized.markdown);
  },
}));

// Imports MUST come after vi.mock calls (vitest hoists the mocks anyway,
// but keeping the order explicit matches the dependency order).
import MarkdownEditor from "./MarkdownEditor";
import { editorViewCtx } from "@milkdown/kit/core";
import { actions, defaultCells, flushAllEditors, type CellData } from "../lib/store";

const fakeCell = (overrides: Partial<CellData> = {}): CellData => ({
  id: "test-cell-1",
  type: "markdown",
  content: "hello world",
  isEditing: true,
  ...overrides,
});

beforeEach(() => {
  // Reset the global notebook store so insertMarkdownCell side-effects in
  // one test don't leak into the next.
  actions.loadNotebook(structuredClone(defaultCells), "test.ipynb", [], -1, null);
});

const renderToolbar = (cell: CellData = fakeCell()) =>
  render(() => (
    <MarkdownEditor
      value={cell.content}
      onChange={() => {}}
      cell={cell}
      showToolbar={() => true}
    />
  ));

describe("MarkdownEditor toolbar Split Cell button", () => {
  it("renders the Split Cell button in the desktop toolbar", () => {
    renderToolbar();
    // Desktop button uses the title prefix "Split Cell at Cursor (...)".
    const matches = screen.getAllByTitle(/Split Cell at Cursor/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("places the Split button after the Table dropdown and before the More dropdown", () => {
    const { container } = renderToolbar();

    // Restrict to the desktop toolbar section (hidden on small viewports).
    const desktopRow = container.querySelector(".hidden.sm\\:flex");
    expect(desktopRow).not.toBeNull();

    const titledControls = Array.from(
      desktopRow!.querySelectorAll<HTMLElement>("[title]")
    ).map((el) => el.getAttribute("title") || "");

    const tableIdx = titledControls.findIndex((t) => /^Table Options$/i.test(t));
    const splitIdx = titledControls.findIndex((t) => /^Split Cell at Cursor/i.test(t));
    const moreIdx = titledControls.findIndex((t) => /^More Formatting$/i.test(t));

    expect(tableIdx).toBeGreaterThanOrEqual(0);
    expect(splitIdx).toBeGreaterThan(tableIdx);
    expect(moreIdx).toBeGreaterThan(splitIdx);
  });

  it("includes a Split Cell entry inside the mobile More menu", () => {
    const { container } = renderToolbar();
    // The mobile menu lives inside the `flex sm:hidden` wrapper. The
    // dropdown is collapsed by default; click its trigger to reveal items.
    const mobileWrapper = container.querySelector(".flex.sm\\:hidden");
    expect(mobileWrapper).not.toBeNull();
    const trigger = mobileWrapper!.querySelector('button[title="More Formatting"]');
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger as Element);

    // Mobile uses the shorter "Split Cell" label (the desktop button keeps
    // the longer "Split Cell at Cursor (...)" title for keyboard hint).
    expect(screen.getByText(/^\s*Split Cell\s*$/i)).toBeInTheDocument();
  });
});

describe("MarkdownEditor toolbar dropdowns are not clipped by the cell", () => {
  // Regression guard for the mobile More dropdown bug: a toolbar dropdown
  // that portals into <body> escapes the host cell's stacking context and
  // gets painted under sibling cells (CellWrapper assigns each cell
  // `z-index: 100000 - cellIndex`). Keeping every formatting-toolbar
  // dropdown in-flow is what makes the simple `z-50` on the menu actually
  // win against surrounding cell content.
  //
  // The test opens every dropdown trigger in the toolbar and asserts the
  // resulting menu is a descendant of the toolbar root rather than a
  // sibling of <body>.
  const dropdownTriggerTitles = [
    "Heading Options",
    "More Formatting", // mobile
    "Table Options", // desktop
    "More Formatting", // desktop (second instance)
  ];

  it("renders every toolbar dropdown menu inside the toolbar (no portals)", () => {
    const { container, baseElement } = renderToolbar();

    const triggers = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[title]")
    ).filter((b) => dropdownTriggerTitles.includes(b.getAttribute("title") || ""));
    expect(triggers.length).toBeGreaterThan(0);

    for (const trigger of triggers) {
      fireEvent.click(trigger);

      // role=menu nodes that appeared after this click. We accept either
      // the menu inside the container OR none yet (some triggers may need
      // a second click). What we DO NOT accept is a menu that lives
      // outside `container`, that means it was portaled and would be
      // covered by sibling cells in the running app.
      const portaledMenus = Array.from(
        baseElement.querySelectorAll<HTMLElement>('[role="menu"]')
      ).filter((m) => !container.contains(m));

      expect(
        portaledMenus,
        `dropdown "${trigger.getAttribute("title")}" portaled outside the cell, it will be hidden behind sibling cells`
      ).toHaveLength(0);

      // Close before opening the next one.
      fireEvent.click(trigger);
    }
  });
});

describe("MarkdownEditor reports changes to the cell", () => {
  // Stand-ins for ProseMirror documents: equal when they have the same name.
  const doc = (name: string) => ({ name, eq: (other: { name: string }) => other.name === name });

  // A created editor whose document the test sets; `action` runs with a ctx
  // that hands out its view.
  const createdEditor = () => {
    const view = {
      state: { doc: doc("opened"), selection: { toJSON: () => ({}) } },
      focus: () => {},
      dispatch: () => {},
      hasFocus: () => false,
    };
    const ctx = { get: (key: unknown) => (key === editorViewCtx ? view : undefined) };
    return { view, editor: { action: vi.fn((fn: (c: unknown) => unknown) => fn(ctx)), destroy: vi.fn(async () => {}) } };
  };

  const renderEditor = (onChange: (value: string) => void) =>
    render(() => (
      <MarkdownEditor value={"$x_i$ and\n* a\n* b"} onChange={onChange} cell={fakeCell({ content: "$x_i$ and\n* a\n* b" })} />
    ));

  afterEach(() => {
    editorStub.create = defaultCreate;
  });

  it("leaves an untouched cell alone, whatever Milkdown would write for it", async () => {
    const { view, editor } = createdEditor();
    editorStub.create = () => Promise.resolve(editor);
    const onChange = vi.fn();
    renderEditor(onChange);
    await Promise.resolve();
    await Promise.resolve();

    // Milkdown's own serialization of the same document differs from the
    // source (escaped underscore, loose list, final newline).
    serialized.markdown = "$x\\_i$ and\n\n* a\n\n* b\n";
    flushAllEditors();
    expect(onChange).not.toHaveBeenCalled();

    // A real change is reported once...
    view.state.doc = doc("edited");
    serialized.markdown = "$x\\_i$ and more\n";
    flushAllEditors();
    flushAllEditors();
    expect(onChange.mock.calls).toEqual([["$x\\_i$ and more\n"]]);

    // ...and changing the document back restores the original text.
    view.state.doc = doc("opened");
    flushAllEditors();
    expect(onChange.mock.calls).toEqual([["$x\\_i$ and more\n"], ["$x_i$ and\n* a\n* b"]]);
  });

  it("destroys an editor that finishes loading after edit mode ended, without registering it", async () => {
    const { editor } = createdEditor();
    let finishCreate!: (value: typeof editor) => void;
    editorStub.create = () => new Promise((resolve) => (finishCreate = resolve));
    const onChange = vi.fn();
    renderEditor(onChange);
    cleanup(); // edit mode ends before Milkdown is ready

    finishCreate(editor);
    await Promise.resolve();
    await Promise.resolve();
    expect(editor.destroy).toHaveBeenCalledTimes(1);
    expect(editor.action).not.toHaveBeenCalled();
    serialized.markdown = "stale text\n";
    flushAllEditors();
    expect(onChange).not.toHaveBeenCalled();
  });
});
