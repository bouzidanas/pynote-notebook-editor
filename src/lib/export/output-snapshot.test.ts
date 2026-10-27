import { describe, expect, it } from "vitest";
import { snapshotOutputs } from "./output-snapshot";
import { MARKER_UI_END, MARKER_UI_START, UI_MIME } from "../output-markers";
import type { CellData } from "../store";

const ui = (json: unknown) => `${MARKER_UI_START}${JSON.stringify(json)}${MARKER_UI_END}`;

describe("snapshotOutputs", () => {
  const slider = { id: "s1", type: "Slider", props: { value: 10, min: 0, max: 100 } };
  const text = { id: "t1", type: "Text", props: { content: "10%" } };
  const group = { id: "g1", type: "Group", props: { children: [slider, text], layout: "row" } };
  const cells: CellData[] = [
    { id: "md", type: "markdown", content: "# x" },
    { id: "c0", type: "code", content: "" }, // never ran
    { id: "c1", type: "code", content: "", outputs: { stdout: ["before ", ui(group), " after\n"], stderr: [] } },
    { id: "c2", type: "code", content: "", outputs: { stdout: [], stderr: [], mimebundle: { [UI_MIME]: text, "text/plain": "Text()" } } },
  ];
  const current: Record<string, Record<string, unknown>> = {
    s1: { value: 75, min: 0, max: 100 },
    t1: { content: "75%" },
  };
  const snapshots = snapshotOutputs(cells, (id) => current[id]);

  it("covers only code cells that have run", () => {
    expect(Object.keys(snapshots)).toEqual(["c1", "c2"]);
  });

  it("patches components printed to stdout, including nested children", () => {
    const printed = snapshots.c1.stdout.join("");
    expect(printed.startsWith("before ")).toBe(true);
    expect(printed.endsWith(" after\n")).toBe(true);
    const json = JSON.parse(printed.slice(printed.indexOf(MARKER_UI_START) + MARKER_UI_START.length, printed.indexOf(MARKER_UI_END)));
    expect(json.props.layout).toBe("row");
    expect(json.props.children.map((c: any) => c.props)).toEqual([{ value: 75, min: 0, max: 100 }, { content: "75%" }]);
  });

  it("patches the component a cell returned", () => {
    expect(snapshots.c2.mimebundle[UI_MIME].props).toEqual({ content: "75%" });
    expect(snapshots.c2.mimebundle["text/plain"]).toBe("Text()");
  });

  it("leaves the notebook's own outputs untouched", () => {
    expect(cells[3].outputs!.mimebundle[UI_MIME].props).toEqual({ content: "10%" });
  });

  it("keeps components that report no snapshot as they were", () => {
    const out = snapshotOutputs(cells, () => undefined);
    expect(out.c2.mimebundle[UI_MIME].props).toEqual({ content: "10%" });
  });

  it("reads a component printed in several writes as one", () => {
    const printed = ui(slider);
    const split = printed.indexOf('"value"');
    const out = snapshotOutputs(
      [{ id: "c", type: "code", content: "", outputs: { stdout: ["a\n", printed.slice(0, split), printed.slice(split), "b\n"], stderr: [] } }],
      (id) => current[id],
    );
    expect(out.c.stdout.join("")).toBe(`a\n${ui({ ...slider, props: current.s1 })}b\n`);
  });
});

