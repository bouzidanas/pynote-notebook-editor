// The markdown cell editor's Markdown, with the real Milkdown (no mocks):
// what it reads as math, what a cell gets back after an edit, and how math
// behaves while editing. The editor is built from the same pieces
// MarkdownEditor uses (markdownSyntax, cellWriteBack).

import { afterEach, describe, expect, it, vi } from "vitest";
import { Marked } from "marked";
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, remarkCtx, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { lift } from "@milkdown/kit/prose/commands";
import { undo } from "@milkdown/kit/prose/history";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown } from "@milkdown/kit/utils";
import { mathExtensions } from "../lib/markdown-math";
import { mathRanges } from "../lib/mathPlugin";
import { markdownSyntax } from "../lib/markdownSyntax";
import { cellWriteBack } from "../lib/markdownWriteBack";

const editors: Editor[] = [];

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  document.body.innerHTML = "";
});

/** A markdown cell's editor opened on `markdown`. */
async function open(markdown: string) {
  const root = document.createElement("div");
  document.body.append(root);
  const editor = await markdownSyntax(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    }),
  )
    .use(history)
    .create();
  editors.push(editor);
  const view: EditorView = editor.action((ctx) => ctx.get(editorViewCtx));
  const toMarkdown = editor.action(cellWriteBack(markdown));
  return {
    editor,
    view,
    /** What the cell gets back for the document as it is now. */
    text: () => toMarkdown(view.state.doc),
    /** Milkdown's own Markdown for the whole document. */
    markdown: () => editor.action(getMarkdown()),
    /** Types `text` as a user would, input rules included. */
    type(text: string, at = view.state.selection.from) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
      for (const char of text) {
        const { from, to } = view.state.selection;
        if (!view.someProp("handleTextInput", (f) => f(view, from, to, char, () => view.state.tr.insertText(char, from, to)))) {
          view.dispatch(view.state.tr.insertText(char, from, to));
        }
      }
    },
  };
}

/** The document position right after the first `needle` in a paragraph's text. */
function after(doc: Node, needle: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1 || !node.isTextblock) return found === -1;
    const index = node.textContent.indexOf(needle);
    if (index !== -1) found = pos + 1 + index + needle.length;
    return false;
  });
  if (found === -1) throw new Error(`"${needle}" is not in the document`);
  return found;
}

/** The document position at the end of the last textblock. */
function lastTextblockEnd(doc: Node): number {
  let end = -1;
  doc.descendants((node, pos) => {
    if (node.isTextblock) end = pos + 1 + node.content.size;
    return !node.isTextblock;
  });
  return end;
}

// --- What counts as math ----------------------------------------------------

/**
 * The math the renderer finds in `markdown`, as written (not counting image
 * descriptions, which are no text in the editor).
 */
function rendererMath(markdown: string): string[] {
  const marked = new Marked();
  marked.use({ extensions: mathExtensions(() => "") });
  const raws: string[] = [];
  const walk = (tokens: any[] = []) => {
    for (const token of tokens) {
      // A block's raw text takes in the blank line after it.
      if (["inlineKatex", "displayMath", "blockKatex"].includes(token.type)) raws.push(token.raw.replace(/\n+$/, ""));
      if (token.type === "image") continue;
      walk(token.tokens);
      for (const item of token.items ?? []) walk(item.tokens);
      for (const cell of [...(token.header ?? []), ...(token.rows ?? []).flat()]) walk(cell.tokens);
    }
  };
  walk(marked.lexer(markdown));
  return raws;
}

/**
 * The math the editor finds in its document, as written (a table cell's "\|"
 * as "|", which is how the renderer reads it there).
 */
function editorMath(doc: Node): string[] {
  const raws: string[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "math_block") raws.push(node.textContent);
    if (!node.isTextblock || node.type.spec.code) return !node.isTextblock;
    const cell = doc.resolve(pos).parent.type.name.startsWith("table_");
    for (const [from, to] of mathRanges(node, pos + 1)) {
      const raw = doc.textBetween(from, to);
      raws.push(cell ? raw.replace(/\\\|/g, "|") : raw);
    }
    return false;
  });
  return raws;
}

/**
 * The math the editor shows in its document: the runs of text it marks as
 * math, a line break in them as a line ending (a table cell's "\|" as "|").
 */
function shownMath(doc: Node): string[] {
  const raws: string[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "math_block") raws.push(node.textContent);
    if (!node.isTextblock || node.type.spec.code) return !node.isTextblock;
    const cell = doc.resolve(pos).parent.type.name.startsWith("table_");
    let run = "";
    const end = () => {
      if (run) raws.push(cell ? run.replace(/\\\|/g, "|") : run);
      run = "";
    };
    node.forEach((child) => {
      if (child.marks.some((mark) => mark.type.name === "math_inline")) run += child.text;
      else if (run && child.type.name === "hardbreak") run += "\n";
      else end();
    });
    end();
    return false;
  });
  return raws;
}

