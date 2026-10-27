import { describe, expect, test } from "vitest";
import { type NotebookDocument, PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "./formats/document";
import { serializeIpynb } from "./formats/ipynb";
import { serializePynote } from "./formats/pynote";
import { buildTextExport } from "./export/text-exports";
import { OPEN_ACCEPT, readNotebookFile } from "./notebook-open";

const doc: NotebookDocument = {
  metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO },
  cells: [
    { id: "prose", type: "markdown", source: "# Notes\n\nText.", metadata: {} },
    { id: "code1", type: "code", source: "x = 2", metadata: {} },
  ],
};
const cells = (d: NotebookDocument) => d.cells.map((c) => [c.id, c.type, c.source]);

describe("readNotebookFile", () => {
  test("opens .ipynb and .pynote notebooks", async () => {
    const ipynb = await readNotebookFile({ name: "a.ipynb", content: serializeIpynb(doc) });
    expect(ipynb.ok && cells(ipynb.document)).toEqual(cells(doc));
    const pynote = await readNotebookFile({ name: "b.pynote", content: serializePynote(doc) });
    expect(pynote.ok && cells(pynote.document)).toEqual(cells(doc));
  });

  test("recognizes a .pynote file by its front matter whatever its name", async () => {
    const result = await readNotebookFile({ name: "notes.txt", content: serializePynote(doc) });
    expect(result.ok && cells(result.document)).toEqual(cells(doc));
  });

  test("offers notebooks only: scripts and documents are not opened", async () => {
    expect(OPEN_ACCEPT).toBe(".ipynb,.pynote");
    const options = { ipynbClean: false, pythonMarkdown: true, markdownCode: true };
    for (const format of ["python", "markdown"] as const) {
      const file = buildTextExport(doc, format, "nb", options).files[0];
      const result = await readNotebookFile({ name: file.name, content: file.text });
      expect(result.ok, file.name).toBe(false);
    }
  });

  test("explains a broken file", async () => {
    const broken = await readNotebookFile({ name: "a.ipynb", content: "not json" });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/^Could not open a\.ipynb/);
  });
});
