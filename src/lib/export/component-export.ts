// The Component export: what a web project needs to run this notebook's cells
// with the `pynote` package. Cells are placed by the developer (one
// <PyNoteCell> per cell, anywhere on a page; all cells on a page share one
// Python runtime); the notebook contributes its look and behavior as a config
// file, plus the setup command and a usage example for the framework.

import type { ExecutionModeName } from "../formats/pynote-settings";

export type ExecutionMode = ExecutionModeName;

export type Framework = "astro" | "next" | "solidstart" | "react" | "solid" | "html";

export const FRAMEWORKS: ReadonlyArray<{ id: Framework; label: string }> = [
  { id: "astro", label: "Astro" },
  { id: "next", label: "Next.js" },
  { id: "solidstart", label: "SolidStart" },
  { id: "react", label: "React" },
  { id: "solid", label: "Solid" },
  { id: "html", label: "HTML" },
];

export interface ComponentOptions {
  framework: Framework;
  /** Readers can edit cells; false shows code read-only (cells still run). */
  editable: boolean;
  /** The cog menu on each cell (kernel, execution mode, visibility). */
  menu: boolean;
  /** Cells run when the page loads, in page order. */
  autorun: boolean;
  executionMode: ExecutionMode;
  /** Readers cannot change the execution mode. */
  lockExecutionMode: boolean;
  /** The notebook's theme, or PyNote's default theme. */
  theme: "notebook" | "default";
  /** The notebook's view settings, or PyNote's defaults (code and every output shown, line numbers off). */
  view: "notebook" | "default";
  /** Pyodide from jsDelivr, or from a folder of the site (`pyodideUrl`). */
  python: "cdn" | "site";
  pyodideUrl: string;
}

/** The `pynote` package's notebook configuration (pynote.config.json). */
export interface PyNoteConfig {
  executionMode: ExecutionMode;
  lockExecutionMode: boolean;
  editable: boolean;
  menu: boolean;
  autorun: boolean;
  /** Only what differs from PyNote's default theme. */
  theme: Record<string, unknown>;
  /** Only what differs from PyNote's default view settings. */
  codeVisibility: Record<string, unknown>;
  /** Where Pyodide is loaded from; jsDelivr when absent. */
  pyodideUrl?: string;
}

export const SETUP_COMMAND = "npx pynote add";
export const CONFIG_FILE = "pynote.config.json";
/** Where a site serves its own copy of Pyodide, unless it names another folder. */
export const DEFAULT_PYODIDE_FOLDER = "/pyodide/";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The parts of `value` that differ from `base` (objects compared key by key). */
export function differences(value: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const b = base[key];
    if (v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)) {
      const nested = differences(v as Record<string, unknown>, b as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[key] = nested;
    } else if (JSON.stringify(v) !== JSON.stringify(b)) {
      out[key] = v as Json;
    }
  }
  return out;
}

export interface NotebookLook {
  theme: Record<string, unknown>;
  defaultTheme: Record<string, unknown>;
  codeVisibility: Record<string, unknown>;
  defaultCodeVisibility: Record<string, unknown>;
}

// Theme and view settings that only make sense inside the PyNote app: whether
// the app saves them into the notebook file is not part of how cells look.
const APP_ONLY_THEME = new Set(["saveToExport"]);
const APP_ONLY_VISIBILITY = new Set(["saveToExport"]);

const without = (settings: Record<string, unknown>, keys: ReadonlySet<string>): Record<string, unknown> => {
  for (const key of keys) delete settings[key];
  return settings;
};

/** The notebook's theme as the config writes it: what differs from the default. */
export const themeDifferences = (look: NotebookLook): Record<string, unknown> =>
  without(differences(look.theme, look.defaultTheme), APP_ONLY_THEME);

/** The notebook's view settings as the config writes them. */
export const viewDifferences = (look: NotebookLook): Record<string, unknown> =>
  without(differences(look.codeVisibility, look.defaultCodeVisibility), APP_ONLY_VISIBILITY);

/** A folder URL as the package expects it: ending with "/" (the default folder when blank). */
export function pyodideFolder(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_PYODIDE_FOLDER;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function componentConfig(look: NotebookLook, options: ComponentOptions): PyNoteConfig {
  const config: PyNoteConfig = {
    executionMode: options.executionMode,
    lockExecutionMode: options.lockExecutionMode,
    editable: options.editable,
    menu: options.menu,
    autorun: options.autorun,
    theme: options.theme === "notebook" ? themeDifferences(look) : {},
    codeVisibility: options.view === "notebook" ? viewDifferences(look) : {},
  };
  if (options.python === "site") config.pyodideUrl = pyodideFolder(options.pyodideUrl);
  return config;
}

const jsString = (text: string) => JSON.stringify(text);
// Line breaks as character references: the attribute stays on one line of the
// example, so indenting the example (as the CLI does) leaves the code alone.
const htmlAttribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "&#10;");