/** The text of each paragraph, with "M" for each character that is math. */
function mathMask(doc: Node, by: "mark" | "rule"): string {
  let mask = "";
  doc.descendants((node, pos) => {
    if (!node.isTextblock || node.type.spec.code) return true;
    const ranges = mathRanges(node, pos + 1);
    node.forEach((child, offset) => {
      for (let i = 0; i < (child.text ?? "").length; i++) {
        const at = pos + 1 + offset + i;
        const math =
          by === "mark"
            ? child.marks.some((mark) => mark.type.name === "math_inline")
            : ranges.some(([from, to]) => from <= at && at < to) && !child.marks.some((mark) => mark.type.spec.code);
        mask += math ? "M" : child.text![i];
      }
    });
    mask += "\n";
    return false;
  });
  return mask;
}

const AGREEMENT = [
  "Inline $x+1$ math.",
  "The area of a square is\n$a^2$ for a side of length a.",
  "After a tab:\t$b^2$ also.",
  "It costs $5 and\n$10 more.",
  "It costs $5 and $10.",
  "$5 and $x$",
  "Values ($x$) and $y$, then $z$.",
  "a$x$ b, *b*$x$, a*$x$ and ($x$ y)",
  "**$x$** and *$n$* items cost $x$ and [$y$](u) ~~$z$~~",
  "*Price: $5* plus tax of $x$ dollars",
  "*see $x$* and **see $y$ here** and *see *$z$**",
  "$a$*b $c$ and $x$**b** $y$",
  "$a *b* c$ and *a $b*c$ d",
  "Pay \\$5 for $y_j$ alone, &#36;3 and \\\\$$q$$ too, \\\\$x$ not.",
  "a$$x$$b and $$display$$ inline with $x_1^2$.",
  "$x$! and $y$? and $z$. and $w$:",
  "$\\$$ and $a\\$$ hold dollars",
  "$a$$b$ and $$a$$$$b$$",
  "line one $a$  \n$b$ two\\\n$c$ three",
  "`$x$` and $`a`$",
  "![alt $x$](img.png) and $y$, $x$![a](b)",
  "<b>$x$</b> and <b> $y$ </b>",
  '<span class="caption">Fig $x_1$ end.</span>',
  '<span class="caption">Fig $x_1$</span>',
  "# Head $x_1$",
  "Heading $y$\n===",
  "| a | b |\n|---|---|\n|$x$| $\\|y\\|$ |",
  "- a $x$\n- b $y$\n\n1. $x$\n2. $y$",
  "* [ ] task $x$",
  "> quote $x_i$\n> more $y$",
  "Footnote[^1] $x$.\n\n[^1]: Note $y$.",
  "$$\n\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\n$$",
  "$$\na\n\nb\n$$\n\nafter $x$",
  "$\nsingle\n$",
  "> $$\n> x\n> $$\n> more $y$",
  "* $$\n  x\n  + y\n  $$",
  "para\n$$\nx\n$$",
  "  $$\nx\n$$",
  "$$\nunclosed\n\nnext $z$",
  "$$\na\\\n$$\nb\n$$",
  // The renderer reads a link before the math that opens in its text.
  "[*cost* $5](u) and $x$, [$y](v) $z$",
  "![chart $5](i.png) or $x$",
  // "$$" with emphasis between its "$": not display math.
  "x,$$*$y$*$ z",
  // A "\" hard break right after a "$": the "$" closes nothing.
  "Given $\\{a\\}$\\\nthen $y$.",
  // A dollar amount does not take in emphasis that pairs up around math
  // after it, in a paragraph or in emphasis (the renderer pairs delimiters
  // in the source, math or not), unless the math closes further on.
  "It costs $5 for **$n$** items.",
  "Pay $10 and *$x_1$* more, $3 per _$k$_ unit, $5 for ~~$x$~~ now.",
  "At the end: $10 for **$n$**",
  "*see $5 for **$n$** here* and **pay $1 for *$x$* each**",
  "*Price: $3 for ~~$x$~~* and **$5 for *$y$***",
  "*It costs $5 for **$n$** items and $m$ more*",
  // Delimiters in math do not end emphasis opened before it.
  "**see $a*b*c$ more**",
];

