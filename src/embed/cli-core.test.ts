// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONFIG_FILE, type Framework, componentSnippet } from "../lib/export/component-export";
import { detectFramework, detectPackageManager, exampleFile, findProject, installCommand, packagesToInstall, readPackageJson, windowsCommandLine } from "./cli-core";

const dirs: string[] = [];
const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "pynote-cli-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const pkg = (deps: Record<string, string> = {}, extra: object = {}) => JSON.stringify({ name: "site", dependencies: deps, ...extra });

describe("npx pynote add: project detection", () => {
  test("finds the project from a subfolder", () => {
    const dir = project({ "package.json": pkg(), "src/pages/index.astro": "" });
    expect(findProject(path.join(dir, "src/pages"))).toBe(dir);
  });

  test("detects the framework, most specific first", () => {
    expect(detectFramework({ dependencies: { astro: "5", react: "19" } })).toBe("astro");
    expect(detectFramework({ dependencies: { next: "16", react: "19" } })).toBe("next");
    expect(detectFramework({ dependencies: { "@solidjs/start": "1", "solid-js": "1" } })).toBe("solidstart");
    expect(detectFramework({ devDependencies: { "solid-js": "1" } })).toBe("solid");
    expect(detectFramework({ dependencies: { react: "19" } })).toBe("react");
    expect(detectFramework({})).toBe("html");
  });

  test("detects the package manager from packageManager, then lockfiles here or above", () => {
    expect(detectPackageManager(project({ "package.json": pkg({}, { packageManager: "pnpm@9.1.0" }) }), { packageManager: "pnpm@9.1.0" })).toBe("pnpm");
    const yarn = project({ "package.json": pkg(), "yarn.lock": "" });
    expect(detectPackageManager(yarn, readPackageJson(yarn))).toBe("yarn");
    const mono = project({ "package.json": pkg(), "pnpm-lock.yaml": "", "apps/web/package.json": pkg() });
    expect(detectPackageManager(path.join(mono, "apps/web"), readPackageJson(path.join(mono, "apps/web")))).toBe("pnpm");
    const bun = project({ "package.json": pkg(), "bun.lock": "" });
    expect(detectPackageManager(bun, readPackageJson(bun))).toBe("bun");
  });

  test("installs pynote and only the required peers the project lacks", () => {
    const pynote = {
      version: "0.1.0",
      peerDependencies: { "@codemirror/view": "^6.39.11", "@codemirror/state": "^6.5.4", react: ">=18", pyodide: "0.29.4" },
      peerDependenciesMeta: { react: { optional: true }, pyodide: { optional: true } },
    };
    expect(packagesToInstall({ dependencies: { "@codemirror/state": "^6.5.0" } }, pynote)).toEqual(["pynote@^0.1.0", "@codemirror/view@^6.39.11"]);
    expect(packagesToInstall({ dependencies: { pynote: "0.1.0", "@codemirror/state": "6", "@codemirror/view": "6" } }, pynote)).toEqual([]);
    // A local build replaces the registry version, even when pynote is installed.
    expect(packagesToInstall({ dependencies: { pynote: "0.1.0", "@codemirror/state": "6", "@codemirror/view": "6" } }, pynote, "file:/tmp/pynote-0.1.0.tgz")).toEqual(["pynote@file:/tmp/pynote-0.1.0.tgz"]);
  });

  test("speaks each package manager's install verb", () => {
    expect(installCommand("npm", ["pynote@^0.1.0"])).toEqual(["npm", "install", "pynote@^0.1.0"]);
    expect(installCommand("pnpm", ["pynote@^0.1.0"])).toEqual(["pnpm", "add", "pynote@^0.1.0"]);
    expect(installCommand("yarn", ["a"])).toEqual(["yarn", "add", "a"]);
    expect(installCommand("bun", ["a"])).toEqual(["bun", "add", "a"]);
  });
});

