import { afterEach, describe, expect, test, vi } from "vitest";
import { componentSnippet } from "../lib/export/component-export";
import type { CellOptions } from "./types";

// <pynote-cell>, with the runtime replaced by a recorder: each mount waits
// until the test lets it finish, as the runtime's download makes it wait.

interface Mount {
  host: HTMLElement;
  options: CellOptions;
  handle: { update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  finish: () => void;
}

const mounts = vi.hoisted(() => [] as Mount[]);

vi.mock("./bridge", () => ({
  configure: vi.fn(),
  mountWhenReady: vi.fn(
    (host: HTMLElement, options: CellOptions) =>
      new Promise((resolve) => {
        const handle = { update: vi.fn(), destroy: vi.fn() };
        mounts.push({ host, options, handle, finish: () => resolve(handle) });
      }),
  ),
}));

const { BOOLEAN_ATTRIBUTES, cellOptions } = await import("./element");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
  mounts.length = 0;
});

describe("<pynote-cell>", () => {
  test("names every option, an absent attribute as undefined (the default)", () => {
    const element = document.createElement("pynote-cell");
    element.setAttribute("code", "x = 1");
    element.setAttribute("editable", "false");
    element.setAttribute("show-code", "");
    // Present but undefined (toStrictEqual), so that removing an attribute resets its option.
    expect(cellOptions(element)).toStrictEqual({
      code: "x = 1",
      id: undefined,
      editable: false,
      menu: undefined,
      autorun: undefined,
      showCode: true,
      showStdout: undefined,
      showStderr: undefined,
      showResult: undefined,
      showError: undefined,
      showStatusDot: undefined,
      visibilityToggle: undefined,
    });
  });

  test("takes every option but the code and the id as an attribute of the same name in kebab case", async () => {
    // <PyNoteCell> for Astro writes its props as these (packages/pynote/astro/PyNoteCell.astro).
    const { allCellOptions } = await vi.importActual<typeof import("./bridge")>("./bridge");
    const options = Object.keys(allCellOptions({ code: "" })).filter((name) => name !== "code" && name !== "id");
    expect(Object.values(BOOLEAN_ATTRIBUTES).sort()).toEqual(options.sort());
    for (const [attribute, option] of Object.entries(BOOLEAN_ATTRIBUTES)) {
      expect(attribute).toBe(option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      const element = document.createElement("pynote-cell");
      element.setAttribute(attribute, "false");
      expect(cellOptions(element)[option], option).toBe(false);
    }
  });

  test("applies attributes set while the runtime loads", async () => {
    const element = document.createElement("pynote-cell");
    element.setAttribute("cell-id", "late");
    document.body.append(element);
    element.setAttribute("code", "print('late')");
    element.setAttribute("show-code", "false");
    expect(mounts).toHaveLength(1);
    expect(mounts[0].options.code).toBe("");
    mounts[0].finish();
    await settle();
    expect(mounts[0].handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ code: "print('late')", showCode: false }));
  });

  test("keeps its cell when it moves on the page, and lets it go when removed", async () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const element = document.createElement("pynote-cell");
    element.setAttribute("code", "x = 1");
    first.append(element);
    mounts[0].finish();
    await settle();
    const { handle } = mounts[0];

    second.append(element); // moved: disconnected, then connected again
    await settle();
    expect(handle.destroy).not.toHaveBeenCalled();
    expect(mounts).toHaveLength(1);
    // Once when the mount finished, once more when connected again: the cell takes its new place.
    expect(handle.update).toHaveBeenCalledTimes(2);

    element.remove();
    await settle();
    expect(handle.destroy).toHaveBeenCalledTimes(1);

    // Added back later: a new cell.
    second.append(element);
    expect(mounts).toHaveLength(2);
  });

  test("reads the cells of the Export dialog's HTML example back as their code, however the example is indented", () => {
    const code = ["x = 21", "import math\n\ndef area(r):\n    return math.pi * r ** 2", 'page = """\n</script>\n"""', "if x < 3 and x > 1:\n\tprint('a & b')"];
    const snippet = componentSnippet("html", null, code);
    // As printed (the CLI indents every line), and as pasted into indented markup.
    for (const indent of ["", "  ", "\t\t"]) {
      const container = document.createElement("div");
      container.innerHTML = snippet.replace(/^(?=.)/gm, indent);
      expect([...container.querySelectorAll("pynote-cell")].map((cell) => cellOptions(cell).code), JSON.stringify(indent)).toEqual(code);
    }
  });
});
