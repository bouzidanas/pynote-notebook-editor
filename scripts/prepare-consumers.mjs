#!/usr/bin/env node
// Prepares the consumer projects the component tests run against
// (e2e/consumers/, playwright.consumers.config.ts):
//
//   1. packs the pynote package (build it first: npm run build:package);
//   2. copies each project in test/consumers/ to .cache/consumers/<name>
//      (git-ignored; node_modules are kept between runs);
//   3. installs it, then runs `npx pynote add` from the tarball, as a user
//      would, with PYNOTE_INSTALL_SPEC pointing the install at the tarball;
//   4. builds it.
//
//   node scripts/prepare-consumers.mjs [name ...]

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sources = path.join(root, "test/consumers");
const work = path.join(root, ".cache/consumers");
const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : readdirSync(sources);

const run = (command, args, cwd, env = {}) => {
  console.log(`\n[${path.basename(cwd)}] ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
};

mkdirSync(work, { recursive: true });
const packed = JSON.parse(execFileSync("npm", ["pack", "--pack-destination", work, "--json"], { cwd: path.join(root, "packages/pynote"), encoding: "utf8" }));
const tarball = path.join(work, packed[0].filename);
console.log(`packed ${path.relative(root, tarball)}`);

// Build output and caches of the frameworks, cleared before each build.
const OUTPUTS = ["dist", ".astro", ".next", ".output", ".vinxi", ".nitro"];

for (const name of names) {
  const dir = path.join(work, name);
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    if (entry !== "node_modules" && entry !== "package-lock.json") rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  cpSync(path.join(sources, name), dir, { recursive: true });
  run("npm", ["install", "--no-audit", "--no-fund"], dir);
  run("npm", ["exec", "--yes", `--package=${tarball}`, "--", "pynote", "add", "--pm", "npm"], dir, { PYNOTE_INSTALL_SPEC: `file:${tarball}` });
  for (const output of OUTPUTS) rmSync(path.join(dir, output), { recursive: true, force: true });
  run("npm", ["run", "build"], dir, { NEXT_TELEMETRY_DISABLED: "1", ASTRO_TELEMETRY_DISABLED: "1" });
}
console.log(`\nconsumers ready: ${names.join(", ")}`);