// A cell of the HTML example: one line of code in the `code` attribute, more
// in a child <script type="text/x-python">, indented with the markup (the
// element removes the indentation its lines share). Code that would end that
// script early goes in the attribute.
const htmlCell = (code: string): string => {
  if (!code.includes("\n") || /<\/script|<!--/i.test(code)) return `<pynote-cell code="${htmlAttribute(code)}"></pynote-cell>`;
  const lines = code.split(/\r?\n/).map((line) => (line === "" ? "" : `    ${line}`));
  return ["<pynote-cell>", '  <script type="text/x-python">', ...lines, "  </script>", "</pynote-cell>"].join("\n");
};

const jsxCells = (cells: readonly string[], indent: string) =>
  cells.map((code) => `${indent}<PyNoteCell code={${jsString(code)}} />`).join("\n");

/**
 * Where the usage example goes in a project of the framework: a path from
 * the project's folder, which holds pynote.config.json (where
 * `npx pynote add` looks for it). The HTML example has the config inline.
 */
export const EXAMPLE_FILES: Readonly<Record<Exclude<Framework, "html">, string>> = {
  astro: "src/pages/notebook.astro",
  next: "app/notebook.tsx",
  solidstart: "src/routes/notebook.tsx",
  react: "src/Notebook.tsx",
  solid: "src/Notebook.tsx",
};

/** How `file` imports `target`, both paths from the project's folder (target at its top). */
export function importPath(file: string, target: string): string {
  const depth = file.split("/").length - 1;
  return `${depth > 0 ? "../".repeat(depth) : "./"}${target}`;
}

/**
 * How to use the package in the framework, with the notebook's first code
 * cells as the example cells. The example names the file it goes in
 * (`exampleFile`, from the project's folder). With a config, it applies it:
 * a file named `configFile` in the project's folder; without one, cells use
 * PyNote's defaults.
 */
export function componentSnippet(
  framework: Framework,
  config: PyNoteConfig | null,
  exampleCells: readonly string[],
  configFile = CONFIG_FILE,
  exampleFile?: string,
): string {
  const cells = exampleCells.length > 0 ? exampleCells : ["print('Hello from PyNote')"];
  const lines = (...parts: Array<string | false>) => parts.filter((part): part is string => part !== false).join("\n");
  const file = framework === "html" ? "" : (exampleFile ?? EXAMPLE_FILES[framework]);
  const where = `// ${file}${config ? `, with ${configFile} in the project's folder` : ""}.`;
  const configImport = `import config from "${importPath(file, configFile)}";`;
  switch (framework) {
    case "astro":
      return lines(
        "---",
        where,
        "// In an .mdx page, the imports go below its frontmatter, without the --- lines.",
        `import { ${config ? "PyNoteCell, PyNoteConfig" : "PyNoteCell"} } from "pynote/astro";`,
        !!config && configImport,
        "---",
        "",
        !!config && "<PyNoteConfig config={config} />",
        !!config && "",
        cells.map((code, i) => `${i > 0 ? "<p>Text between cells. They share one Python runtime.</p>\n\n" : ""}<PyNoteCell code={${jsString(code)}} />`).join("\n\n"),
        "",
      );
    case "next":
    case "react":
    case "solidstart":
    case "solid": {
      const adapter = framework === "next" || framework === "react" ? "pynote/react" : "pynote/solid";
      // A client component for Next.js's App Router; a Pages Router page (in pages/) needs no directive.
      const client = framework === "next" && !file.split("/").includes("pages");
      return lines(
        where,
        client && '"use client";',
        "",
        `import { ${config ? "PyNoteCell, configure" : "PyNoteCell"} } from "${adapter}";`,
        !!config && configImport,
        "",
        !!config && "configure(config);",
        !!config && "",
        "export default function Notebook() {",
        "  return (",
        "    <>",
        jsxCells(cells, "      "),
        "    </>",
        "  );",
        "}",
        "",
      );
    }
    case "html":
      return lines(
        '<script type="module">',
        config ? '  import { configure } from "https://esm.sh/pynote/element";' : '  import "https://esm.sh/pynote/element";',
        !!config && `  configure(${JSON.stringify(config, null, 2).replace(/\n/g, "\n  ").replace(/<\//g, "<\\/")});`,
        "</script>",
        "",
        cells.map(htmlCell).join("\n\n"),
        "",
      );
  }
}
