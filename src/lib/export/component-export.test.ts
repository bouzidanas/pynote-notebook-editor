import { describe, expect, test } from "vitest";
import {
  type ComponentOptions,
  EXAMPLE_FILES,
  FRAMEWORKS,
  type NotebookLook,
  componentConfig,
  componentSnippet,
  differences,
  importPath,
  pyodideFolder,
  themeDifferences,
  viewDifferences,
} from "./component-export";
import { defaultTheme } from "../theme";
import { DEFAULT_CODE_VISIBILITY } from "../codeVisibility";

const options: ComponentOptions = {
  framework: "astro",
  editable: true,
  menu: true,
  autorun: false,
  executionMode: "reactive",
  lockExecutionMode: false,
  theme: "notebook",
  view: "notebook",
  python: "cdn",
  pyodideUrl: "/pyodide/",
};
const look = {
  theme: { font: "Mono", colors: { primary: "#fff", background: "#000" }, radii: { lg: "1px" } },
  defaultTheme: { font: "Mono", colors: { primary: "#f38ba8", background: "#000" }, radii: { lg: "1px" } },
  codeVisibility: { showCode: false, showStdout: true, saveToExport: true },
  defaultCodeVisibility: { showCode: true, showStdout: true, saveToExport: false },
};

describe("componentConfig", () => {
  test("keeps only what differs from PyNote's defaults", () => {
    expect(componentConfig(look, options)).toEqual({
      executionMode: "reactive",
      lockExecutionMode: false,
      editable: true,
      menu: true,
      autorun: false,
      theme: { colors: { primary: "#fff" } },
      codeVisibility: { showCode: false },
    });
  });

  test("a default notebook needs no theme or view settings", () => {
    const config = componentConfig({ ...look, theme: look.defaultTheme, codeVisibility: look.defaultCodeVisibility }, options);
    expect(config.theme).toEqual({});
    expect(config.codeVisibility).toEqual({});
  });

  test("PyNote's default theme and view leave the notebook's out", () => {
    const config = componentConfig(look, { ...options, theme: "default", view: "default" });
    expect(config.theme).toEqual({});
    expect(config.codeVisibility).toEqual({});
    expect(componentConfig(look, { ...options, view: "default" }).theme).toEqual({ colors: { primary: "#fff" } });
  });

  test("writes the chosen execution mode, lock and autorun", () => {
    expect(componentConfig(look, { ...options, executionMode: "queue_all", lockExecutionMode: true, autorun: true })).toMatchObject({
      executionMode: "queue_all",
      lockExecutionMode: true,
      autorun: true,
    });
  });

  test("names a Pyodide folder only when the site serves its own", () => {
    expect(componentConfig(look, options)).not.toHaveProperty("pyodideUrl");
    expect(componentConfig(look, { ...options, python: "site", pyodideUrl: "https://example.com/py" }).pyodideUrl).toBe("https://example.com/py/");
  });

  test("leaves out the app's own flags: saving the theme or the view to the notebook is not a look", () => {
    // What the Theme dialog's "Save settings to .ipynb" (or ?theme=) and Code
    // Visibility's equivalent leave in the app's settings.
    const saved: NotebookLook = {
      theme: { ...defaultTheme, saveToExport: true } as unknown as Record<string, unknown>,
      defaultTheme: defaultTheme as unknown as Record<string, unknown>,
      codeVisibility: { ...DEFAULT_CODE_VISIBILITY, saveToExport: true },
      defaultCodeVisibility: { ...DEFAULT_CODE_VISIBILITY },
    };
    expect(themeDifferences(saved)).toEqual({});
    expect(viewDifferences(saved)).toEqual({});
    const config = componentConfig(saved, options);
    expect(config.theme).toEqual({});
    expect(config.codeVisibility).toEqual({});
  });
});

describe("pyodideFolder", () => {
  test("ends with a slash, and blank means the default folder", () => {
    expect(pyodideFolder("/static/pyodide")).toBe("/static/pyodide/");
    expect(pyodideFolder(" /pyodide/ ")).toBe("/pyodide/");
    expect(pyodideFolder("   ")).toBe("/pyodide/");
  });
});

describe("importPath", () => {
  test("climbs from the file's folder to the project's folder", () => {
    expect(importPath("app/notebook.tsx", "pynote.config.json")).toBe("../pynote.config.json");
    expect(importPath("src/pages/notebook.astro", "a.json")).toBe("../../a.json");
    expect(importPath("notebook.tsx", "a.json")).toBe("./a.json");
  });
});

