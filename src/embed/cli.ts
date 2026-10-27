import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_FILE, FRAMEWORKS, type Framework, type PyNoteConfig, componentSnippet } from "../lib/export/component-export";
import {
  type PackageJson,
  type PackageManager,
  detectFramework,
  detectPackageManager,
  exampleFile,
  findProject,
  installCommand,
  packagesToInstall,
  readPackageJson,
  windowsCommandLine,
} from "./cli-core";

// `npx pynote add`: sets the pynote package up in a web project. It installs
// pynote and the peer packages it needs, then shows how to use the cells in
// the project's framework. It never touches notebooks: PyNote's Export
// dialog writes the config file (pynote.config.json) and the usage example.

const HELP = `Usage: npx pynote add [options]

Sets up the pynote package in the current project: installs pynote and the
packages it needs (CodeMirror), then shows how to use cells in your framework.

Options:
  --dry-run            Show what would be done, change nothing
  --no-install         Skip installing (only show how to use the cells)
  --pm <manager>       npm, pnpm, yarn or bun (detected from the lockfile)
  --framework <name>   ${FRAMEWORKS.map((f) => f.id).join(", ")} (detected from package.json)
  -h, --help           Show this help
  -v, --version        Show the version
`;

interface Options {
  dryRun: boolean;
  install: boolean;
  pm?: PackageManager;
  framework?: Framework;
}

const fail = (message: string): never => {
  console.error(`pynote: ${message}`);
  process.exit(1);
};

function parseArgs(argv: string[]): { command: string | null; options: Options } {
  const options: Options = { dryRun: false, install: true };
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-install") options.install = false;
    else if (arg === "--pm") {
      const value = argv[++i];
      if (!["npm", "pnpm", "yarn", "bun"].includes(value)) fail(`--pm must be npm, pnpm, yarn or bun (got ${value ?? "nothing"}).`);
      options.pm = value as PackageManager;
    } else if (arg === "--framework") {
      const value = argv[++i];
      if (!FRAMEWORKS.some((f) => f.id === value)) fail(`--framework must be one of ${FRAMEWORKS.map((f) => f.id).join(", ")}.`);
      options.framework = value as Framework;
    } else if (arg === "-h" || arg === "--help" || arg === "help") command = "help";
    else if (arg === "-v" || arg === "--version") command = "version";
    else if (!arg.startsWith("-") && command === null) command = arg;
    else fail(`unknown option ${arg}. Run "npx pynote --help".`);
  }
  return { command, options };
}

const own = (): { version: string } & PackageJson =>
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string } & PackageJson;

function add(options: Options): void {
  const project = findProject(process.cwd()) ?? fail("no package.json here or above. Run this in your project's folder.");
  const pkg = readPackageJson(project);
  const pm = options.pm ?? detectPackageManager(project, pkg);
  const framework = options.framework ?? detectFramework(pkg);
  const label = FRAMEWORKS.find((f) => f.id === framework)!.label;
  console.log(`pynote: ${label} project at ${project} (package manager: ${pm})`);

  // PYNOTE_INSTALL_SPEC installs a local build instead of the registry's (tests, unpublished versions).
  const packages = packagesToInstall(pkg, own(), process.env.PYNOTE_INSTALL_SPEC);
  if (packages.length === 0) {
    console.log("pynote: pynote and the packages it needs are already installed.");
  } else if (!options.install) {
    console.log(`pynote: skipped installing ${packages.join(" ")}`);
  } else {
    const command = installCommand(pm, packages);
    console.log(`pynote: ${options.dryRun ? "would run" : "running"}: ${command.join(" ")}`);
    if (!options.dryRun) {
      // On Windows the package managers are .cmd scripts, which start through cmd.exe.
      const result =
        process.platform === "win32"
          ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${windowsCommandLine(command)}"`], { cwd: project, stdio: "inherit", windowsVerbatimArguments: true })
          : spawnSync(command[0], command.slice(1), { cwd: project, stdio: "inherit" });
      if (result.status !== 0) fail(`${command[0]} failed${result.error ? ` (${result.error.message})` : ""}.`);
    }
  }

  const configFile = path.join(project, CONFIG_FILE);
  const config: PyNoteConfig | null = existsSync(configFile) ? (JSON.parse(readFileSync(configFile, "utf8")) as PyNoteConfig) : null;
  console.log(
    config
      ? `pynote: found ${CONFIG_FILE} (your notebook's look and settings from PyNote's Export dialog).`
      : `pynote: tip: PyNote's Export dialog (Component) writes a ${CONFIG_FILE} with your notebook's theme and settings.`,
  );
  const file = exampleFile(framework, project);
  const target = file ? `, for ${file}${config ? ` (in another file, adjust its import of ${CONFIG_FILE})` : ""}` : "";
  console.log(`\nAn example with two cells${target}:\n`);
  const snippet = componentSnippet(framework, config, ["import math\nradius = 2", "print(f'Area: {math.pi * radius ** 2:.2f}')"], CONFIG_FILE, file);
  console.log(snippet.replace(/^(?=.)/gm, "  "));
  console.log("Cells on a page share one Python runtime, in page order. Docs: https://github.com/bouzidanas/pynote-notebook-editor/tree/main/packages/pynote#readme");
}

const { command, options } = parseArgs(process.argv.slice(2));
if (command === "help" || command === null) console.log(HELP);
else if (command === "version") console.log(own().version);
else if (command === "add") add(options);
else fail(`unknown command ${command}. Run "npx pynote --help".`);
