import { fc } from "@fast-check/vitest";
import { hazardText } from "./notebook";

// Generators for Markdown documents, built from the constructs comment
// wrapping treats differently (paragraphs with atoms and hard breaks, lists,
// quotes, tables, code, math, HTML) and weighted toward the words that are
// dangerous at the start of a line. Any text is valid Markdown, so the
// documents need not be "well formed": whatever structure marked reads is
// what the properties compare.

export const plainWord = fc.oneof(
  { weight: 8, arbitrary: fc.stringMatching(/^[a-z]{1,9}$/) },
  { weight: 2, arbitrary: fc.constantFrom("café", "naïve", "数据", "📈", "Zürich", "x²", "end.", "(paren)", '"quoted"', "it's", "a,b") },
  { weight: 1, arbitrary: fc.constant("averyveryverylongwordthatdoesnotfitonanylineatall") },
);

// Inline spans that must never be broken.
export const ATOMS = [
  "`a b`", "`x`", "`` a ` b ``", "[two words](http://e.x/p)", '[t](http://e.x "a title")', "![an image](i.png)",
  "<https://e.x/a>", "$a + b$", "$$x = y z$$", '<span class="a b">', "</span>", "<!-- c d -->",
  "[a much longer link text that exceeds every width](http://example.com/a/long/path)",
];
export const atom = fc.constantFrom(...ATOMS);

// Words Markdown would read as the start of a block at the start of a line.
export const blockStartWord = fc.constantFrom(
  "-", "+", "*", "1.", "2)", "#", "##", ">", ">x", "```", "~~~", "===", "---", "|", ":-:", "<div>", "$$", "$", "%%", "%%x", "a\\", "\\",
);

const emphasized = fc.tuple(fc.constantFrom("*", "**", "_", "~~"), fc.array(plainWord, { minLength: 1, maxLength: 4 }))
  .map(([d, words]) => `${d}${words.join(" ")}${d}`);

// Atoms that start with "<" (a line must not start with what could open an
// HTML block) or are inline math (only recognized after a space) are glued to
// the word before them, so they are not standalone atoms.
const safeAtom = fc.constantFrom(...ATOMS.filter((a) => !a.startsWith("<") && !/^\$[^$]/.test(a)));

/** Words for paragraphs; `dangerous` adds block-start words and hard breaks. */
const inlineTokens = (dangerous: boolean) => fc.array(
  fc.oneof(
    { weight: 10, arbitrary: plainWord },
    { weight: 3, arbitrary: dangerous ? atom : safeAtom },
    { weight: 1, arbitrary: emphasized },
    { weight: dangerous ? 3 : 0, arbitrary: blockStartWord },
  ),
  { minLength: 1, maxLength: 30 },
);

const separator = (dangerous: boolean) => fc.oneof(
  { weight: 12, arbitrary: fc.constant(" ") },
  { weight: 2, arbitrary: fc.constant("\n") },
  { weight: dangerous ? 1 : 0, arbitrary: fc.constantFrom("  \n", "\\\n", "\t", "   ") },
);

export const paragraph = (dangerous = true) => fc.tuple(inlineTokens(dangerous), fc.array(separator(dangerous), { minLength: 30, maxLength: 30 }))
  .map(([tokens, seps]) => tokens.map((t, i) => (i === 0 ? t : seps[i] + t)).join(""));