describe("the editor reads math where the renderer does", () => {
  it.each(AGREEMENT)("%j", async (markdown) => {
    const { view } = await open(markdown);
    expect(editorMath(view.state.doc)).toEqual(rendererMath(markdown));
  });

  it("marks exactly that math", async () => {
    const { view } = await open(AGREEMENT.join("\n\n"));
    expect(mathMask(view.state.doc, "mark")).toBe(mathMask(view.state.doc, "rule"));
  });

  // Where micromark reads the text around math otherwise than the renderer
  // (emphasis it pairs up differently, a www autolink that takes the "_"
  // closing emphasis, a link in a link, a line that marked lets start a
  // block, a table cell the renderer leaves out), the cell opens with the
  // parser's math, which is the renderer's, whatever the rules would find in
  // the document.
  it.each([
    "**$*b*c$**",
    "*5 $ *$ $* $a*b*$",
    "_$[$ www.$_\\",
    "[$ $ [$]()]()",
    "**$*\n1. \n$a*$",
    "| a |\n|---|\n| $y$ | $x_1$ |",
  ])("and shows that as it opens where micromark reads the text around it otherwise: %j", async (markdown) => {
    const { view } = await open(markdown);
    expect(shownMath(view.state.doc)).toEqual(rendererMath(markdown));
  });

  // How many times the editor's parser reads `markdown`, and whether it finds
  // math where the renderer does.
  async function readings(markdown: string): Promise<number> {
    const { editor, view } = await open(markdown);
    expect(editorMath(view.state.doc)).toEqual(rendererMath(markdown));
    const remark = editor.action((ctx) => ctx.get(remarkCtx));
    const parse = vi.spyOn(remark, "parse");
    editor.action((ctx) => ctx.get(parserCtx))(markdown);
    return parse.mock.calls.length;
  }

  it("reads a paragraph of dollar amounts before emphasized math in one go", async () => {
    const markdown = Array.from({ length: 30 }, (_, i) => `$${i} for **$n_${i}$**, *$${i} for **$m_${i}$** each* and ${i}*$x_${i}$`).join(" or ");
    expect(await readings(markdown)).toBe(1);
  });

  it("settles math that reads as plain text all at once", async () => {
    // Each "*" may open emphasis but none closes, so none of the math opens.
    const markdown = Array.from({ length: 30 }, (_, i) => `note *$x_${i}$ here`).join(" and ");
    expect(await readings(markdown)).toBeLessThanOrEqual(2);
  });
});

// --- What a cell gets back --------------------------------------------------

const MIXED = [
  "The softmax of $x_i$ is $\\frac{e^{x_i}}{\\sum_j e^{x_j}}$, and $\\{a, b\\}$ is a set; $\\int_0^1 f(x)\\,dx$ too.",
  "",
  "$$",
  "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
  "$$",
  "",
  "- tight list with $\\alpha_1$",
  "- second item",
  "",
  "It costs $5 and $10.",
  "",
  "Pay \\$5 for $y_j$, &#36;3 for $z^*_k$ and $a*b*c$.",
].join("\n");

