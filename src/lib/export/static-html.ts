// Static web app export: the read-only export rendered once, then saved as
// plain HTML and CSS that needs no JavaScript to show (a "flat" page).
//
// The page is rendered by the real runtime in a hidden iframe, so it is
// exactly what the read-only export shows; flattenDocument then turns the
// live DOM into markup. Code editors draw every line first (CodeMirror keeps
// only what is in view in the DOM, see drawEveryLine), the parts of very long
// lines CodeMirror leaves out come from the page's own editors (see
// STATIC_RENDER_HOOK), and live state that markup does not carry is written
// back: form control values, canvas pixels (uPlot charts) and constructable
// stylesheets (CodeMirror's styles).

import { TESTID } from "../testids";
import { STATIC_RENDER_HOOK, type StaticRenderHook } from "./web-app-payload";

const SETTLE_QUIET_MS = 300;
const SETTLE_TIMEOUT_MS = 15_000;
const RENDER_WIDTH = 1280;

// Marks what the renderer adds to the page for its own use; the saved page
// leaves it out.
export const RENDER_ONLY_ATTRIBUTE = "data-pynote-render-only";

// A code line's text as the editor shows it: widgets (CodeMirror marks them
// contenteditable=false: placeholders, an empty editor's hint) are not code.
const codeLineText = (line: Element): string => {
  let text = "";
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) text += child.textContent ?? "";
      else if (child.nodeType === 1 && (child as Element).getAttribute("contenteditable") !== "false") visit(child);
    }
  };
  visit(line);
  return text;
};

/**
 * Every code editor's lines in full. Lines CodeMirror did not draw whole come
 * from `code` (the page's own editors), and the code each editor then shows
 * must be its code: a page that would save code cut short fails instead.
 */
function completeCode(live: Element, clone: Element, code: StaticRenderHook) {
  const cloneEditors = clone.querySelectorAll(".cm-editor");
  live.querySelectorAll(".cm-editor").forEach((editor, i) => {
    const source = code.code(editor);
    const target = cloneEditors[i];
    if (!source || !target) return;
    const lines = Array.from(target.querySelectorAll(".cm-content > .cm-line"));
    for (const { index, html } of source.lines) {
      if (lines[index]) lines[index].innerHTML = html;
    }
    if (source.text !== null && lines.map(codeLineText).join("\n") !== source.text) {
      throw new Error("The notebook's code did not render completely.");
    }
  });
}

/**
 * The rendered document as standalone HTML without scripts. `code` gives the
 * code of the page's editors (the runtime's STATIC_RENDER_HOOK).
 */
export function flattenDocument(doc: Document, code?: StaticRenderHook): string {
  const live = doc.documentElement;
  const clone = live.cloneNode(true) as HTMLElement;
  if (code) completeCode(live, clone, code);

  // Form controls: the current value lives in properties, which markup
  // drops. Both lists are in document order, so they pair up.
  const liveControls = live.querySelectorAll("input, textarea, select");
  const cloneControls = clone.querySelectorAll("input, textarea, select");
  liveControls.forEach((element, i) => {
    const target = cloneControls[i];
    if (!target) return;
    if (element.tagName === "INPUT") {
      const input = element as HTMLInputElement;
      if (input.type === "checkbox" || input.type === "radio") target.toggleAttribute("checked", input.checked);
      else if (input.type !== "file" && input.type !== "password") target.setAttribute("value", input.value);
    } else if (element.tagName === "TEXTAREA") {
      target.textContent = (element as HTMLTextAreaElement).value;
    } else {
      const options = (element as HTMLSelectElement).options;
      target.querySelectorAll("option").forEach((option, j) => option.toggleAttribute("selected", !!options[j]?.selected));
    }
  });

  // Canvases become images of what they show.
  const liveCanvases = live.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");
  liveCanvases.forEach((canvas, i) => {
    const target = cloneCanvases[i];
    if (!target) return;
    const image = doc.createElement("img");
    try {
      image.src = canvas.toDataURL("image/png");
    } catch {
      target.remove(); // tainted canvas: nothing we may copy
      return;
    }
    for (const name of ["class", "style", "width", "height"]) {
      const value = canvas.getAttribute(name);
      if (value !== null) image.setAttribute(name, value);
    }
    const box = canvas.getBoundingClientRect();
    if (box.width > 0) image.style.width = `${box.width}px`;
    if (box.height > 0) image.style.height = `${box.height}px`;
    image.alt = "";
    target.replaceWith(image);
  });

  // Stylesheets that exist only in the CSSOM.
  const head = clone.querySelector("head");
  for (const sheet of doc.adoptedStyleSheets ?? []) {
    const style = doc.createElement("style");
    style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
    head?.appendChild(style);
  }

  // No scripts of any kind (the payload and worker blocks included), and
  // nothing the renderer added for itself.
  clone.querySelectorAll(`script, noscript, link[rel=modulepreload], link[rel=preload][as=script], [${RENDER_ONLY_ATTRIBUTE}]`).forEach((element) => element.remove());
  clone.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  });

  return `<!doctype html>\n${clone.outerHTML}\n`;
}

