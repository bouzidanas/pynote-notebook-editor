import { afterEach, describe, expect, test } from "vitest";
import { composedOrder } from "./order";

// The notebook's cell order follows the composed tree: what a reader sees,
// shadow roots and slots included.

afterEach(() => document.body.replaceChildren());

const cell = (id: string) => Object.assign(document.createElement("pynote-cell"), { id });
const shadowHost = (html: string) => {
  const host = document.createElement("div");
  host.attachShadow({ mode: "open" }).innerHTML = html;
  return host;
};
/** The cells, sorted the way the runtime orders them. */
const order = (...cells: Element[]) => [...cells].sort(composedOrder(cells)).map((c) => c.id);
/** The order of two nodes on their own. */
const compare = (a: Node, b: Node) => composedOrder([a, b])(a, b);

describe("cells in the composed tree", () => {
  test("in one tree, document order", () => {
    const [a, b, c] = [cell("a"), cell("b"), cell("c")];
    const section = document.createElement("section");
    section.append(b);
    document.body.append(a, section, c);
    expect(order(c, b, a)).toEqual(["a", "b", "c"]);
    expect(compare(a, a)).toBe(0);
  });

  test("a cell inside a component's shadow root, between two others, comes between them", () => {
    const component = shadowHost('<aside><pynote-cell id="middle"></pynote-cell></aside>');
    const middle = component.shadowRoot!.getElementById("middle")!;
    const [first, last] = [cell("first"), cell("last")];
    document.body.append(first, component, last);
    expect(order(last, middle, first)).toEqual(["first", "middle", "last"]);
    expect(compare(middle, first)).toBeGreaterThan(0);
    expect(compare(middle, last)).toBeLessThan(0);
  });

  test("in shadow roots inside shadow roots", () => {
    const outer = shadowHost('<pynote-cell id="b"></pynote-cell><div id="inner"></div><pynote-cell id="d"></pynote-cell>');
    const inner = outer.shadowRoot!.getElementById("inner")!;
    inner.attachShadow({ mode: "open" }).innerHTML = '<pynote-cell id="c"></pynote-cell>';
    document.body.append(cell("a"), outer, cell("e"));
    const all = [...document.querySelectorAll("pynote-cell"), ...outer.shadowRoot!.querySelectorAll("pynote-cell"), inner.shadowRoot!.querySelector("pynote-cell")!];
    expect(order(...all.reverse())).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("a slotted cell stands at its slot, and named slots set the order", () => {
    const component = shadowHost('<pynote-cell id="intro"></pynote-cell><slot name="first"></slot><slot name="second"></slot><pynote-cell id="outro"></pynote-cell>');
    const [second, first] = [cell("second"), cell("first")];
    second.slot = "second";
    first.slot = "first";
    component.append(second, first);
    document.body.append(component);
    const [intro, outro] = [...component.shadowRoot!.querySelectorAll("pynote-cell")];
    expect(order(outro, second, first, intro)).toEqual(["intro", "first", "second", "outro"]);
  });

  test("a slot's fallback content comes after what it shows, a child no slot shows after the shadow root's content", () => {
    const component = shadowHost('<slot><pynote-cell id="fallback"></pynote-cell></slot><pynote-cell id="shadow"></pynote-cell>');
    const [shown, unslotted] = [cell("shown"), cell("unslotted")];
    unslotted.slot = "nowhere";
    component.append(unslotted, shown);
    document.body.append(component);
    const fallback = component.shadowRoot!.getElementById("fallback")!;
    const shadow = component.shadowRoot!.getElementById("shadow")!;
    expect(order(unslotted, shadow, fallback, shown)).toEqual(["shown", "fallback", "shadow", "unslotted"]);
  });

  describe("a closed shadow root (assignedSlot is null outside it)", () => {
    const closedHost = (html: string) => {
      const host = document.createElement("div");
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = html;
      return { host, root };
    };

    test("a cell passed to its slot stands at the slot, among the root's own cells", () => {
      const panel = closedHost('<section><slot></slot><pynote-cell id="inside"></pynote-cell></section>');
      const [first, slotted, last] = [cell("first"), cell("slotted"), cell("last")];
      panel.host.append(slotted);
      document.body.append(first, panel.host, last);
      expect(slotted.assignedSlot).toBeNull();
      expect(order(last, panel.root.getElementById("inside")!, slotted, first)).toEqual(["first", "slotted", "inside", "last"]);
    });

    test("named slots set the order of the cells passed to them", () => {
      const panel = closedHost('<pynote-cell id="intro"></pynote-cell><slot name="second"></slot><slot name="first"></slot>');
      const [first, second] = [cell("first"), cell("second")];
      first.slot = "first";
      second.slot = "second";
      panel.host.append(first, second);
      document.body.append(panel.host);
      expect(order(first, second, panel.root.getElementById("intro")!)).toEqual(["intro", "second", "first"]);
    });

    test("from a cell in a shadow root inside it", () => {
      const panel = closedHost('<slot></slot><div id="inner"></div>');
      panel.root.getElementById("inner")!.attachShadow({ mode: "open" }).innerHTML = '<pynote-cell id="deep"></pynote-cell>';
      const slotted = cell("slotted");
      panel.host.append(slotted);
      document.body.append(panel.host);
      const deep = panel.root.getElementById("inner")!.shadowRoot!.getElementById("deep")!;
      expect(order(deep, slotted)).toEqual(["slotted", "deep"]);
    });

    test("with no cell inside, it cannot be read: the cells passed to it keep the page's order, where its host is", () => {
      const panel = closedHost('<slot name="second"></slot><slot name="first"></slot>');
      const [before, first, second, after] = [cell("before"), cell("first"), cell("second"), cell("after")];
      first.slot = "first";
      second.slot = "second";
      panel.host.append(first, second);
      document.body.append(before, panel.host, after);
      expect(order(after, second, first, before)).toEqual(["before", "first", "second", "after"]);
    });
  });

  test("an element out of the page has no place", () => {
    const [placed, removed] = [cell("placed"), cell("removed")];
    document.body.append(placed);
    expect(compare(placed, removed)).toBe(0);
    expect(compare(removed, placed)).toBe(0);
  });

  test("a container comes before what it contains", () => {
    const component = shadowHost('<pynote-cell id="inside"></pynote-cell>');
    document.body.append(component);
    const inside = component.shadowRoot!.getElementById("inside")!;
    expect(compare(component, inside)).toBeLessThan(0);
    expect(compare(inside, component)).toBeGreaterThan(0);
  });
});