describe("after an edit a cell gets back its math and dollar signs as written", () => {
  it("in the edited paragraph and everywhere else", async () => {
    const cell = await open(MIXED);
    cell.type(" Edited.", after(cell.view.state.doc, "$a*b*c$."));
    expect(cell.text()).toBe(`${MIXED} Edited.`);
  });

  it("in the paragraph with the dollar amounts", async () => {
    const cell = await open(MIXED);
    cell.type(" Or $2.", after(cell.view.state.doc, "$10."));
    expect(cell.text()).toBe(MIXED.replace("$10.", "$10. Or $2."));
  });

  it("in Milkdown's own Markdown for the whole cell", async () => {
    const cell = await open(MIXED);
    cell.type(" Edited.", after(cell.view.state.doc, "$a*b*c$."));
    const markdown = cell.markdown();
    for (const kept of ["$x_i$", "$\\frac{e^{x_i}}{\\sum_j e^{x_j}}$", "$\\{a, b\\}$", "$\\int_0^1 f(x)\\,dx$", "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}", "$\\alpha_1$", "It costs $5 and $10.", "Pay \\$5 for $y_j$, &#36;3 for $z^*_k$ and $a*b*c$. Edited."]) {
      expect(markdown).toContain(kept);
    }
  });

  it("writes math typed in the editor as typed, untouched by Markdown shortcuts", async () => {
    const cell = await open("Text.");
    cell.type(" Then $z_k^*$ and $a^* b^*$, and _$x_1$_ at $2.", after(cell.view.state.doc, "Text."));
    expect(cell.text()).toBe("Text. Then $z_k^*$ and $a^* b^*$, and _$x_1$_ at $2.");
    expect(editorMath(cell.view.state.doc)).toEqual(["$z_k^*$", "$a^* b^*$", "$x_1$"]);
  });

  it("with math under two marks, or in a link under a mark", async () => {
    for (const [markdown, edited] of [
      ["***Theorem: $x_1$ is prime***", "***Theorem: $x_1$ is prime Q***"],
      ["**[see $x_1$ here](u)**", "**[see $x_1$ here Q](u)**"],
      ["~~**see $x_1$ here**~~", "**~~see $x_1$ here Q~~**"],
    ]) {
      const cell = await open(markdown);
      cell.type(" Q", cell.view.state.doc.content.size - 1);
      expect(cell.text()).toBe(edited);
    }
  });

  it("with emphasis around math after a dollar amount, or delimiters in math", async () => {
    for (const [markdown, edited] of [
      ["It costs $5 for **$n$** items.", "It costs $5 for **$n$** items. Thanks"],
      ["Pay $10 and *$x_1$* more, $3 per _$k$_ unit, $5 for ~~$x$~~ now.", "Pay $10 and *$x_1$* more, $3 per _$k$_ unit, $5 for ~~$x$~~ now. Thanks"],
      // In emphasis Milkdown writes the marks apart, which reads the same.
      ["*see $5 for **$n$** here*.", "*see $5 for* ***$n$*** *here*. Thanks"],
      ["**see $a*b*c$ more**", "**see $a*b*c$ more Thanks**"],
    ]) {
      const cell = await open(markdown);
      cell.type(" Thanks", cell.view.state.doc.content.size - 1);
      expect(cell.text()).toBe(edited);
      expect(rendererMath(cell.text())).toEqual(rendererMath(markdown));
    }
  });

  it("with emphasis or code where the renderer reads text that looks like math", async () => {
    // micromark reads emphasis or code there and the renderer no math: the
    // rules would find math across it, which would drop the formatting, and
    // its delimiters with it.
    for (const [markdown, edited] of [
      ["**$*b*c$**", "**$*b*c$ Z**"],
      ["*5 $ *$ $* $a*b*$", "*5 $ *$ $* $a*b*$ Z"],
      ["*a $(**$0**$*", "*a $(**$0**$ Z*"],
      ["*$`$`$ _*o", "*$`$`$ \\_*o Z"],
    ]) {
      const cell = await open(markdown);
      cell.type(" Z", cell.view.state.doc.content.size - 1);
      expect(cell.text()).toBe(edited);
      expect(shownMath(cell.view.state.doc)).toEqual(rendererMath(markdown));
    }
  });

  it("in a table cell the renderer leaves out, once the table is written anew", async () => {
    const cell = await open("| a |\n|---|\n| b | $x_1$ |");
    expect(shownMath(cell.view.state.doc)).toEqual([]);
    cell.type(" Z", after(cell.view.state.doc, "a"));
    // Milkdown writes each row with as many cells as the longest has.
    expect(cell.text()).toContain("| $x_1$ |");
    expect(rendererMath(cell.text())).toEqual(["$x_1$"]);
    expect(shownMath(cell.view.state.doc)).toEqual(["$x_1$"]);
  });

  it("with an image's description as written, while it is the one read", async () => {
    for (const markdown of [
      // With its code span, "$x$$`a$`$" holds no math; without, it would.
      "![$x$$`a$`$~](i.png)",
      'See ![my_plot *a* `c` \\[d\\]](x.png "t") here.',
      "> ![a\nb_c](d) x",
    ]) {
      const cell = await open(markdown);
      cell.type(" Z", lastTextblockEnd(cell.view.state.doc));
      expect(cell.text()).toBe(`${markdown} Z`);
    }
    // A table lines its cells up with the description as written.
    const table = await open("| h |\n|---|\n| ![a\\|b_c](d) |");
    table.type(" Z", after(table.view.state.doc, "h"));
    expect(table.text()).toBe("| h Z          |\n| ------------ |\n| ![a\\|b_c](d) |");
    // Another description is written as Milkdown writes it.
    const image = await open("![a_b](i.png)");
    const { view } = image;
    view.dispatch(view.state.tr.setNodeMarkup(1, undefined, { ...view.state.doc.firstChild!.firstChild!.attrs, alt: "c_d" }));
    expect(image.text()).toBe("![c\\_d](i.png)");
  });

  it("with a link around a dollar amount, and a hard break after a dollar", async () => {
    const markdown = "[*cost* $5](u) and $x_1$.\n\nGiven $\\{a\\}$\\\nthen $y_1$.";
    const cell = await open(markdown);
    cell.type(" Q", cell.view.state.doc.content.size - 1);
    cell.type(" Q", after(cell.view.state.doc, "$x_1$."));
    expect(rendererMath(cell.text())).toEqual(rendererMath(markdown));
    expect(cell.text()).toContain("](u) and $x_1$. Q");
    expect(cell.text()).toContain("}$\\\nthen $y_1$. Q");
  });

  it("in a list item that starts with block math", async () => {
    const cell = await open("1. $$\n   E = mc^2\n   $$\n2. second");
    cell.type(" Q", cell.view.state.doc.content.size - 3);
    expect(cell.text()).toMatch(/^1\. \$\$\n {3}E = mc\^2\n {3}\$\$\n+2\. second Q$/);
  });

  it("keeps Markdown shortcuts outside math", async () => {
    const cell = await open("Text $x$.");
    cell.type(" Some *bold* text.", after(cell.view.state.doc, "Text $x$."));
    expect(cell.text()).toBe("Text $x$. Some *bold* text.");
    let emphasis = "";
    cell.view.state.doc.descendants((node) => {
      if (node.marks.some((mark) => mark.type.name === "emphasis")) emphasis += node.text;
    });
    expect(emphasis).toBe("bold");
  });
});

