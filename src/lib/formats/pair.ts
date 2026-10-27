import type { DocCell, NotebookDocument } from "./document";
import { newCellId } from "./ids";
import type { ParseResult } from "./ipynb";
import { exportMarkdown, readMarkdownCells } from "./markdown";
import { type DependencyInfo, type PythonExportResult, exportPython, parsePython } from "./python";

// A notebook as two files that each work on their own: <name>.py holds the
// code cells as a runnable py:percent script, <name>.md holds the prose with
// an anchor where each code cell goes. mergePair puts them back together into
// one notebook, keeping edits made to either file (for importing them; Open
// opens notebooks only). The specification is docs/formats/exports.md ("The
// .py/.md pair").

export interface PairExportOptions {
  baseName: string;
  dependencies?: ReadonlyMap<string, DependencyInfo>;
  lineWidth?: number;
}

export function exportPair(doc: NotebookDocument, options: PairExportOptions): { py: string; md: string; python: PythonExportResult } {
  const python = exportPython(doc, {
    includeMarkdown: false,
    cellIds: true,
    pairedWith: `${options.baseName}.md`,
    dependencies: options.dependencies,
    lineWidth: options.lineWidth,
  });
  const md = exportMarkdown(doc, { includeCode: false, pairAnchors: true, pairedWith: `${options.baseName}.py` });
  return { py: python.text, md, python };
}

/**
 * Merge the two halves of a pair. The .md decides the order: its prose and
 * raw cells are kept, and each code anchor takes the .py cell with its id.
 * Cells only the .py has (written there, or whose anchor was deleted) go
 * right after the .py cell before them; anchors of code deleted from the .py
 * are dropped. Never throws.
 */
export function mergePair(pyText: string, mdText: string): ParseResult<NotebookDocument> {
  try {
    return merge(pyText, mdText);
  } catch (err) {
    return { ok: false, error: `Could not merge the files: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function merge(pyText: string, mdText: string): ParseResult<NotebookDocument> {
  const py = parsePython(pyText);
  if (!py.ok) return py;
  const md = readMarkdownCells(mdText);
  const warnings = [...py.warnings, ...md.warnings];
  if (md.mode === "plain") warnings.push("The Markdown file has no cell anchors; the code cells were added after its text.");

  const pyCells = py.value.cells;
  const pyById = new Map(pyCells.map((cell) => [cell.id, cell]));
  const used = new Set<DocCell>();
  const cells: DocCell[] = [];
  let firstAnchored = -1;
  for (const { line, id, ...cell } of md.cells) {
    if (md.mode === "pair" && cell.type === "code") {
      const code = id === undefined ? undefined : pyById.get(id);
      if (code && !used.has(code)) {
        if (firstAnchored < 0) firstAnchored = cells.length;
        cells.push(code);
        used.add(code);
      } else {
        warnings.push(code
          ? `Line ${line} of the Markdown file: dropped a second anchor for code cell ${id}.`
          : `Line ${line} of the Markdown file: dropped the anchor of code cell ${id}, which the .py file no longer has.`);
      }
    } else {
      cells.push({ id: id ?? "", ...cell });
    }
  }

  pyCells.forEach((cell, k) => {
    if (used.has(cell)) return;
    const previous = pyCells[k - 1];
    let at: number;
    if (previous) {
      at = cells.indexOf(previous) + 1;
      warnings.push(`The ${cell.type} cell ${cell.id} is only in the .py file; inserted it after cell ${previous.id}.`);
    } else if (firstAnchored >= 0) {
      at = firstAnchored++;
      warnings.push(`The ${cell.type} cell ${cell.id} is only in the .py file; inserted it before the first code cell.`);
    } else {
      at = cells.length;
      warnings.push(`The ${cell.type} cell ${cell.id} is only in the .py file; added it at the end.`);
    }
    cells.splice(at, 0, cell);
    used.add(cell);
  });

  // Ids may clash across the two files or within the .md (a copied cell), or
  // be missing (prose without an anchor): the first cell keeps an id.
  const taken = new Set(cells.map((cell) => cell.id).filter((id) => id !== ""));
  const seen = new Set<string>();
  const merged = cells.map((cell) => {
    if (cell.id !== "" && !seen.has(cell.id)) {
      seen.add(cell.id);
      return cell;
    }
    const id = newCellId(taken);
    taken.add(id);
    seen.add(id);
    if (cell.id !== "") warnings.push(`Cell id ${cell.id} appears more than once; the later cell got the new id ${id}.`);
    return { ...cell, id };
  });

  return { ok: true, value: { cells: merged, metadata: py.value.metadata }, warnings };
}
