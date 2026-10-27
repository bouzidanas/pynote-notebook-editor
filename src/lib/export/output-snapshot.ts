import type { CellData } from "../store";
import { MARKER_UI_END, MARKER_UI_START, UI_MIME } from "../output-markers";

// Saved outputs for read-only exports. A cell's stored output holds each
// pynote_ui component as it was created; Python updates and user interaction
// since then live in the mounted component (see Kernel.componentSnapshot).
// This patches every component in the outputs with what it currently shows,
// so the export looks like the notebook did at the moment of export.
//
// One exception: what a password field holds is never exported. The browser
// hides it on screen, and readers must not find it in the page or its source
// either: not what was typed, and not a value Python gave the field.

type Outputs = NonNullable<CellData["outputs"]>;
type SnapshotOf = (id: string) => Record<string, unknown> | undefined;

interface ComponentJson {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

const isComponent = (value: unknown): value is ComponentJson =>
  typeof value === "object" && value !== null && typeof (value as any).id === "string" &&
  typeof (value as any).type === "string" && typeof (value as any).props === "object" && (value as any).props !== null;

// A password field: Input sets input_type as the field's type, whose keywords
// ignore case. Spaces around it make the browser show a text field, but the
// field is meant as a password field all the same.
const isPasswordField = (props: Record<string, unknown> | undefined) =>
  typeof props?.input_type === "string" && props.input_type.trim().toLowerCase() === "password";

/**
 * A component and everything nested in its props (Group and Form keep child
 * components in props.children), with props as the mounted component shows
 * them now (`current`) or as printed. A field that is a password field, now
 * or as printed, holds no value either way: Python creates it with one, sets
 * one, and keeps what was typed in the props it prints.
 */
const patch = (value: unknown, snapshotOf: SnapshotOf, current: boolean): unknown => {
  if (Array.isArray(value)) return value.map((item) => patch(item, snapshotOf, current));
  if (typeof value !== "object" || value === null) return value;
  if (isComponent(value)) {
    const shown = snapshotOf(value.id);
    const props: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries((current && shown) || value.props)) props[key] = patch(prop, snapshotOf, current);
    if ((isPasswordField(value.props) || isPasswordField(shown)) && "value" in props) props.value = "";
    return { ...value, props };
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = patch(item, snapshotOf, current);
  return out;
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UI_PATTERN = new RegExp(`${escapeRegex(MARKER_UI_START)}(.+?)${escapeRegex(MARKER_UI_END)}`, "gs");

// Python's json.dumps writes the floats nan and inf as NaN, Infinity and
// -Infinity, which JSON does not allow. They are read as strings that start
// with a noncharacter (strings in the JSON are matched too, to be kept), and
// written back as they were printed.
const NON_FINITE = /"(?:[^"\\]|\\.)*"|-?Infinity|NaN/g;
const NON_FINITE_MARK = "\uFDD0";
const MARKED_NON_FINITE = new RegExp(`"${NON_FINITE_MARK}(-?Infinity|NaN)"`, "g");

/** A printed component's JSON: its value, and whether JSON allows it (`strict`). */
const readJson = (json: string): { value: unknown; strict: boolean } | null => {
  try {
    return { value: JSON.parse(json), strict: true };
  } catch {
    try {
      const marked = json.replace(NON_FINITE, (token) => (token.startsWith('"') ? token : `"${NON_FINITE_MARK}${token}"`));
      return { value: JSON.parse(marked), strict: false };
    } catch {
      return null; // not a component's JSON
    }
  }
};

/** A value readJson read, as JSON text again, with Python's non-finite numbers as printed. */
const writeJson = (value: unknown): string => JSON.stringify(value).replace(MARKED_NON_FINITE, "$1");

/**
 * The components printed in a text, patched. `rendered`: the output shows
 * them as components (stdout), which then show what the mounted ones show
 * now. Otherwise the output shows each one's JSON as text (stderr, a result,
 * a traceback, and in stdout one with NaN or Infinity, which JSON does not
 * allow): kept exactly as printed, unless it holds a password value. Then it
 * is written again without the value, NaN and Infinity included, so a reader
 * sees it as text too.
 */
const patchText = (text: string, snapshotOf: SnapshotOf, rendered: boolean): string =>
  text.replace(UI_PATTERN, (whole, json: string) => {
    const read = readJson(json);
    if (!read) return whole;
    if (rendered && read.strict) return `${MARKER_UI_START}${JSON.stringify(patch(read.value, snapshotOf, true))}${MARKER_UI_END}`;
    const redacted = patch(read.value, snapshotOf, false);
    return JSON.stringify(redacted) === JSON.stringify(read.value) ? whole : `${MARKER_UI_START}${writeJson(redacted)}${MARKER_UI_END}`;
  });

/**
 * A stream's chunks, patched. A component printed in several writes spans
 * chunks, so the chunks a component spans become one, and every other chunk
 * stays as it is (stderr shows each chunk on its own line).
 */
const patchStream = (chunks: readonly string[], snapshotOf: SnapshotOf, rendered: boolean): string[] => {
  const spans = Array.from(chunks.join("").matchAll(UI_PATTERN), (match) => ({ start: match.index, end: match.index + match[0].length }));
  const merged: string[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    const start = offset;
    offset += chunk.length;
    // Joins the previous chunk when a component printed there continues here.
    if (merged.length > 0 && spans.some((span) => span.start < start && span.end > start)) merged[merged.length - 1] += chunk;
    else merged.push(chunk);
  }
  return merged.map((chunk) => patchText(chunk, snapshotOf, rendered));
};

/** Outputs of every code cell that has run, with components as they look now. */
export function snapshotOutputs(cells: readonly CellData[], snapshotOf: SnapshotOf): Record<string, Outputs> {
  const result: Record<string, Outputs> = {};
  for (const cell of cells) {
    if (cell.type !== "code" || !cell.outputs) continue;
    const outputs = JSON.parse(JSON.stringify(cell.outputs)) as Outputs;
    outputs.stdout = patchStream(outputs.stdout ?? [], snapshotOf, true);
    outputs.stderr = patchStream(outputs.stderr ?? [], snapshotOf, false);
    if (typeof outputs.result === "string") outputs.result = patchText(outputs.result, snapshotOf, false);
    if (typeof outputs.error === "string") outputs.error = patchText(outputs.error, snapshotOf, false);
    if (outputs.mimebundle && outputs.mimebundle[UI_MIME]) {
      outputs.mimebundle = { ...outputs.mimebundle, [UI_MIME]: patch(outputs.mimebundle[UI_MIME], snapshotOf, true) };
    }
    result[cell.id] = outputs;
  }
  return result;
}
