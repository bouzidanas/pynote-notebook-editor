import { afterEach, describe, expect, test } from "vitest";
import { KEY_EVENTS, keepTypingInCell } from "./keys";

// What a page hears of the keys pressed in a cell (its shadow root has the
// runtime's listener): nothing typed into a field, the rest as from a field.

afterEach(() => document.body.replaceChildren());

/** A cell's shadow root with a code editor, a widget's input and a button; the keys that reach the page. */
function cell() {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<div class="cm-content" contenteditable="true"></div><input type="text"><button type="button">Run</button>';
  // jsdom leaves isContentEditable out; browsers have it.
  Object.defineProperty(root.querySelector(".cm-content"), "isContentEditable", { value: true });
  for (const type of KEY_EVENTS) root.addEventListener(type, keepTypingInCell);
  document.body.append(host);
  const heard: string[] = [];
  for (const type of KEY_EVENTS) document.addEventListener(type, (e) => heard.push(`${type} ${(e as KeyboardEvent).key}`));
  const press = (selector: string, init: KeyboardEventInit, type = "keydown", handled = false) => {
    const target = root.querySelector(selector)!;
    const event = new KeyboardEvent(type, { bubbles: true, composed: true, cancelable: true, ...init });
    if (handled) target.addEventListener(type, (e) => e.preventDefault(), { once: true });
    target.dispatchEvent(event);
  };
  return { heard, press };
}

describe("keys pressed in a cell", () => {
  test("typed into code or a widget's field, they stay in the cell", () => {
    const { heard, press } = cell();
    for (const selector of [".cm-content", "input"]) {
      for (const type of KEY_EVENTS) for (const key of ["s", "/", "ArrowRight", "Enter", " "]) press(selector, { key }, type);
      press(selector, { key: "S", shiftKey: true });
      press(selector, { key: "@", ctrlKey: true, altKey: true, modifierAltGraph: true } as KeyboardEventInit);
    }
    expect(heard).toEqual([]);
  });

  test("the cell's own shortcuts stay in the cell", () => {
    const { heard, press } = cell();
    press(".cm-content", { key: "Enter", ctrlKey: true }, "keydown", true);
    press(".cm-content", { key: "/", metaKey: true }, "keydown", true);
    press(".cm-content", { key: "Escape" }, "keydown", true);
    expect(heard).toEqual([]);
  });

  test("Escape, Tab and Ctrl or Cmd shortcuts the cell leaves alone reach the page, as from any text field", () => {
    const { heard, press } = cell();
    press(".cm-content", { key: "k", ctrlKey: true });
    press("input", { key: "k", metaKey: true });
    press("input", { key: "Tab" });
    press(".cm-content", { key: "Escape" }, "keyup");
    expect(heard).toEqual(["keydown k", "keydown k", "keydown Tab", "keyup Escape"]);
  });

  test("pressed outside a field (a button of the cell), they reach the page, as they would from a button of the page", () => {
    const { heard, press } = cell();
    press("button", { key: "/" });
    expect(heard).toEqual(["keydown /"]);
  });
});
