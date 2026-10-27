import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXAMPLE_FILES, type Framework } from "../lib/export/component-export";

// What `npx pynote add` works out about a project before it installs
// anything: where the project is, which package manager it uses, which
// framework it is built with, and which packages it still needs. Pure
// functions over the file system, tested in cli-core.test.ts.

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface PackageJson {
  name?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

const readJson = (file: string): PackageJson => JSON.parse(readFileSync(file, "utf8")) as PackageJson;

/** The nearest folder at or above `start` with a package.json. */
export function findProject(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export const readPackageJson = (project: string): PackageJson => readJson(path.join(project, "package.json"));

const LOCKFILES: ReadonlyArray<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

/** The "packageManager" field, else the lockfile here or in a parent (monorepos), else npm. */
export function detectPackageManager(project: string, pkg: PackageJson): PackageManager {
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager ?? "")?.[1];
  if (declared) return declared as PackageManager;
  let dir = project;
  for (;;) {
    for (const [file, manager] of LOCKFILES) if (existsSync(path.join(dir, file))) return manager;
    const parent = path.dirname(dir);
    if (parent === dir) return "npm";
    dir = parent;
  }
}

const has = (pkg: PackageJson, name: string) => !!(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);

/** The framework the project is built with (the most specific one it depends on). */
export function detectFramework(pkg: PackageJson): Framework {
  if (has(pkg, "astro")) return "astro";
  if (has(pkg, "next")) return "next";
  if (has(pkg, "@solidjs/start")) return "solidstart";
  if (has(pkg, "solid-js")) return "solid";
  if (has(pkg, "react")) return "react";
  return "html";
}

/**
 * pynote itself and the required peers the project does not have yet.
 * `spec` replaces "pynote@^<version>" (a local build: "file:pynote-0.1.0.tgz").
 */
export function packagesToInstall(project: PackageJson, pynote: { version: string } & PackageJson, spec?: string): string[] {
  const peers = Object.entries(pynote.peerDependencies ?? {})
    .filter(([name]) => !pynote.peerDependenciesMeta?.[name]?.optional)
    .filter(([name]) => !has(project, name))
    .map(([name, range]) => `${name}@${range}`);
  const self = spec ? `pynote@${spec}` : `pynote@^${pynote.version}`;
  return [...(has(project, "pynote") && !spec ? [] : [self]), ...peers];
}

/**
 * Where a Next.js project's routes are, as Next.js looks for them: app/ or
 * pages/ in the project's folder, else in src/. The App Router's folder when
 * the project has one (or neither), else the Pages Router's.
 */
function nextRoutes(project: string): string {
  const has = (folder: string) => existsSync(path.join(project, folder));
  const base = !has("app") && !has("pages") && (has("src/app") || has("src/pages")) ? "src/" : "";
  return !has(`${base}app`) && has(`${base}pages`) ? `${base}pages` : `${base}app`;
}

/**
 * Where the usage example goes in this project, from its folder (which holds
 * pynote.config.json): PyNote's usual place for the framework, in the
 * project's own layout (Next.js under src/, with the App Router or the Pages
 * Router; TypeScript or JavaScript).
 */
export function exampleFile(framework: Framework, project: string): string | undefined {
  if (framework === "html") return undefined;
  let file = EXAMPLE_FILES[framework];
  // In pages/, the example is a page of its own (/notebook).
  if (framework === "next") file = file.replace(/^app\//, `${nextRoutes(project)}/`);
  if (file.endsWith(".tsx") && !existsSync(path.join(project, "tsconfig.json"))) file = file.replace(/\.tsx$/, ".jsx");
  return file;
}

export function installCommand(manager: PackageManager, packages: readonly string[]): string[] {
  return [manager, manager === "npm" ? "install" : "add", ...packages];
}

// What cmd.exe reads specially; ^ makes it read the next character as is.
const CMD_SPECIAL = /([()\][%!^"`<>&|;, *?])/g;

/**
 * The line cmd.exe runs for `command` on Windows, where npm, pnpm and yarn
 * are .cmd scripts that only start through cmd. Node's `shell` option joins
 * arguments as they are, and cmd reads ^ as its escape character, so
 * "pynote@^0.1.0" would reach npm as "pynote@0.1.0" (and a path with a space
 * as two arguments). Here each argument is quoted for the program and cmd's
 * special characters escaped, as https://qntm.org/cmd describes (and as
 * cross-spawn does).
 */
export function windowsCommandLine(command: readonly string[]): string {
  const [program, ...args] = command;
  const quoted = args.map((arg) => {
    // Backslashes double before a quote (which gets escaped) and at the end (before the closing quote).
    const inner = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
    return `"${inner}"`.replace(CMD_SPECIAL, "^$1");
  });
  return [program.replace(CMD_SPECIAL, "^$1"), ...quoted].join(" ");
}