describe("snapshotOutputs and passwords", () => {
  const SECRET = "sk-live-SECRET-0042";
  const password = (id: string, props: Record<string, unknown> = {}) => ({
    id,
    type: "Input",
    props: { value: "", placeholder: "API key", input_type: "password", ...props },
  });
  const exported = (cells: CellData[], snapshots: Record<string, Record<string, unknown>> = {}) =>
    JSON.stringify(snapshotOutputs(cells, (id) => snapshots[id]));

  it("leaves out what a reader typed into a password field", () => {
    const cells: CellData[] = [{ id: "c", type: "code", content: "", outputs: { stdout: [], stderr: [], mimebundle: { [UI_MIME]: password("p1") } } }];
    const out = snapshotOutputs(cells, (id) => (id === "p1" ? { ...password("p1").props, value: SECRET } : undefined));
    expect(out.c.mimebundle[UI_MIME].props).toEqual({ value: "", placeholder: "API key", input_type: "password" });
    expect(exported(cells, { p1: { ...password("p1").props, value: SECRET } })).not.toContain(SECRET);
  });

  it("leaves out a value Python set or stored, printed or returned, nested or not", () => {
    // Python keeps a typed value in the component's props, so printing the
    // component again carries it; so does one created with a value.
    const nested = { id: "f1", type: "Form", props: { children: [{ id: "g1", type: "Group", props: { children: [password("p3", { value: SECRET })] } }] } };
    const cells: CellData[] = [
      { id: "c1", type: "code", content: "", outputs: { stdout: [ui(password("p1", { value: SECRET })), "\n"], stderr: [], mimebundle: { [UI_MIME]: password("p2", { value: SECRET }) } } },
      { id: "c2", type: "code", content: "", outputs: { stdout: [ui(nested)], stderr: [] } },
      // Printed to stderr, a component shows as its text.
      { id: "c3", type: "code", content: "", outputs: { stdout: [], stderr: [`oops ${ui(password("p4", { value: SECRET }))}\n`] } },
    ];
    expect(exported(cells)).not.toContain(SECRET);
    // Python set it while the component showed it.
    expect(exported(cells, { p2: { ...password("p2").props, value: `${SECRET}-2` } })).not.toContain(SECRET);
    const out = snapshotOutputs(cells, () => undefined);
    expect(out.c3.stderr).toEqual([`oops ${ui(password("p4"))}\n`]);
  });

  it("knows a password field by its type in any case, now or when created", () => {
    for (const inputType of ["PASSWORD", " Password "]) {
      const cells: CellData[] = [{ id: "c", type: "code", content: "", outputs: { stdout: [], stderr: [], mimebundle: { [UI_MIME]: password("p", { input_type: inputType, value: SECRET }) } } }];
      expect(exported(cells)).not.toContain(SECRET);
    }
    // Created as a password field and shown as text later, or the other way round.
    const created = (inputType: string): CellData[] => [
      { id: "c", type: "code", content: "", outputs: { stdout: [], stderr: [], mimebundle: { [UI_MIME]: password("p", { input_type: inputType }) } } },
    ];
    expect(exported(created("password"), { p: { input_type: "text", value: SECRET } })).not.toContain(SECRET);
    expect(exported(created("text"), { p: { input_type: "password", value: SECRET } })).not.toContain(SECRET);
  });

  it("leaves it out of the text of a result or a traceback, and keeps any other text exactly as printed", () => {
    // A cell's result shows str() of what it returned, and an exception's
    // message can hold a component: its JSON, written by Python.
    const printed = (json: unknown) => `${MARKER_UI_START}${JSON.stringify(json).replace(/,"/g, ', "').replace(/":/g, '": ')}${MARKER_UI_END}`;
    const slider = { id: "s", type: "Slider", props: { value: 3 } };
    const cells: CellData[] = [
      { id: "c", type: "code", content: "", outputs: { stdout: [], stderr: [`${printed(slider)}\n`], result: printed(password("p", { value: SECRET })), error: `Traceback (most recent call last):\nValueError: ${printed(password("q", { value: SECRET }))}` } },
    ];
    const out = snapshotOutputs(cells, () => ({ value: 9 }));
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out.c.result).toBe(ui(password("p")));
    expect(out.c.error).toBe(`Traceback (most recent call last):\nValueError: ${ui(password("q"))}`);
    // Text shows the component as printed, not as it is now.
    expect(out.c.stderr).toEqual([`${printed(slider)}\n`]);
  });

  it("leaves it out of a component whose JSON holds Python's NaN or Infinity, which stays text as in the app", () => {
    // JSON.parse rejects them, and the app shows such a component as its text.
    const group = (field: unknown) =>
      `${MARKER_UI_START}{"id": "g", "type": "Group", "props": {"children": [{"id": "s", "type": "Slider", "props": {"value": NaN, "max": Infinity, "min": -Infinity, "label": "NaN"}}, ${JSON.stringify(field)}]}}${MARKER_UI_END}`;
    const cells: CellData[] = [
      {
        id: "c",
        type: "code",
        content: "",
        outputs: { stdout: [group(password("p", { value: SECRET })), "\n"], stderr: [group({ id: "t", type: "Text", props: { content: "-Infinity" } }), group(password("q", { value: SECRET }))] },
      },
    ];
    const out = snapshotOutputs(cells, () => undefined);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    // Written again without the value, its NaN and Infinity as printed: still
    // not JSON, so the reader shows it as text too.
    const redacted = (id: string) =>
      `${MARKER_UI_START}{"id":"g","type":"Group","props":{"children":[{"id":"s","type":"Slider","props":{"value":NaN,"max":Infinity,"min":-Infinity,"label":"NaN"}},${JSON.stringify(password(id))}]}}${MARKER_UI_END}`;
    expect(out.c.stdout).toEqual([redacted("p"), "\n"]);
    expect(() => JSON.parse(out.c.stdout[0].slice(MARKER_UI_START.length, -MARKER_UI_END.length))).toThrow();
    expect(out.c.stderr).toEqual([cells[0].outputs!.stderr[0], redacted("q")]);
  });

  it("leaves it out of the text of a field that is a password field now", () => {
    // Created as a text field, made a password field later (options()).
    const field = { id: "p", type: "Input", props: { value: SECRET, input_type: "text" } };
    const cells: CellData[] = [{ id: "c", type: "code", content: "", outputs: { stdout: [], stderr: [ui(field)] } }];
    expect(exported(cells, { p: { value: "", input_type: "password" } })).not.toContain(SECRET);
  });

  it("keeps what other fields show", () => {
    const cells: CellData[] = [
      { id: "c", type: "code", content: "", outputs: { stdout: [], stderr: [], mimebundle: { [UI_MIME]: { id: "t", type: "Input", props: { value: "", input_type: "email" } } } } },
    ];
    const out = snapshotOutputs(cells, () => ({ value: "me@example.com", input_type: "email" }));
    expect(out.c.mimebundle[UI_MIME].props.value).toBe("me@example.com");
  });
});
