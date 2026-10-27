import { describe, expect, test } from "vitest";
import { RENDER_ONLY_ATTRIBUTE, flattenDocument } from "./static-html";

// flattenDocument on documents built in jsdom. Canvases and real rendering are
// covered by the export browser suite (e2e/export/), in all three engines.

const page = (body: string, head = "") => {
  const doc = document.implementation.createHTMLDocument("Flatten test");
  doc.head.insertAdjacentHTML("beforeend", head);
  doc.body.innerHTML = body;
  return doc;
};

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("flattenDocument", () => {
  test("writes live form state into the markup", () => {
    const doc = page(`
      <input id="range" type="range" min="0" max="100">
      <input id="text" type="text">
      <input id="box" type="checkbox" checked>
      <input id="other" type="checkbox">
      <textarea id="area"></textarea>
      <select id="pick"><option>a</option><option>b</option></select>`);
    (doc.getElementById("range") as HTMLInputElement).value = "64";
    (doc.getElementById("text") as HTMLInputElement).value = "typed";
    (doc.getElementById("box") as HTMLInputElement).checked = false;
    (doc.getElementById("other") as HTMLInputElement).checked = true;
    (doc.getElementById("area") as HTMLTextAreaElement).value = "long text";
    (doc.getElementById("pick") as HTMLSelectElement).selectedIndex = 1;

    const out = parse(flattenDocument(doc));
    expect(out.getElementById("range")?.getAttribute("value")).toBe("64");
    expect(out.getElementById("text")?.getAttribute("value")).toBe("typed");
    expect(out.getElementById("box")?.hasAttribute("checked")).toBe(false);
    expect(out.getElementById("other")?.hasAttribute("checked")).toBe(true);
    expect(out.getElementById("area")?.textContent).toBe("long text");
    const options = out.querySelectorAll("#pick option");
    expect([options[0].hasAttribute("selected"), options[1].hasAttribute("selected")]).toEqual([false, true]);
  });

  test("removes every script, inline handler and preload of scripts", () => {
    const doc = page(
      `<div id="root" onclick="alert(1)"><p onmouseover="x()">text</p></div>
       <noscript>needs JS</noscript>
       <script type="application/json" id="pynote-export">{"a":1}</script>
       <script>window.ran = true</script>`,
      `<script src="pynote.js"></script><link rel="modulepreload" href="x.js"><style>p{color:red}</style>`,
    );
    const html = flattenDocument(doc);
    const out = parse(html);
    expect(out.querySelectorAll("script, noscript, link[rel=modulepreload]")).toHaveLength(0);
    expect(out.getElementById("root")?.hasAttribute("onclick")).toBe(false);
    expect(out.querySelector("p")?.hasAttribute("onmouseover")).toBe(false);
    expect(out.querySelector("style")?.textContent).toBe("p{color:red}");
    expect(html.startsWith("<!doctype html>\n<html")).toBe(true);
  });

  test("leaves out what the renderer added for its own use", () => {
    const doc = page(`<p>text</p>`, `<style ${RENDER_ONLY_ATTRIBUTE}>.cm-editor{max-height:none!important}</style><style>p{color:red}</style>`);
    const out = parse(flattenDocument(doc));
    expect(Array.from(out.querySelectorAll("style"), (style) => style.textContent)).toEqual(["p{color:red}"]);
  });

  test("leaves the rendered document itself untouched", () => {
    const doc = page(`<input id="range" type="range"><script>1</script>`);
    (doc.getElementById("range") as HTMLInputElement).value = "10";
    flattenDocument(doc);
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    expect(doc.getElementById("range")?.hasAttribute("value")).toBe(false);
  });

  test("keeps inert regions inert (read-only components)", () => {
    const doc = page(`<div inert style="display: contents"><input type="range" value="3"></div>`);
    const out = parse(flattenDocument(doc));
    expect(out.querySelector("div")?.hasAttribute("inert")).toBe(true);
  });
});

describe("flattenDocument and code", () => {
  // Two editors as CodeMirror draws them: the first line whole; of the long
  // second line, its start and a placeholder widget for the rest; an empty
  // editor shows its placeholder text, which is not code.
  const editors = () =>
    page(`
      <div class="cm-editor"><div class="cm-scroller"><div class="cm-content">` +
      `<div class="cm-line"><span class="k">x</span> = 1</div>` +
      `<div class="cm-line"><span class="k">data</span> = [1, 2<img class="cm-widgetBuffer"><div contenteditable="false" style="width: 99999px; height: 2px; display: inline-block"></div><img class="cm-widgetBuffer"></div>` +
      `</div></div></div>
      <div class="cm-editor"><div class="cm-scroller"><div class="cm-content">` +
      `<div class="cm-line"><span class="cm-placeholder" contenteditable="false">Enter Python code...</span><br></div>` +
      `</div></div></div>`);
  const longLine = '<span class="k">data</span> = [1, 2, 3]  <span class="c"># END</span>';
  const pageCode = (lines: Array<{ index: number; html: string }>) => ({
    code: (editor: Element) =>
      editor.parentElement?.firstElementChild === editor
        ? { text: "x = 1\ndata = [1, 2, 3]  # END", lines }
        : { text: "", lines: [] },
  });

  test("writes lines CodeMirror did not draw whole in full, as the page highlights them", () => {
    const out = parse(flattenDocument(editors(), pageCode([{ index: 1, html: longLine }])));
    const lines = out.querySelectorAll(".cm-editor")[0].querySelectorAll(".cm-line");
    expect(lines[0].innerHTML).toBe('<span class="k">x</span> = 1');
    expect(lines[1].innerHTML).toBe(longLine);
    expect(out.querySelectorAll(".cm-editor")[1].textContent).toBe("Enter Python code...");
  });

  test("fails rather than save code cut short", () => {
    expect(() => flattenDocument(editors(), pageCode([]))).toThrow("did not render completely");
  });

  test("checks only code CodeMirror drew whole", () => {
    const hidden = { code: () => ({ text: null, lines: [] }) };
    expect(() => flattenDocument(editors(), hidden)).not.toThrow();
  });
});
