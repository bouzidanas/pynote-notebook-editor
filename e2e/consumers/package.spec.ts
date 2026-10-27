import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, expect, test } from "./support";

// The installed package under strict ESM resolution (full file names, as
// Node and webpack's fully specified imports require). Every entry point a
// server imports loads in Node; the compiled Solid adapter (the "default" of
// pynote/solid, for bundlers without the "solid" condition) is a browser
// build, so it loads with the browser condition, as a bundler resolves it.

const load = (project: string, specifier: string, conditions: string[] = []) =>
  execFileSync(
    process.execPath,
    [...conditions.map((condition) => `--conditions=${condition}`), "--input-type=module", "-e", `const m = await import(${JSON.stringify(specifier)}); console.log(Object.keys(m).sort().join(","));`],
    { cwd: path.join(ROOT, ".cache/consumers", project), encoding: "utf8" },
  ).trim();

test("every entry point of the installed package resolves and loads", () => {
  expect(load("next", "pynote/react")).toBe("PyNoteCell,configure");
  expect(load("html", "pynote")).toBe("configure,mountCell,runtime,version");
  expect(load("html", "pynote/element")).toBe("BOOLEAN_ATTRIBUTES,cellOptions,configure,dedent,readPageConfig");
  expect(load("solidstart", "pynote/solid", ["browser"])).toBe("PyNoteCell,configure");
});
