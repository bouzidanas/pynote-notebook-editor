// Font selection for HTML exports. The runtime CSS carries every font face
// the app can use, inlined as data URIs (~2.5 MB). An export keeps only what
// its pages can render with:
//
// - families its theme names (body, code and UI fonts), plus KaTeX's when the
//   pages can show math (see exportFontNeeds);
// - for each family, only the unicode-range subsets the notebook's text uses
//   (Latin is always kept, for the interface itself);
// - only the WOFF2 source of each face (every browser PyNote runs in reads it).

export interface FontNeeds {
  families: Set<string>;
  text: string; // every character the pages can show
  math: boolean; // the pages can show KaTeX math: keep every KaTeX face
}

// KaTeX's faces (KaTeX_Main, KaTeX_Math, KaTeX_Size1 to 4 and so on). They
// carry no unicode-range: math needs all of them.
const KATEX_FAMILY = /^KaTeX_/;

// First family in a CSS font-family stack, unquoted.
export const primaryFamily = (stack: string | undefined): string | null => {
  const first = (stack ?? "").split(",")[0]?.trim().replace(/^["']|["']$/g, "").trim();
  return first || null;
};

// Characters the interface itself needs regardless of content (menus,
// buttons, digits): basic Latin.
const ALWAYS_TEXT = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

/** Parse a CSS unicode-range value into [start, end] code point pairs. */
export const parseUnicodeRange = (value: string): Array<[number, number]> =>
  value.split(",").flatMap((part) => {
    const token = part.trim().replace(/^U\+/i, "");
    if (!token) return [];
    if (token.includes("?")) {
      return [[parseInt(token.replace(/\?/g, "0"), 16), parseInt(token.replace(/\?/g, "F"), 16)] as [number, number]];
    }
    const [start, end] = token.split("-");
    const a = parseInt(start, 16);
    return [[a, end ? parseInt(end, 16) : a] as [number, number]];
  });

const usesRange = (codePoints: Set<number>, ranges: Array<[number, number]>) => {
  for (const cp of codePoints) for (const [a, b] of ranges) if (cp >= a && cp <= b) return true;
  return false;
};

/**
 * Whether text may show KaTeX math: two dollar signs (PyNote's math is
 * $...$ or $$...$$, on one line or several), or markup KaTeX rendered (its
 * quotes may be JSON-escaped). Conservative: a false positive only adds
 * KaTeX's fonts to the export, a miss renders its math in fallback fonts.
 */
export const containsMath = (text: string): boolean => /\$[\s\S]*\$/.test(text) || /class=\\?["']katex/.test(text);

/**
 * The fonts an export's pages need: the theme's families, every character
 * the pages show, and KaTeX's faces when math can appear. That is always
 * the case in an interactive export (readers edit cells, and code can print
 * math); otherwise only when the content has math.
 */
export function exportFontNeeds(options: {
  /** The theme's font stacks (body, code and UI). */
  fonts: ReadonlyArray<string | undefined>;
  /** Everything the pages show: the document and any saved outputs. */
  content: unknown;
  interactive: boolean;
}): FontNeeds {
  const text = JSON.stringify(options.content) ?? "";
  return {
    families: new Set(options.fonts.map(primaryFamily).filter((family): family is string => !!family)),
    text,
    math: options.interactive || containsMath(text),
  };
}

/**
 * The runtime CSS with only the font faces `needs` calls for, each reduced to
 * its WOFF2 source. All other rules are kept unchanged.
 */
export function selectFonts(css: string, needs: FontNeeds): string {
  const codePoints = new Set<number>();
  for (const ch of needs.text + ALWAYS_TEXT) codePoints.add(ch.codePointAt(0)!);
  return css.replace(/@font-face\s*\{([^}]*)\}/g, (block, body: string) => {
    const family = /font-family\s*:\s*([^;]+)/.exec(body)?.[1].trim().replace(/^["']|["']$/g, "");
    if (!family || !(needs.families.has(family) || (needs.math && KATEX_FAMILY.test(family)))) return "";
    const range = /unicode-range\s*:\s*([^;]+)/.exec(body)?.[1];
    if (range && !usesRange(codePoints, parseUnicodeRange(range))) return "";
    return keepWoff2Only(block);
  });
}

// The src declaration's value runs to the first ";" outside parentheses (data
// URIs themselves contain ";base64"). Keep only its woff2 entry, if any.
const keepWoff2Only = (block: string): string => {
  const start = block.search(/src\s*:/);
  if (start < 0) return block;
  const valueStart = block.indexOf(":", start) + 1;
  let depth = 0;
  let end = valueStart;
  for (; end < block.length; end++) {
    const ch = block[end];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === ";" || ch === "}") && depth === 0) break;
  }
  const entries: string[] = [];
  let entryStart = valueStart;
  depth = 0;
  for (let i = valueStart; i <= end; i++) {
    const ch = block[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === "," && depth === 0) || i === end) {
      entries.push(block.slice(entryStart, i).trim());
      entryStart = i + 1;
    }
  }
  const woff2 = entries.find((entry) => /format\(["']?woff2["']?\)\s*$/.test(entry));
  if (!woff2) return block;
  return `${block.slice(0, start)}src:${woff2}${block.slice(end)}`;
};
