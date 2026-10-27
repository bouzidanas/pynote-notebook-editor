import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The oracles in this folder hold PyNote's formats to the reference tools
// (Jupyter's nbformat, jupytext, CPython), and they only count when they run.
// `npm run verify` is the command that runs every check (CONTRIBUTING.md,
// docs/system-architecture/export-system.md); it runs them through
// `npm run test:oracle`. These tests keep a new or renamed oracle from
// silently dropping out of it.

const root = resolve(__dirname, "../..");
const scripts: Record<string, string> = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts;

// A script's command line, with each `npm run <name>` replaced by that
// script's own command line.
const expand = (name: string): string => scripts[name].replace(/npm run ([\w:-]+)/g, (_, inner: string) => `(${expand(inner)})`);

interface OracleRun {
  script: string;
  packages: string[];
  flags: string[];
}

// Every `uv run [options] python [-I] test/oracle/<file>.py [flags]`, with the
// packages its `--with` options install.
const oracleRuns = (command: string): OracleRun[] =>
  [...command.matchAll(/uv run ((?:-\S+ (?:[^-\s]\S* )?)*)python3?(?: -I)? (test\/oracle\/[\w-]+\.py)((?: --[\w-]+)*)/g)].map((match) => ({
    script: match[2],
    packages: [...match[1].matchAll(/--with (\S+)/g)].map((m) => m[1]),
    flags: match[3].split(" ").filter(Boolean),
  }));

describe("npm run verify", () => {
  const runs = oracleRuns(expand("verify"));
  const run = (script: string) => runs.find((r) => r.script === `test/oracle/${script}`);

  it("runs every oracle in test/oracle/", () => {
    const oracles = readdirSync(__dirname).filter((file) => file.endsWith(".py"));
    expect(oracles.length).toBeGreaterThan(0);
    for (const oracle of oracles) expect(run(oracle), `${oracle} is not run by npm run verify`).toBeDefined();
  });

  it("checks the golden files without rewriting them, and reads the scripts with jupytext as well as CPython", () => {
    expect(run("write_golden.py")?.flags).toEqual(["--check"]);
    expect(run("check_scripts.py")?.flags).toEqual(["--jupytext"]);
  });

  it("pins the version of every Python package an oracle installs", () => {
    expect(runs.flatMap((r) => r.packages).length).toBeGreaterThan(0);
    for (const { script, packages } of runs) {
      for (const spec of packages) expect(spec, `${script} installs an unpinned package`).toMatch(/^[\w.-]+==\d+(\.\d+)*$/);
    }
  });
});
