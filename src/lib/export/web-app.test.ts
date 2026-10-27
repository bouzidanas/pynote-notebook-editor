// @vitest-environment node
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import type { NotebookDocument } from "../formats/document";
import { type WebAppInput, assembleWebApp, inlineScriptText, readerDocument } from "./web-app";
import { WEB_APP_PAYLOAD_VERSION, type WebAppPayload } from "./web-app-payload";

// assembleWebApp and readerDocument on their own. Real exports, opened in
// browsers, are covered by the export suite (e2e/export/).

const document: NotebookDocument = {
  metadata: {
    kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
    PyNote: {
      executionMode: "reactive",
      // The author deleted a cell holding a key, then rewrote another one.
      history: ['d|1|code|secret|API_KEY = "sk-live-0042"', "u|intro|# Draft title|# Title"],
      theme: { outputLayout: "below" },
    },
  },
  cells: [{ id: "intro", type: "markdown", source: "# Title", metadata: {} }],
};

describe("readerDocument", () => {
  it("leaves the author's undo history behind and keeps everything else", () => {
    const reader = readerDocument(document);
    expect(JSON.stringify(reader)).not.toContain("sk-live-0042");
    expect(JSON.stringify(reader)).not.toContain("Draft title");
    expect(reader.metadata.PyNote).toEqual({ executionMode: "reactive", history: [], theme: { outputLayout: "below" } });
    expect(reader.metadata.kernelspec).toEqual(document.metadata.kernelspec);
    expect(reader.cells).toEqual(document.cells);
  });

  it("does not change the notebook being edited", () => {
    readerDocument(document);
    expect((document.metadata.PyNote as { history: string[] }).history).toHaveLength(2);
  });

  it("passes a notebook without PyNote settings through", () => {
    const plain: NotebookDocument = { metadata: {}, cells: [] };
    expect(readerDocument(plain)).toBe(plain);
  });
});

describe("inlineScriptText", () => {
  // Code of the kinds the runtime holds, each evaluating to what it means.
  // The libraries in it compile regular expressions from strings and from
  // other expressions' sources, some with the u or v flag (highlight.js does
  // for its HTML grammar, whose comment rule is /<!--/).
  const snippets = [
    `"<!-- a comment -->" + '</script>' + "</SCRIPT >" + "<!---->"`,
    "`<!-- cell ${1 + 1} -->` + `</script>`",
    `[/<!--/.test("x <!-- y"), /<\\/script/i.test("</Script>"), /^<!-- cell(?:[ \\t]+(.*?))?[ \\t]*-->$/.exec("<!-- cell a -->")[1]]`,
    `[new RegExp(/<!--/.source, "u").test("<!--"), new RegExp(/<!--/.source, "v").test("<!--"), new RegExp("(" + /<\\/script/.source + ")", "iu").test("</script")]`,
    `[/[<!-]/u.test("<"), /\\<!--/.test("<!--"), "\\<!--", "\\\\</script>", "\\\\\\</script>"]`,
    "/* <!-- in a comment --> */ 1",
  ];

  it.each(snippets)("keeps the meaning of %s", (code) => {
    expect(runInNewContext(inlineScriptText(code))).toEqual(runInNewContext(code));
  });

  it("leaves no sequence that would end the script element or comment it out", () => {
    for (const code of snippets) {
      const inlined = inlineScriptText(code);
      expect(inlined).not.toMatch(/<\/script/i);
      expect(inlined).not.toContain("<!--");
    }
  });
});

describe("the folder export's README", () => {
  const input = (payload: Partial<WebAppPayload>): WebAppInput => ({
    runtime: { appJs: "/* app */", appCss: "", workerJs: "/* worker */" },
    payload: {
      pynoteExport: WEB_APP_PAYLOAD_VERSION,
      exportId: "test",
      filename: "Report.ipynb",
      mode: "interactive",
      startInPresentation: false,
      document,
      theme: {},
      codeVisibility: {},
      ...payload,
    },
    fonts: { families: new Set(), text: "", math: false },
    layout: "folder",
    title: "Report",
    colors: { background: "#1e1e2e", text: "#cdd6f4" },
  });
  const readme = async (payload: Partial<WebAppPayload>) => (await assembleWebApp(input(payload))).get("README.txt")!;

  it("says a read-only page needs no Python", async () => {
    const text = await readme({ mode: "readonly" });
    expect(text).toContain("Nothing runs");
    expect(text).not.toContain("CDN");
  });

  it("says where an interactive page gets Python", async () => {
    expect(await readme({ pyodide: { kind: "cdn", indexURL: "https://cdn.example/" } })).toContain("downloaded from the jsDelivr CDN when the page opens");
    expect(await readme({ pyodide: { kind: "embedded", layout: "folder" } })).toContain("Python is included in the pyodide/ folder");
  });
});
