import { EditorView } from "@codemirror/view";
import { ensureSyntaxTree, highlightingFor, syntaxTree } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { STATIC_RENDER_HOOK, type StaticCode, type StaticRenderHook } from "../lib/export/web-app-payload";

// What a read-only page offers the static export's renderer (see
// STATIC_RENDER_HOOK): each editor's code, and the lines CodeMirror did not
// draw whole as CodeMirror would draw them. Of a very long line, CodeMirror
// draws only the part in view and a placeholder for the rest, to stay fast;
// here the whole line is highlighted by the editor's own highlighter, so the
// saved page shows every character in the colors the app shows.

// How long to wait for the parser to reach a line (it parses in the
// background, and a long cell may not be parsed yet).
const PARSE_TIMEOUT_MS = 5_000;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Whether CodeMirror drew all of from..to: its visible ranges leave out what
// placeholders stand for.
const drawnWhole = (view: EditorView, from: number, to: number): boolean => {
  let at = from;
  for (const range of view.visibleRanges) {
    if (at >= to) break;
    if (range.to <= at) continue;
    if (range.from > at) return false;
    at = range.to;
  }
  return at >= to;
};

// A line's content as CodeMirror draws it: its text, each token in a span with
// the classes the editor's highlighter gives it.
const lineHtml = (view: EditorView, from: number, to: number): string => {
  const { state } = view;
  const tree = ensureSyntaxTree(state, to, PARSE_TIMEOUT_MS) ?? syntaxTree(state);
  let html = "";
  let at = from;
  highlightTree(
    tree,
    { style: (tags) => highlightingFor(state, tags) },
    (start, end, classes) => {
      start = Math.max(start, at);
      end = Math.min(end, to);
      if (start >= end) return;
      if (start > at) html += escapeHtml(state.sliceDoc(at, start));
      html += `<span class="${escapeHtml(classes)}">${escapeHtml(state.sliceDoc(start, end))}</span>`;
      at = end;
    },
    from,
    to,
  );
  return at < to ? html + escapeHtml(state.sliceDoc(at, to)) : html;
};

const code = (editor: Element): StaticCode | null => {
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) return null;
  const { doc } = view.state;
  const lines: StaticCode["lines"] = [];
  let index = 0;
  for (const element of Array.from(view.contentDOM.children)) {
    if (!element.classList.contains("cm-line")) continue;
    const line = doc.lineAt(view.posAtDOM(element, 0));
    if (!drawnWhole(view, line.from, line.to)) lines.push({ index, html: lineHtml(view, line.from, line.to) });
    index++;
  }
  // Every line is in the page once the drawn part covers the whole document.
  const whole = view.viewport.from === 0 && view.viewport.to === doc.length;
  return { text: whole ? doc.toString() : null, lines };
};

/** Offer the page's code to the static export's renderer. */
export function installStaticRenderHook(): void {
  const hook: StaticRenderHook = { code };
  (window as unknown as Record<string, StaticRenderHook>)[STATIC_RENDER_HOOK] = hook;
}