describe("math while editing", () => {
  it("follows the text: a closing $ makes math, an escape undoes it", async () => {
    const cell = await open("See here.");
    cell.type("$x_i ", after(cell.view.state.doc, "See "));
    expect(mathMask(cell.view.state.doc, "mark")).toBe("See $x_i here.\n");
    cell.type("$", after(cell.view.state.doc, "$x_i"));
    expect(mathMask(cell.view.state.doc, "mark")).toBe("See MMMMM here.\n");
    cell.type("\\", after(cell.view.state.doc, "See "));
    expect(mathMask(cell.view.state.doc, "mark")).toBe("See \\$x_i$ here.\n");
    // Text now, written as Milkdown writes text.
    expect(cell.text()).toBe("See \\$x\\_i$ here.");
  });

  it("keeps formatting around math, and drops formatting that starts inside it", async () => {
    const cell = await open("See $x_i$ here.");
    const { view } = cell;
    const strong = view.state.schema.marks.strong;
    // Bold over the math and more: kept, and written as one.
    view.dispatch(view.state.tr.addMark(after(view.state.doc, "Se"), after(view.state.doc, "her"), strong.create()));
    expect(cell.text()).toBe("Se**e $x_i$ her**e.");
    // Bold from inside the math on: the math has none of it.
    view.dispatch(view.state.tr.removeMark(0, view.state.doc.content.size, strong));
    view.dispatch(view.state.tr.addMark(after(view.state.doc, "$x"), after(view.state.doc, "here"), strong.create()));
    expect(cell.text()).toBe("See $x_i$ **here**.");
  });

  it("leaves the formatting of text that becomes math only for a keystroke", async () => {
    // With "Z" typed before it, the first "$" opens no math, and the rules
    // find math from the next "$" across the bold to the "$" of $ \nu $:
    // taking it would have dropped the bold for good.
    const markdown = "$ \\mu $ is **at least as informative as** $ \\nu $ in the economic sense.";
    const cell = await open(markdown);
    cell.type("Z ", 1);
    expect(cell.text()).toBe(`Z ${markdown}`);
    expect(shownMath(cell.view.state.doc)).toEqual(["$ \\mu $", "$ \\nu $"]);
  });

  it("gives way to inline code over all of it", async () => {
    const cell = await open("See $x_i$ here.");
    const { view } = cell;
    view.dispatch(view.state.tr.addMark(after(view.state.doc, "See "), after(view.state.doc, "$x_i$"), view.state.schema.marks.inlineCode.create()));
    expect(editorMath(view.state.doc)).toEqual([]);
    expect(cell.text()).toBe("See `$x_i$` here.");
  });

  it("keeps a rule that matched back in the text from rewriting the text at the cursor", async () => {
    // Milkdown's strikethrough rule is not anchored to the cursor.
    const cell = await open("Let $a = ~1~$ and more.");
    cell.type(" Q", cell.view.state.doc.content.size - 1);
    expect(cell.text()).toBe("Let $a = ~1~$ and more. Q");
  });

  it("is taken back by undo with the typing that made it", async () => {
    const cell = await open("Text.");
    cell.type(" $x$", after(cell.view.state.doc, "Text."));
    expect(cell.text()).toBe("Text. $x$");
    undo(cell.view.state, cell.view.dispatch);
    expect(cell.view.state.doc.textContent).toBe("Text.");
    expect(cell.text()).toBe("Text.");
  });

  it("keeps a math block's source as typed, blank lines and all", async () => {
    const cell = await open("$$\na &= b\n$$\n\nAfter.");
    cell.type(" \\\\\n\nc_1 &= d^*", after(cell.view.state.doc, "a &= b"));
    expect(cell.text()).toBe("$$\na &= b \\\\\n\nc_1 &= d^*\n$$\n\nAfter.");
  });

  it("starts a math block with Enter after \"$$\" alone in a paragraph", async () => {
    const cell = await open("Intro.\n\n$$");
    const { view } = cell;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, lastTextblockEnd(view.state.doc))));
    expect(view.someProp("handleKeyDown", (f) => f(view, new KeyboardEvent("keydown", { key: "Enter" })))).toBe(true);
    expect(blocks(view.state.doc)).toBe("doc(paragraph math_block)");
    cell.type("E = mc^2");
    expect(view.state.doc.lastChild!.textContent).toBe("$$\nE = mc^2\n$$");
    expect(cell.text()).toBe("Intro.\n\n$$\nE = mc^2\n$$");
    expect(rendererMath(cell.text())).toEqual(["$$\nE = mc^2\n$$"]);
    // Undo takes back the block and the typing, leaving the "$$".
    while (undo(view.state, view.dispatch));
    expect(cell.text()).toBe("Intro.\n\n$$");
  });

  it("starts a math block after a list item's first paragraph, which stays", async () => {
    const cell = await open("- $$");
    const { view } = cell;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, lastTextblockEnd(view.state.doc))));
    expect(view.someProp("handleKeyDown", (f) => f(view, new KeyboardEvent("keydown", { key: "Enter" })))).toBe(true);
    expect(blocks(view.state.doc)).toBe("doc(bullet_list(list_item(paragraph math_block)))");
    cell.type("x");
    expect(cell.text()).toMatch(/^[-*] \$\$\n {2}x\n {2}\$\$$/);
    expect(rendererMath(cell.text())).toEqual(["$$\nx\n$$"]);
  });

  it("leaves Enter as it is after \"$$\" with more in the paragraph or a single \"$\", and Shift+Enter after \"$$\"", async () => {
    // A task item cannot start with block math: its checkbox is written only before a paragraph.
    const cases = [["a $$", {}], ["$$ a", {}], ["$", {}], ["**$$**", {}], ["$$", { shiftKey: true }], ["- [x] $$", {}], ["- [ ] $$", {}]] as const;
    for (const [markdown, init] of cases) {
      const cell = await open(markdown);
      const { view } = cell;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, lastTextblockEnd(view.state.doc))));
      view.someProp("handleKeyDown", (f) => f(view, new KeyboardEvent("keydown", { key: "Enter", ...init })));
      expect(blocks(view.state.doc), markdown).not.toContain("math_block");
    }
  });

  it("leaves a math block with the arrow keys and comes back with Backspace", async () => {
    const cell = await open("$$\nx\n$$");
    const { view } = cell;
    const key = (name: string) => view.someProp("handleKeyDown", (f) => f(view, new KeyboardEvent("keydown", { key: name })));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after(view.state.doc, "$$\nx\n$$"))));
    expect(key("ArrowDown")).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.selection.$head.parent.type.name).toBe("paragraph");
    expect(key("Backspace")).toBe(true);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.selection.$head.parent.type.name).toBe("math_block");
  });
});