// Resolves once the page has had no DOM changes for SETTLE_QUIET_MS (charts
// and lazy components render asynchronously), or after the timeout.
const settled = (doc: Document): Promise<void> =>
  new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(deadline);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, SETTLE_QUIET_MS);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout(done, SETTLE_QUIET_MS);
    const deadline = setTimeout(done, SETTLE_TIMEOUT_MS);
  });

const nextFrame = (win: Window) => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));

// The promise, or a rejection with the signal's reason once it aborts.
const unlessAborted = <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
};

// Lines CodeMirror has not drawn (out of view) are a .cm-gap block in their
// editor. Editors that are not displayed (hidden code) do not count.
const hasUndrawnLines = (doc: Document) =>
  Array.from(doc.querySelectorAll(".cm-editor")).some((editor) => editor.getClientRects().length > 0 && editor.querySelector(".cm-gap"));

/**
 * Bring every line of every code editor into the DOM. CodeMirror draws only
 * the lines in view, plus a margin (and a theme can cap a code cell's height,
 * the rest scrolling inside it), so a long cell, or one below the first
 * screen, would be saved cut off. For the render, editors lose any height cap
 * and the frame grows to the page's full height: every line is then in view,
 * and CodeMirror draws it. Lifting the cap is a render-only rule, so the saved
 * page keeps the theme's box, with the rest of a long cell scrolling inside.
 */
async function drawEveryLine(iframe: HTMLIFrameElement, doc: Document, win: Window, signal: AbortSignal | undefined): Promise<void> {
  const unlimited = doc.createElement("style");
  unlimited.setAttribute(RENDER_ONLY_ATTRIBUTE, "");
  unlimited.textContent = ".cm-editor { max-height: none !important; }";
  doc.head.appendChild(unlimited);
  const start = performance.now();
  for (;;) {
    const height = doc.documentElement.scrollHeight;
    if (height > iframe.clientHeight) iframe.style.height = `${height}px`;
    else if (!hasUndrawnLines(doc)) return;
    if (performance.now() - start > SETTLE_TIMEOUT_MS) throw new Error("The notebook's code did not finish rendering.");
    await nextFrame(win);
    signal?.throwIfAborted();
  }
}

/**
 * Render a read-only export page (single-file HTML) in a hidden iframe and
 * return its flattened HTML. `cellCount` is how many cells the notebook has;
 * rendering fails if they do not all appear. Aborting the signal stops the
 * render (the promise rejects with its reason).
 */
export async function renderStaticHtml(readOnlyHtml: string, cellCount: number, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  // In the viewport (so layout and fonts behave as on screen) but invisible.
  Object.assign(iframe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${RENDER_WIDTH}px`,
    height: "900px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
  const loaded = new Promise<void>((resolve) => iframe.addEventListener("load", () => resolve(), { once: true }));
  iframe.srcdoc = readOnlyHtml;
  document.body.appendChild(iframe);
  try {
    await unlessAborted(loaded, signal);
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) throw new Error("Could not render the notebook.");
    const start = performance.now();
    while (doc.querySelectorAll(`[data-testid="${TESTID.cell}"]`).length < cellCount) {
      if (performance.now() - start > SETTLE_TIMEOUT_MS) throw new Error("The notebook did not finish rendering.");
      await nextFrame(win);
      signal?.throwIfAborted();
    }
    await unlessAborted(doc.fonts.ready, signal);
    await drawEveryLine(iframe, doc, win, signal);
    await unlessAborted(settled(doc), signal);
    await nextFrame(win);
    signal?.throwIfAborted();
    const code = (win as unknown as Record<string, StaticRenderHook | undefined>)[STATIC_RENDER_HOOK];
    if (!code) throw new Error("Could not render the notebook's code.");
    return flattenDocument(doc, code);
  } finally {
    iframe.remove();
  }
}
