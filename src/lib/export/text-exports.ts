import type { NotebookDocument } from "../formats/document";
import { serializeIpynb, stripPyNoteMetadata } from "../formats/ipynb";
import { exportMarkdown } from "../formats/markdown";
import { exportPair } from "../formats/pair";
import { serializePynote } from "../formats/pynote";
import { type DependencyInfo, type PythonExportResult, exportPython } from "../formats/python";

// The text formats of the Export dialog: what each writes for a notebook and
// options. Pure, so the dialog's preview and the saved files are the same
// text by construction.

export type TextFormat = "pynote" | "ipynb" | "python" | "markdown" | "pair";

export interface TextOptions {
  /** Jupyter: leave out PyNote's settings (theme, view, history). */
  ipynbClean: boolean;
  /** Python: markdown and raw cells as comments. */
  pythonMarkdown: boolean;
  /** Markdown: code cells as fenced code blocks. */
  markdownCode: boolean;
}

export interface TextFile {
  name: string;
  text: string;
}

export interface ScriptInfo {
  /** The runnable script (the .py of a Python or pair export). */
  text: string;
  result: PythonExportResult;
  /**
   * Each code cell's first line (1-based, its marker) in the script, as the
   * exporter wrote it: the text alone cannot tell, since a line of code can
   * look like a marker.
   */
  cellStarts: Array<{ id: string; line: number }>;
}

export interface TextExport {
  files: TextFile[];
  script?: ScriptInfo;
}

const scriptInfo = (text: string, result: PythonExportResult): ScriptInfo => ({ text, result, cellStarts: result.codeStarts });

export function buildTextExport(
  doc: NotebookDocument,
  format: TextFormat,
  baseName: string,
  options: TextOptions,
  dependencies?: ReadonlyMap<string, DependencyInfo>,
): TextExport {
  switch (format) {
    case "pynote":
      return { files: [{ name: `${baseName}.pynote`, text: serializePynote(doc) }] };
    case "ipynb":
      return { files: [{ name: `${baseName}.ipynb`, text: serializeIpynb(options.ipynbClean ? stripPyNoteMetadata(doc) : doc) }] };
    case "markdown":
      return { files: [{ name: `${baseName}.md`, text: exportMarkdown(doc, { includeCode: options.markdownCode }) }] };
    case "python": {
      const result = exportPython(doc, { includeMarkdown: options.pythonMarkdown, dependencies });
      return { files: [{ name: `${baseName}.py`, text: result.text }], script: scriptInfo(result.text, result) };
    }
    case "pair": {
      const pair = exportPair(doc, { baseName, dependencies });
      return {
        files: [
          { name: `${baseName}.py`, text: pair.py },
          { name: `${baseName}.md`, text: pair.md },
        ],
        script: scriptInfo(pair.py, pair.python),
      };
    }
  }
}