// --- Untouched text ---------------------------------------------------------

const UNTOUCHED = [
  "Heading",
  "=======",
  "",
  "- tight",
  "- list",
  "",
  "| a | b |",
  "|---|:-:|",
  "| 1 | $x_1$ |",
  "",
  "snake_case, &amp;, a hard  ",
  "break and [docs][d].",
  "",
  "[d]: https://example.com",
  "",
  "Last paragraph.",
].join("\n");

describe("untouched blocks come back as they were", () => {
  it("when one paragraph changes", async () => {
    const cell = await open(UNTOUCHED);
    cell.type(" Edited.", after(cell.view.state.doc, "Last paragraph."));
    expect(cell.text()).toBe(`${UNTOUCHED} Edited.`);
    // What Milkdown would have written instead.
    expect(cell.markdown()).not.toContain("- tight\n- list");
  });

  it("when a paragraph is added or removed", async () => {
    const cell = await open(UNTOUCHED);
    const { view } = cell;
    const paragraph = (text: string) => view.state.schema.nodes.paragraph.create(null, view.state.schema.text(text));
    view.dispatch(view.state.tr.insert(view.state.doc.child(0).nodeSize, paragraph("New $y_j$ paragraph.")));
    expect(cell.text()).toBe(UNTOUCHED.replace("=======\n", "=======\n\nNew $y_j$ paragraph.\n"));
    const last = view.state.doc.child(view.state.doc.childCount - 1);
    view.dispatch(view.state.tr.delete(view.state.doc.content.size - last.nodeSize, view.state.doc.content.size));
    expect(cell.text()).toBe(UNTOUCHED.replace("=======\n", "=======\n\nNew $y_j$ paragraph.\n").replace(/\n\nLast paragraph\.$/, ""));
  });

  it("when the paragraph that changes refers to a footnote defined in one that did not", async () => {
    const markdown = "First para.[^1]\n\n[^1]: The note.\n\n- tight\n- list\n\nsnake_case and *stars*";
    const cell = await open(markdown);
    cell.type(" Edited.", cell.view.state.doc.child(0).nodeSize - 1);
    expect(cell.text()).toBe(markdown.replace("[^1]\n", "[^1] Edited.\n"));
    // And the other way round: the definition changes.
    cell.type(" More.", after(cell.view.state.doc, "The note."));
    expect(cell.text()).toBe(markdown.replace("[^1]\n", "[^1] Edited.\n").replace("The note.", "The note. More."));
  });

  it("with the math they were read with", async () => {
    // The rules find other math in the list item than the parser did, and
    // an edit elsewhere leaves the item as it was read.
    const markdown = "a\n- *\\\n$~~**$~$~~`$``$.$$$$$$`";
    const cell = await open(markdown);
    cell.type(" Z", after(cell.view.state.doc, "a"));
    expect(cell.text()).toBe("a Z\n- *\\\n$~~**$~$~~`$``$.$$$$$$`");
  });

  it("changed back to how it opened, gives back the cell's text", async () => {
    const cell = await open(UNTOUCHED);
    cell.type("X", after(cell.view.state.doc, "Last"));
    expect(cell.text()).toBe(UNTOUCHED.replace("Last", "LastX"));
    undo(cell.view.state, cell.view.dispatch);
    expect(cell.text()).toBe(UNTOUCHED);
  });

  it("unless they would read differently next to the change", async () => {
    // Without the paragraph between them, the two lists would become one.
    const cell = await open("- a $x$\n\nBetween.\n\n- b");
    const { view } = cell;
    const between = view.state.doc.child(1);
    const start = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.delete(start, start + between.nodeSize));
    expect(cell.text()).toBe(cell.markdown());
    expect(cell.text()).toContain("$x$");
  });
});

