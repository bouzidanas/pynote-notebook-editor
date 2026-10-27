import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { NotebookDocument } from "../../src/lib/formats/document";
import { parsePynote, serializePynote } from "../../src/lib/formats/pynote";

// docs/formats/pynote.md is the specification other tools implement, so what
// it says the writer does must be what the writer does. The escapes are the
// easiest part to lose: a tool that decodes "\u003c" while editing the page
// writes "<", and the rule then reads as "< is written as <".

const spec = readFileSync(resolve(__dirname, "../../docs/formats/pynote.md"), "utf8");

const withPlaceholder = (placeholder: string): NotebookDocument => ({
  metadata: {},
  cells: [{ id: "c1", type: "code", source: "1", metadata: { pynote: { placeholder } } }],
});

// The JSON text of the placeholder attribute, quotes included.
const placeholderAttribute = (placeholder: string): string => /placeholder=("(?:[^"\\]|\\.)*")/.exec(serializePynote(withPlaceholder(placeholder)))![1];

const escapesIn = (text: string) => new Set([...text.matchAll(/\\u([0-9a-f]{4})/g)].map((match) => match[1]));

describe("docs/formats/pynote.md", () => {
  it("gives its example file exactly as the writer writes that notebook", () => {
    const section = spec.slice(spec.indexOf("## Example"));
    const example = /^````markdown\n([\s\S]*?)^````$/m.exec(section)![1];
    const parsed = parsePynote(example);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.warnings).toEqual([]);
    expect(serializePynote(parsed.value)).toBe(example);
  });

  it("gives its attribute block example exactly as the writer writes it", () => {
    const text = serializePynote({
      metadata: {},
      cells: [{ id: "c90a5b13", type: "code", source: "1", metadata: { tags: ["parameters"], pynote: { codeview: { showCode: false }, autorun: false } } }],
    });
    expect(spec).toContain(`\`${/\{#c90a5b13[^\n]*\}/.exec(text)![0]}\``);
  });

  it("names exactly the characters the writer escapes in attribute values", () => {
    // Every BMP character JSON writes as itself (no control characters, quote,
    // backslash or surrogates): any \u escape in the attribute is PyNote's own.
    let all = "";
    for (let code = 0x20; code <= 0xffff; code++) {
      if (code === 0x22 || code === 0x5c || (code >= 0xd800 && code <= 0xdfff)) continue;
      all += String.fromCharCode(code);
    }
    const written = escapesIn(placeholderAttribute(all));
    // The rule names each escape on its own, as `\uXXXX`.
    const documented = new Set([...spec.matchAll(/`\\u([0-9a-f]{4})`/g)].map((match) => match[1]));
    expect([...documented].sort()).toEqual([...written].sort());
  });

  it("gives its example of an escaped attribute exactly as the writer writes it", () => {
    expect(spec).toContain(`\`placeholder=${placeholderAttribute("<b> & -->")}\``);
  });

  it("shows the trailer exactly as the writer writes it", () => {
    const doc: NotebookDocument = {
      metadata: { PyNote: { history: ["a|1|code|7b2e10d4"] } },
      cells: [
        { id: "1f3a9c2e", type: "markdown", source: "![plot](attachment:plot.png)", metadata: {}, attachments: { "plot.png": { "image/png": "iVBORw0K..." } } },
      ],
    };
    const text = serializePynote(doc);
    expect(spec).toContain(`\`\`\`markdown\n${text.slice(text.indexOf("<!-- pynote"))}\`\`\`\n`);
  });

  it("says which characters the trailer escapes", () => {
    const text = serializePynote({ metadata: { PyNote: { history: ["<b> & --> \u2028 \u2029"] } }, cells: [] });
    expect([...escapesIn(text.slice(text.indexOf("<!-- pynote")))].sort()).toEqual(["0026", "003c", "003e"]);
    expect(spec).toContain("`<`, `>` and `&` are escaped as in attribute values");
    expect(spec).toContain("U+2028 and U+2029 are written as they are");
  });
});
