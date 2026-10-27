import type { RendererExtension, Token, TokenizerExtension } from "marked";

// Math in PyNote's Markdown: where it is recognized, in one place. The markdown
// cell and output renderers use these rules with KaTeX; the exporters' comment
// wrapping (src/lib/formats/comment-wrap.ts) uses them to know which text is
// math, so a wrapped comment renders as the cell does; the cell editor
// (src/lib/mathSyntax.ts, src/lib/mathPlugin.ts) uses them to keep math as
// written.
//
//   $...$, $$...$$   inline math (marked-katex-extension's rules), starting at
//                    the beginning of a run of inline text (a paragraph,
//                    heading or table cell, or the text inside emphasis, a
//                    link or strikethrough) or after whitespace, line breaks
//                    included
//   $$ on own lines  block math
//   $$...$$          display math anywhere in a line (PyNote's displayMath)

export const INLINE_MATH = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:？！。，：]|$)/;
export const BLOCK_MATH = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;
export const DISPLAY_MATH = /^\$\$([\s\S]+?)\$\$/;

/**
 * Whether inline math can open after `before`, the character before the "$"
 * (undefined at the start of a run of inline text).
 */
export const opensInlineMath = (before: string | undefined): boolean => before === undefined || /\s/.test(before);

/**
 * Where inline math can begin in a run of inline text: the first `$` at the
 * start or after whitespace that opens a complete span. (marked-katex-extension
 * only accepts a plain space before it, so math at the start of a soft-wrapped
 * line stayed text.)
 */
export function inlineMathStart(src: string): number | undefined {
  for (let i = src.indexOf("$"); i !== -1; i = src.indexOf("$", i + 1)) {
    if ((i === 0 || /\s/.test(src[i - 1])) && INLINE_MATH.test(src.slice(i))) return i;
  }
  return undefined;
}

export const displayMathStart = (src: string): number | undefined => /\$\$/.exec(src)?.index;

interface MathToken {
  type: string;
  raw: string;
  text: string;
  displayMode: boolean;
}

/**
 * The marked extensions. marked tries the inline ones last given first, so at
 * "$$" display math comes before inline math. `render` turns a token into
 * HTML (KaTeX in the app).
 */
export function mathExtensions(render: (token: MathToken) => string): Array<TokenizerExtension & RendererExtension> {
  return [
    {
      name: "inlineKatex",
      level: "inline",
      start: inlineMathStart,
      tokenizer(src: string, tokens: Token[]) {
        // marked tries this after every token, and one character into plain
        // text (`start` sees the text from its second character on), so what
        // comes before the "$" is checked here.
        if (!opensInlineMath(tokens.at(-1)?.raw.at(-1))) return undefined;
        const match = INLINE_MATH.exec(src);
        return match ? { type: "inlineKatex", raw: match[0], text: match[2].trim(), displayMode: match[1].length === 2 } : undefined;
      },
      renderer: (token) => render(token as unknown as MathToken),
    },
    {
      name: "blockKatex",
      level: "block",
      tokenizer(src: string) {
        const match = BLOCK_MATH.exec(src);
        return match ? { type: "blockKatex", raw: match[0], text: match[2].trim(), displayMode: match[1].length === 2 } : undefined;
      },
      renderer: (token) => `${render(token as unknown as MathToken)}\n`,
    },
    {
      name: "displayMath",
      level: "inline",
      start: displayMathStart,
      tokenizer(src: string) {
        const match = DISPLAY_MATH.exec(src);
        return match ? { type: "displayMath", raw: match[0], text: match[1].trim(), displayMode: true } : undefined;
      },
      renderer: (token) => render(token as unknown as MathToken),
    },
  ];
}
