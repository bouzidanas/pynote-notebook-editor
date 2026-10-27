import type { NotebookDocument } from "./formats/document";
import { parseIpynb } from "./formats/ipynb";

// What Open does with the file the user picked: notebooks only, .ipynb or
// .pynote. (Scripts and documents, .py and .md, are not notebooks; their
// readers in src/lib/formats are for a separate import.) .pynote loads on
// demand, since it pulls in the YAML parser.

export interface PickedText {
  name: string;
  content: string;
}

export type OpenResult =
  | { ok: true; document: NotebookDocument; warnings: string[] }
  | { ok: false; error: string };

export const OPEN_ACCEPT = ".ipynb,.pynote";

const PYNOTE_FRONT_MATTER = /^﻿?---\r?\npynote:/;

export async function readNotebookFile(file: PickedText): Promise<OpenResult> {
  // .pynote by extension, or by its front matter when the name is unusual.
  const parsed = /\.pynote$/i.test(file.name) || PYNOTE_FRONT_MATTER.test(file.content)
    ? (await import("./formats/pynote")).parsePynote(file.content)
    : parseIpynb(file.content);
  if (!parsed.ok) return { ok: false, error: `Could not open ${file.name}.\n\n${parsed.error}` };
  return { ok: true, document: parsed.value, warnings: parsed.warnings };
}
