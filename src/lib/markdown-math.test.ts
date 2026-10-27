import { describe, expect, test } from "vitest";
import { Marked } from "marked";
import { inlineMathStart, mathExtensions } from "./markdown-math";

const render = (markdown: string) => {
  const md = new Marked();
  md.use({ extensions: mathExtensions((token) => `<m${token.displayMode ? " display" : ""}>${token.text}</m>`) });
  return md.parse(markdown, { async: false }).trim();
};

describe("inline math", () => {
  test("starts at the beginning or after any whitespace", () => {
    expect(inlineMathStart("$x$ a")).toBe(0);
    expect(inlineMathStart("a $x$")).toBe(2);
    expect(inlineMathStart("a\n$x$")).toBe(2);
    expect(inlineMathStart("a\t$x$")).toBe(2);
    expect(render("The area is\n$a^2$ here.")).toBe("<p>The area is\n<m>a^2</m> here.</p>");
  });

  test("needs whitespace before it and a closing $ before whitespace or punctuation", () => {
    expect(inlineMathStart("a$x$ b")).toBeUndefined();
    expect(render("It costs $5 and $10 more.")).toBe("<p>It costs $5 and $10 more.</p>");
    expect(render("Values ($x$) and $y$, then $z$.")).toBe("<p>Values ($x$) and <m>y</m>, then <m>z</m>.</p>");
  });

  test("needs whitespace before it wherever marked tries it", () => {
    // marked tries math one character into text, and right after any token.
    expect(render("a$x$ b")).toBe("<p>a$x$ b</p>");
    expect(render("($x$ y)")).toBe("<p>($x$ y)</p>");
    expect(render("*b*$x$ and a*$x$ b")).toBe("<p><em>b</em>$x$ and a*$x$ b</p>");
    expect(render("\\\\$x$ b")).toBe("<p>\\$x$ b</p>");
    expect(render("a  \n$x$ b")).toBe("<p>a<br><m>x</m> b</p>");
  });

  test("the text inside emphasis, links and strikethrough is a run of its own", () => {
    expect(render("**$x$**, *see $y$*, [$z$](u) and ~~$w$~~")).toBe(
      '<p><strong><m>x</m></strong>, <em>see <m>y</m></em>, <a href="u"><m>z</m></a> and <del><m>w</m></del></p>',
    );
    // Emphasis read first holds the math that opens inside it.
    expect(render("*Price: $5* plus $x$")).toBe("<p><em>Price: $5</em> plus <m>x</m></p>");
  });

  test("reports the index in the text it was given, past dollars that open nothing", () => {
    // marked-katex-extension returned an index into a trimmed copy here.
    expect(inlineMathStart("a$b c $x$")).toBe(6);
    // A span may hold "$" ("$5 and $x$" is one span) but not a line break.
    expect(inlineMathStart("$5 and $x$")).toBe(0);
    expect(inlineMathStart("$5 and\n$x$")).toBe(7);
  });

  test("cannot span lines, and $$...$$ anywhere is display math", () => {
    expect(render("a $x\ny$ b")).toBe("<p>a $x\ny$ b</p>");
    expect(render("a$$x$$b")).toBe("<p>a<m display>x</m>b</p>");
    expect(render("$$\nx\n$$")).toBe("<m display>x</m>");
  });
});