describe("differences", () => {
  test("compares arrays as values", () => {
    expect(differences({ a: [1, 2] }, { a: [1, 2] })).toEqual({});
    expect(differences({ a: [1, 3] }, { a: [1, 2] })).toEqual({ a: [1, 3] });
  });
});

describe("componentSnippet", () => {
  const config = componentConfig(look, options);
  const cells = ['x = "a</script>b"', "print(x)"];

  test("JSX frameworks import their adapter and quote code as string literals", () => {
    const react = componentSnippet("react", config, cells);
    expect(react).toContain('from "pynote/react"');
    expect(react).toContain(`<PyNoteCell code={${JSON.stringify(cells[0])}} />`);
    expect(react.startsWith('"use client"')).toBe(false);
    expect(componentSnippet("next", config, cells)).toMatch(/^\/\/ [^\n]*\n"use client";\n/);
    expect(componentSnippet("solidstart", config, cells)).toContain('from "pynote/solid"');
    expect(componentSnippet("astro", config, cells)).toContain('from "pynote/astro"');
  });

  test("HTML puts one line of code in an escaped attribute and the config in configure()", () => {
    const html = componentSnippet("html", config, cells);
    expect(html).toContain('<pynote-cell code="x = &quot;a&lt;/script&gt;b&quot;"></pynote-cell>');
    expect(html).toContain('<pynote-cell code="print(x)"></pynote-cell>');
    expect(html).toContain('"executionMode": "reactive"');
    // The inline module script must not be closed early by the config.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  test("HTML puts several lines of code in an indented Python script, unless they could end it", () => {
    expect(componentSnippet("html", null, ["import math\n\ndef area(r):\n    return math.pi * r ** 2"])).toContain(
      ['<pynote-cell>', '  <script type="text/x-python">', "    import math", "", "    def area(r):", "        return math.pi * r ** 2", "  </script>", "</pynote-cell>"].join("\n"),
    );
    // In the attribute, line breaks are character references: the example stays indentable.
    expect(componentSnippet("html", null, ['html = """\n</script>\n"""'])).toContain('<pynote-cell code="html = &quot;&quot;&quot;&#10;&lt;/script&gt;&#10;&quot;&quot;&quot;"></pynote-cell>');
    expect(componentSnippet("html", null, ["x = 1\n# <!-- y"])).toContain('<pynote-cell code="x = 1&#10;# &lt;!-- y"></pynote-cell>');
  });

  test("imports the config file by the name it was saved under", () => {
    expect(componentSnippet("react", config, cells, "site.pynote.json")).toContain('import config from "../site.pynote.json";');
    expect(componentSnippet("astro", config, cells, "site.pynote.json")).toContain('import config from "../../site.pynote.json";');
  });

  test("names the file it goes in, and imports the config from the project's folder relative to it", () => {
    for (const { id } of FRAMEWORKS) {
      if (id === "html") continue;
      const snippet = componentSnippet(id, config, cells);
      const file = EXAMPLE_FILES[id];
      expect(snippet.split("\n")[id === "astro" ? 1 : 0], id).toBe(`// ${file}, with pynote.config.json in the project's folder.`);
      // From the file's folder, the import climbs back to the project's folder.
      const climbs = file.split("/").length - 1;
      expect(snippet, id).toContain(`import config from "${"../".repeat(climbs)}pynote.config.json";`);
    }
    expect(componentSnippet("next", config, cells, undefined, "src/app/notebook.jsx")).toContain('import config from "../../pynote.config.json";');
    // The directive stays the first statement (comments may come before it).
    expect(componentSnippet("next", config, cells).split("\n")[1]).toBe('"use client";');
  });

  test("an .mdx page is told where the imports go", () => {
    expect(componentSnippet("astro", config, cells)).toContain("In an .mdx page, the imports go below its frontmatter, without the --- lines.");
  });

  test("without a config the example uses PyNote's defaults", () => {
    for (const framework of ["astro", "next", "react", "solid", "solidstart", "html"] as const) {
      const snippet = componentSnippet(framework, null, cells);
      expect(snippet, framework).not.toMatch(/\bconfig\b/);
      expect(snippet, framework).toContain(framework === "html" ? "<pynote-cell" : "<PyNoteCell");
    }
  });

  test("has an example cell even for a notebook without code", () => {
    expect(componentSnippet("react", config, [])).toContain("Hello from PyNote");
  });
});
