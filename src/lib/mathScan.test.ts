import { describe, expect, test } from "vitest";
import { fc, test as prop } from "@fast-check/vitest";
import { DISPLAY_MATH, INLINE_MATH, displayMathStart, inlineMathStart } from "./markdown-math";
import { scanMath } from "./mathScan";

// What the rules find at each position of `text`, as markdown-math.ts matches
// them, and as a scan finds them.
const byRules = (text: string) =>
  Array.from({ length: text.length + 1 }, (_, at) => [
    INLINE_MATH.exec(text.slice(at))?.[0].length ?? 0,
    DISPLAY_MATH.exec(text.slice(at))?.[0].length ?? 0,
    inlineMathStart(text.slice(at)),
    displayMathStart(text.slice(at)),
  ]);
const byScan = (text: string) => {
  const scan = scanMath(text);
  return Array.from({ length: text.length + 1 }, (_, at) => [scan.inline(at), scan.display(at), scan.inlineStart(at), scan.displayStart(at)]);
};

// The characters the rules tell apart.
const CHARS = ["$", "$", "$", "\\", "\n", "\r", "\u2028", " ", "\t", "\u00a0", "a", "x", "5", ".", ",", "?", "!", ":", "，", "*", "`", "{", "}"];

describe("a scan of a text", () => {
  test("finds the math the rules find at each position", () => {
    for (const text of [
      "$x$ a",
      "a $x$",
      "$5 and $x$",
      "$5 and\n$x$",
      "It costs $5 and $10.",
      "$a$$b$ and $$a$$$$b$$",
      "$\\$$ and $a\\$$ hold dollars",
      "\\\\$x$ and \\$y$ and $a\\\\$ b",
      "$x\\\n$ and $x\\",
      "$$x$ y$$ and $$$x$$$",
      "$ x $ and $x $, $x$, $x$! $x$？",
      "",
      "$",
      "$$",
      "$$$$$",
    ]) {
      expect(byScan(text), JSON.stringify(text)).toEqual(byRules(text));
    }
  });

  prop.prop([fc.array(fc.constantFrom(...CHARS), { maxLength: 40 }).map((chars) => chars.join(""))], { numRuns: 3000 })(
    "finds the math the rules find in any text",
    (text) => {
      expect(byScan(text)).toEqual(byRules(text));
    },
  );
});