describe("npx pynote add: the example it prints", () => {
  const configImport = (snippet: string) => /import config from "([^"]+)";/.exec(snippet)?.[1];

  test("names a file in the project's layout", () => {
    expect(exampleFile("next", project({ "package.json": pkg(), "tsconfig.json": "{}", "app/page.tsx": "" }))).toBe("app/notebook.tsx");
    expect(exampleFile("next", project({ "package.json": pkg(), "src/app/page.jsx": "" }))).toBe("src/app/notebook.jsx");
    expect(exampleFile("solidstart", project({ "package.json": pkg(), "tsconfig.json": "{}" }))).toBe("src/routes/notebook.tsx");
    expect(exampleFile("react", project({ "package.json": pkg() }))).toBe("src/Notebook.jsx");
    expect(exampleFile("astro", project({ "package.json": pkg() }))).toBe("src/pages/notebook.astro");
    expect(exampleFile("html", project({ "package.json": pkg() }))).toBeUndefined();
  });

  test("in Next.js, follows the router the project uses, where Next.js looks for it", () => {
    // The Pages Router: the example is a page of its own (/notebook), with no client directive.
    const pages = project({ "package.json": pkg(), "tsconfig.json": "{}", "pages/index.tsx": "" });
    expect(exampleFile("next", pages)).toBe("pages/notebook.tsx");
    expect(exampleFile("next", project({ "package.json": pkg(), "src/pages/index.jsx": "" }))).toBe("src/pages/notebook.jsx");
    // pages/ in the project's folder: Next.js ignores src/.
    expect(exampleFile("next", project({ "package.json": pkg(), "pages/index.jsx": "", "src/app/page.jsx": "" }))).toBe("pages/notebook.jsx");
    // Both routers (a project moving to the App Router), or neither yet: the App Router.
    expect(exampleFile("next", project({ "package.json": pkg(), "app/page.jsx": "", "pages/old.jsx": "" }))).toBe("app/notebook.jsx");
    expect(exampleFile("next", project({ "package.json": pkg(), "src/app/page.jsx": "", "src/pages/old.jsx": "" }))).toBe("src/app/notebook.jsx");
    expect(exampleFile("next", project({ "package.json": pkg() }))).toBe("app/notebook.jsx");

    const snippet = (file: string) => componentSnippet("next", null, ["x = 1"], CONFIG_FILE, file);
    expect(snippet(exampleFile("next", pages)!)).not.toContain("use client");
    expect(snippet("src/pages/notebook.jsx")).not.toContain("use client");
    expect(snippet("app/notebook.tsx")).toContain('"use client";');
  });

  test("imports pynote.config.json from where the CLI found it, relative to that file", () => {
    const layouts: Array<[Framework, Record<string, string>]> = [
      ["astro", {}],
      ["next", { "app/layout.jsx": "" }],
      ["next", { "src/app/layout.tsx": "", "tsconfig.json": "{}" }],
      ["next", { "pages/index.jsx": "" }],
      ["next", { "src/pages/index.tsx": "", "tsconfig.json": "{}" }],
      ["solidstart", { "tsconfig.json": "{}" }],
      ["react", {}],
      ["solid", {}],
    ];
    for (const [framework, files] of layouts) {
      const dir = project({ "package.json": pkg(), [CONFIG_FILE]: "{}", ...files });
      const file = exampleFile(framework, dir)!;
      const snippet = componentSnippet(framework, { executionMode: "hybrid", lockExecutionMode: false, editable: true, menu: true, autorun: false, theme: {}, codeVisibility: {} }, ["x = 1"], CONFIG_FILE, file);
      expect(snippet, framework).toContain(file);
      expect(path.resolve(dir, path.dirname(file), configImport(snippet)!), `${framework}: ${file}`).toBe(path.join(dir, CONFIG_FILE));
    }
  });
});

// How cmd.exe reads a command line (no variables): outside quotes, ^ makes the
// next character literal (a quote too, then not opening quotes); quotes stay.
const cmdRead = (line: string) => {
  let out = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    if (c === "^" && !quoted) out += line[++i] ?? "";
    else out += c;
  }
  return out;
};

// How a Windows program splits its command line (the C runtime's rules).
const argv = (line: string) => {
  const args: string[] = [];
  let current = "";
  let quoted = false;
  let started = false;
  for (let i = 0; i < line.length; i++) {
    let slashes = 0;
    while (line[i] === "\\") {
      slashes++;
      i++;
    }
    const c = line[i];
    if (c === '"') {
      current += "\\".repeat(Math.floor(slashes / 2));
      if (slashes % 2 === 1) current += '"';
      else quoted = !quoted;
      started = true;
    } else {
      current += "\\".repeat(slashes);
      if (slashes > 0) started = true;
      if (c === undefined) break;
      if (c === " " && !quoted) {
        if (started) args.push(current);
        current = "";
        started = false;
      } else {
        current += c;
        started = true;
      }
    }
  }
  if (started) args.push(current);
  return args;
};

describe("npx pynote add on Windows", () => {
  const command = ["npm", "install", "pynote@^0.1.0", "@codemirror/view@^6.39.11", "file:C:\\Users\\Jane Doe\\pynote-0.1.0.tgz"];

  test("quotes every argument and escapes what cmd.exe reads specially", () => {
    expect(windowsCommandLine(command)).toBe('npm ^"install^" ^"pynote@^^0.1.0^" ^"@codemirror/view@^^6.39.11^" ^"file:C:\\Users\\Jane^ Doe\\pynote-0.1.0.tgz^"');
  });

  test("every argument reaches the package manager as it was, carets and spaces included", () => {
    // Node's shell option joins the arguments as they are: cmd.exe drops the caret, splits the path.
    expect(argv(cmdRead(command.join(" "))).slice(2)).toEqual(["pynote@0.1.0", "@codemirror/view@6.39.11", "file:C:\\Users\\Jane", "Doe\\pynote-0.1.0.tgz"]);
    // Read once by cmd /c, then once more inside npm.cmd, pnpm.cmd or yarn.cmd (%*).
    expect(argv(cmdRead(windowsCommandLine(command)))).toEqual(command);
    expect(argv(cmdRead(cmdRead(windowsCommandLine(command))))).toEqual(command);
    for (const arg of ["a&b|c", "100%", "(x)", "tail\\", 'say "hi"', "x^y!"]) {
      expect(argv(cmdRead(windowsCommandLine(["pnpm", arg]))), arg).toEqual(["pnpm", arg]);
    }
  });
});