// --- Blocks next to math ------------------------------------------------------

/** The blocks of a document, nested, without their text. */
function blocks(node: Node): string {
  const inner: string[] = [];
  node.forEach((child) => {
    if (!child.isInline) inner.push(blocks(child));
  });
  return inner.length > 0 ? `${node.type.name}(${inner.join(" ")})` : node.type.name;
}

describe("a line of $ or $$ that opens no block math", () => {
  it.each([
    ["$$\n- item", "doc(paragraph bullet_list(list_item(paragraph)))"],
    ["$\n1. item", "doc(paragraph ordered_list(list_item(paragraph)))"],
    ["$$\n> quote", "doc(paragraph blockquote(paragraph))"],
    ["- x\n\n  $$\n  - nested", "doc(bullet_list(list_item(paragraph paragraph bullet_list(list_item(paragraph)))))"],
    ["> $$\n> - a", "doc(blockquote(paragraph bullet_list(list_item(paragraph))))"],
  ])("leaves the list or quote after it as the renderer reads it: %j", async (markdown, expected) => {
    const { view } = await open(markdown);
    expect(blocks(view.state.doc)).toBe(expected);
  });

  it("keeps the list a list through an edit", async () => {
    const cell = await open("$\n* apples\n* pears\n\n$$\n> A quote");
    cell.type(" and plums", after(cell.view.state.doc, "pears"));
    // Milkdown spaces out the list it writes (markdownWriteBack.ts).
    expect(cell.text()).toMatch(/^\$\n\* apples\n+\* pears and plums\n\n\$\$\n> A quote$/);
  });

  it("leaves the list after a run of them that each keep the next one from being tried", async () => {
    const cell = await open(`${"$\n> # \\\n".repeat(8)}$\n- item`);
    expect(blocks(cell.view.state.doc)).toMatch(/bullet_list\(list_item\(paragraph\)\)\)$/);
    cell.type("Z", lastTextblockEnd(cell.view.state.doc));
    expect(cell.text()).toMatch(/\n[-*] itemZ$/);
  });

  it("is block math once its closing fence comes, lines like list items and quotes and all", async () => {
    const { view } = await open("$$\na\n- b\n> c\n1. d\n$$");
    expect(blocks(view.state.doc)).toBe("doc(math_block)");
  });
});

