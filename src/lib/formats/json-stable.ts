import type { JsonValue } from "./document";

// JSON text identical to what Jupyter's nbformat writer produces:
// json.dumps(nb, sort_keys=True, indent=1, ensure_ascii=False,
// separators=(",", ": ")). Keys are sorted by code point (Python's string
// order) rather than by JavaScript's property enumeration order, which would
// put integer-like keys first. Matching Jupyter byte for byte means a notebook
// saved alternately by PyNote and Jupyter produces no spurious diffs.
//
// Known, documented differences: floats print in JavaScript's shortest form
// (1 rather than 1.0), and lone surrogates are escaped.

const compareCodePoints = (a: string, b: string): number => {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ca = ia.next();
    const cb = ib.next();
    if (ca.done || cb.done) return ca.done === cb.done ? 0 : ca.done ? -1 : 1;
    const da = ca.value.codePointAt(0)!;
    const db = cb.value.codePointAt(0)!;
    if (da !== db) return da - db;
  }
};

const write = (value: JsonValue | undefined, depth: number, indent: string): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  const inner = indent.repeat(depth + 1);
  const outer = indent.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => inner + write(item, depth + 1, indent)).join(",\n")}\n${outer}]`;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort(compareCodePoints);
  if (keys.length === 0) return "{}";
  return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${write(value[k], depth + 1, indent)}`).join(",\n")}\n${outer}}`;
};

export const stableStringify = (value: JsonValue, indent = " "): string => write(value, 0, indent);

// Python's str.splitlines(keepends=True): splits after \n, \r, \r\n and the
// other Unicode line boundaries, keeping each terminator on its line, and
// returns [] for the empty string. nbformat stores `source` this way.
const BOUNDARIES = new Set(["\n", "\r", "\v", "\f", "\x1c", "\x1d", "\x1e", "\x85", "\u2028", "\u2029"]);

export const splitLinesKeepEnds = (text: string): string[] => {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!BOUNDARIES.has(ch)) continue;
    const end = ch === "\r" && text[i + 1] === "\n" ? i + 2 : i + 1;
    lines.push(text.slice(start, end));
    start = end;
    i = end - 1;
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
};