const codeLine = fc.oneof(
  fc.stringMatching(/^[ a-z0-9=()%#:"'_.,+*-]{0,100}$/),
  fc.constantFrom("", "    indented", "%% mermaid comment", "# %% looks like a marker", "x".repeat(120)),
);

const fencedCode = fc.tuple(fc.constantFrom("```", "~~~", "````"), fc.constantFrom("", "python", "text", "mermaid"), fc.array(codeLine, { maxLength: 6 }), fc.boolean())
  .map(([fence, info, lines, closed]) => [`${fence}${info}`, ...lines, ...(closed ? [fence] : [])].join("\n"));

const indentedCode = fc.array(codeLine.filter((l) => l.trim() !== ""), { minLength: 1, maxLength: 4 }).map((lines) => lines.map((l) => `    ${l}`).join("\n"));

const heading = fc.oneof(
  fc.tuple(fc.integer({ min: 1, max: 6 }), fc.array(plainWord, { minLength: 1, maxLength: 12 })).map(([n, w]) => `${"#".repeat(n)} ${w.join(" ")}`),
  fc.tuple(fc.array(plainWord, { minLength: 1, maxLength: 12 }), fc.constantFrom("===", "---", "=")).map(([w, u]) => `${w.join(" ")}\n${u}`),
);

const tableCell = fc.oneof(
  fc.array(plainWord, { maxLength: 3 }).map((w) => w.join(" ")),
  fc.constantFrom("a \\| b", "`code`", "**b**", "😀", "", "x|y"),
);
const table = fc.tuple(
  fc.integer({ min: 1, max: 4 }).chain((n) => fc.tuple(
    fc.array(tableCell, { minLength: n, maxLength: n }),
    fc.array(fc.constantFrom("---", ":--", "--:", ":-:", "-"), { minLength: n, maxLength: n }),
    fc.array(fc.array(tableCell, { minLength: 0, maxLength: n + 1 }), { maxLength: 4 }),
  )),
  fc.boolean(),
).map(([[header, delims, rows], pipes]) => {
  const row = (cells: string[]) => (pipes ? `| ${cells.join(" | ")} |` : cells.join(" | "));
  return [row(header), row(delims), ...rows.map(row)].join("\n");
});

const mathBlock = fc.array(fc.constantFrom("a = b", "\\frac{1}{2} % half", "x^2", "\\\\", "", "\\sum_i x_i"), { minLength: 1, maxLength: 4 })
  .map((lines) => ["$$", ...lines, "$$"].join("\n"));

const htmlBlock = fc.tuple(fc.constantFrom("div", "details", "p"), fc.array(plainWord, { minLength: 1, maxLength: 20 }))
  .map(([tag, words]) => `<${tag}>\n${words.join(" ")}\n</${tag}>`);

const rule = fc.constantFrom("---", "***", "___", "- - -");

const frontMatter = fc.array(fc.tuple(fc.stringMatching(/^[a-z]{1,6}$/), plainWord), { minLength: 1, maxLength: 3 })
  .map((pairs) => ["---", ...pairs.map(([k, v]) => `${k}: ${v}`), "---"].join("\n"));

const indent = (text: string, prefix: string, first: string) =>
  text.split("\n").map((line, i) => (i === 0 ? first + line : line === "" ? "" : prefix + line)).join("\n");

const blockJoin = fc.constantFrom("\n", "\n\n", "\n\n", "\n\n\n");

export const markdownDocument: fc.Arbitrary<string> = fc.letrec<{ doc: string; block: string; list: string; quote: string }>((tie) => ({
  block: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    { weight: 6, arbitrary: paragraph() },
    { weight: 2, arbitrary: heading },
    { weight: 2, arbitrary: fencedCode },
    { weight: 1, arbitrary: indentedCode },
    { weight: 2, arbitrary: table },
    { weight: 1, arbitrary: mathBlock },
    { weight: 1, arbitrary: htmlBlock },
    { weight: 1, arbitrary: rule },
    { weight: 1, arbitrary: hazardText(60) },
    { weight: 3, arbitrary: tie("list") },
    { weight: 2, arbitrary: tie("quote") },
  ),
  list: fc.tuple(
    fc.constantFrom("-", "*", "+", "1.", "2)", "10."),
    fc.array(fc.tuple(fc.constantFrom("", "[ ] ", "[x] "), tie("doc"), fc.boolean()), { minLength: 1, maxLength: 4 }),
  ).map(([bullet, items]) => items.map(([box, content, loose], i) => {
    const marker = /\d/.test(bullet) ? `${Number.parseInt(bullet, 10) + i}${bullet.slice(-1)} ` : `${bullet} `;
    return indent(box + content, " ".repeat(marker.length), marker) + (loose ? "\n" : "");
  }).join("\n")),
  quote: fc.tuple(tie("doc"), fc.boolean()).map(([content, lazy]) =>
    content.split("\n").map((line, i) => (lazy && i > 0 && i % 3 === 0 ? line : line === "" ? ">" : `> ${line}`)).join("\n")),
  doc: fc.tuple(fc.array(tie("block"), { minLength: 1, maxLength: 4 }), fc.array(blockJoin, { minLength: 4, maxLength: 4 }))
    .map(([blocks, joins]) => blocks.map((b, i) => (i === 0 ? b : joins[i] + b)).join("")),
})).doc;

/** A document that may start with front matter, as a cell can. */
export const markdownCell = fc.tuple(fc.option(frontMatter, { nil: undefined }), markdownDocument, blockJoin)
  .map(([front, doc, join]) => (front ? front + join + doc : doc));

/** Paragraphs, lists and quotes of safe words and atoms only (no block starts, no hard breaks). */
export const wrappableDocument: fc.Arbitrary<string> = fc.letrec<{ doc: string; block: string }>((tie) => ({
  block: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    { weight: 4, arbitrary: paragraph(false) },
    {
      weight: 1,
      arbitrary: fc.tuple(fc.constantFrom("- ", "1. ", "10) "), tie("doc")).map(([marker, content]) => indent(content, " ".repeat(marker.length), marker)),
    },
    // A task box is followed by text (a list right after it would not be one).
    { weight: 1, arbitrary: paragraph(false).map((text) => indent(text, "  ", "- [ ] ")) },
    { weight: 1, arbitrary: tie("doc").map((content) => content.split("\n").map((l) => (l === "" ? ">" : `> ${l}`)).join("\n")) },
  ),
  doc: fc.array(tie("block"), { minLength: 1, maxLength: 3 }).map((blocks) => blocks.join("\n\n")),
})).doc;