/** The blocks the renderer reads in `markdown`, nested: a table by its number of body rows. */
function rendererBlocks(markdown: string): string {
  const marked = new Marked();
  marked.use({ extensions: mathExtensions(() => "") });
  const walk = (tokens: any[]): string =>
    tokens
      .filter((token) => token.type !== "space")
      .map((token) => {
        if (token.type === "table") return `table[${token.rows.length}]`;
        if (token.type === "blockquote") return `blockquote(${walk(token.tokens)})`;
        if (token.type === "list") return `list(${token.items.map((item: any) => walk(item.tokens)).join(" | ")})`;
        return token.type;
      })
      .join(" ");
  return walk(marked.lexer(markdown));
}

describe("after an edit a cell keeps the Markdown around its math", () => {
  it.each(["\\- $$a$$", "\\# $$a$$", "1\\. $x$ b", "\\> $x$ b", "|\n    \\- $$a$$"])("the escape of a marker before math: %j", async (markdown) => {
    const cell = await open(markdown);
    cell.type("Z", lastTextblockEnd(cell.view.state.doc));
    expect(rendererBlocks(cell.text())).toBe(rendererBlocks(markdown));
    expect(cell.text()).toMatch(/\\[-#.>]/);
  });

  it("a footnote definition that holds block math and HTML", async () => {
    const markdown = "r\n\n[^a]: $$\n    x\n    $$\n    <a>";
    const cell = await open(markdown);
    expect(blocks(cell.view.state.doc)).toBe("doc(paragraph footnote_definition(math_block paragraph))");
    cell.type("Z", after(cell.view.state.doc, "r"));
    expect(cell.text()).toBe(markdown.replace("r", "rZ"));
  });

  it("a table's rows that start with $", async () => {
    for (const markdown of ["a\n-:\n$\n \n$", "| a |\n|---|\n$$\nx\n$$"]) {
      const cell = await open(markdown);
      cell.type("Z", after(cell.view.state.doc, "a"));
      expect(rendererBlocks(cell.text()), JSON.stringify(markdown)).toBe(rendererBlocks(markdown));
    }
  });

  it("an underline-like line of math indented once, however often the cell is edited", async () => {
    for (const [first, last] of [
      [">$$\n=\n$$", "> $$\n>     =\n> $$ZZZ"],
      [">$$a\n-:\nb$$", "> $$a\n>     -:\n> b$$ZZZ"],
      // Indented four spaces already: left as it is.
      ["> $$a\n>     ---\n> b$$", "> $$a\n>     ---\n> b$$ZZZ"],
      // A tab after "> " is less than four columns.
      ["> $$a\n\t===\nb$$", "> $$a\n>     \t===\n> b$$ZZZ"],
    ]) {
      let markdown = first;
      for (let edit = 0; edit < 3; edit++) {
        const cell = await open(markdown);
        cell.type("Z", lastTextblockEnd(cell.view.state.doc));
        markdown = cell.text();
      }
      expect(markdown, JSON.stringify(first)).toBe(last);
      expect(rendererBlocks(markdown), JSON.stringify(first)).toBe("blockquote(paragraph)");
    }
  });

  it("a paragraph moved out of its quote with a line of math that would underline it", async () => {
    const cell = await open("Intro.\n\n> $$a\n===\nb$$");
    cell.view.dispatch(cell.view.state.tr.setSelection(TextSelection.create(cell.view.state.doc, lastTextblockEnd(cell.view.state.doc))));
    expect(lift(cell.view.state, cell.view.dispatch)).toBe(true);
    expect(rendererBlocks(cell.text())).toBe("paragraph paragraph");
    expect(rendererMath(cell.text()).map((raw) => raw.replace(/\s+/g, " "))).toEqual(["$$a === b$$"]);
  });

  it("an underline-like line of math as it is outside quotes and list items, where it was read so", async () => {
    for (const markdown of ["b $$\nx\n-|-\n$$", "$$$\n| a | b |\n| :-: |\n$$"]) {
      const cell = await open(markdown);
      cell.type("Z", lastTextblockEnd(cell.view.state.doc));
      expect(cell.text(), JSON.stringify(markdown)).toBe(`${markdown}Z`);
    }
  });

  it("a line of math that would read as an underline after its quote's prefix, which a lazy line has none of", async () => {
    for (const markdown of [">$$\n=\n$$", ">$$\n-|\n$$"]) {
      const cell = await open(markdown);
      cell.type("Z", lastTextblockEnd(cell.view.state.doc));
      expect(rendererBlocks(cell.text()), JSON.stringify(markdown)).toBe(rendererBlocks(markdown));
      expect(rendererMath(cell.text()).map((raw) => raw.replace(/\s+/g, " "))).toEqual(rendererMath(markdown).map((raw) => raw.replace(/\s+/g, " ")));
    }
  });
});
