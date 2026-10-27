import { fc } from "@fast-check/vitest";
import type { DocCell, JsonObject, JsonValue, NotebookDocument } from "../../src/lib/formats/document";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../../src/lib/formats/document";

// Generators for notebook documents, weighted toward the input most likely to
// break a text format: delimiters of YAML, Markdown, HTML comments, Python
// cell markers and script tags, odd line endings, BOMs, control characters.
// A property test only explores the inputs it is taught, so every new format
// hazard belongs in this list.

export const HAZARDS = [
  "---", "...", "```", "~~~", "````", "``````", "<!--", "-->", "<!-- cell 1234abcd -->", "+++",
  "# %%", "# %% [markdown]", "#", "#|", ": ", "- ", "? ", "{.cell}", "{#abc}", "```python {#abc}",
  "\t", "\r\n", "\r", "\n", "\n\n", " ", "\u00a0", "\ufeff", "\u0000", "\u2028", "\u2029", "\u0085",
  "no", "on", "~", "null", "true", "0123", "1e3", "'", '"', "'''", '"""', "\\", "$$", "|", "*",
  "%matplotlib inline", "!pip install x", "</script>", "<script>", "]]>", "\u{1F600}", "é",
  "__proto__", "constructor", "toString",
];

const char = fc.string({ unit: "binary", minLength: 1, maxLength: 1 });
const hazard = fc.constantFrom(...HAZARDS);

/** Text that is mostly ordinary characters with format hazards mixed in. */
export const hazardText = (maxLength = 80) =>
  fc.array(fc.oneof({ weight: 5, arbitrary: char }, { weight: 2, arbitrary: hazard }), { maxLength })
    .map((parts) => parts.join(""));

export const cellId = fc.stringMatching(/^[a-zA-Z0-9_-]{1,64}$/);

const jsonLeaf: fc.Arbitrary<JsonValue> = fc.oneof(
  fc.constant(null), fc.boolean(), fc.integer(),
  // -0 is not representable in JSON (it serializes as 0).
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((x) => !Object.is(x, -0)),
  hazardText(16),
);
export const jsonValue: fc.Arbitrary<JsonValue> = fc.letrec<{ value: JsonValue }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    jsonLeaf,
    fc.array(tie("value"), { maxLength: 3 }),
    fc.dictionary(hazardText(8), tie("value"), { maxKeys: 3, noNullPrototype: true }),
  ),
})).value;

export const metadata: fc.Arbitrary<JsonObject> = fc.dictionary(hazardText(10), jsonValue, { maxKeys: 4, noNullPrototype: true });

// nbformat attachments: file name -> MIME bundle (string or line list per type).
const mimeType = fc.constantFrom("image/png", "image/jpeg", "text/plain", "image/svg+xml");
export const attachments: fc.Arbitrary<JsonObject> = fc.dictionary(
  hazardText(12),
  fc.dictionary(mimeType, fc.oneof(hazardText(24), fc.array(hazardText(12), { maxLength: 3 })), { minKeys: 1, maxKeys: 2, noNullPrototype: true }),
  { maxKeys: 2, noNullPrototype: true },
);

export const docCell: fc.Arbitrary<Omit<DocCell, "id">> = fc.oneof(
  fc.record({ type: fc.constant("code" as const), source: hazardText(), metadata }),
  fc.record({ type: fc.constant("markdown" as const), source: hazardText(), metadata, attachments }, { requiredKeys: ["type", "source", "metadata"] }),
  fc.record({ type: fc.constant("raw" as const), source: hazardText(), metadata, attachments }, { requiredKeys: ["type", "source", "metadata"] }),
);

/** A valid document: unique ids, PyNote-style kernel metadata plus arbitrary extras. */
export const notebookDocument: fc.Arbitrary<NotebookDocument> = fc
  .record({
    cells: fc.uniqueArray(fc.tuple(cellId, docCell), { selector: ([id]) => id, maxLength: 8 }),
    extra: metadata,
  })
  .map(({ cells, extra }) => ({
    cells: cells.map(([id, cell]) => ({ id, ...cell }) as DocCell),
    metadata: { ...extra, kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO },
  }));
