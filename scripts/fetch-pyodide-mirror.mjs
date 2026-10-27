#!/usr/bin/env node
// Downloads a local mirror of the Pyodide release the kernel uses, for tests:
// the offline-export tests build exports from it, and the browser suites serve
// the CDN from it so they never depend on the network.
//
//   node scripts/fetch-pyodide-mirror.mjs [package ...]
//
// Writes .cache/pyodide/<version>/ (git-ignored). Core files always; packages
// default to the set the test notebooks import, with their dependency
// closures. Every package is checked against the SHA-256 in pyodide-lock.json.
// Files already present with the right hash are kept.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const config = readFileSync(path.join(root, "src/lib/pyodide-config.ts"), "utf8");
const version = /PYODIDE_VERSION = "([^"]+)"/.exec(config)?.[1];
if (!version) throw new Error("Could not read PYODIDE_VERSION from src/lib/pyodide-config.ts");
const cdn = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
const out = path.join(root, ".cache/pyodide", version);
mkdirSync(out, { recursive: true });

const CORE = ["pyodide.asm.js", "pyodide.js", "pyodide.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const DEFAULT_PACKAGES = ["micropip", "numpy", "matplotlib"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function download(name, expected) {
  const target = path.join(out, name);
  if (existsSync(target) && (!expected || sha256(readFileSync(target)) === expected)) return false;
  const response = await fetch(cdn + name);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (expected && sha256(bytes) !== expected) throw new Error(`${name}: SHA-256 does not match the lock file`);
  writeFileSync(target, bytes);
  return true;
}

let fetched = 0;
for (const name of CORE) if (await download(name)) fetched++;
const lock = JSON.parse(readFileSync(path.join(out, "pyodide-lock.json"), "utf8"));

const wanted = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_PACKAGES;
const seen = new Set();
const stack = [...wanted];
while (stack.length > 0) {
  const name = stack.pop();
  if (seen.has(name)) continue;
  const pkg = lock.packages[name];
  if (!pkg) throw new Error(`Unknown Pyodide package: ${name}`);
  seen.add(name);
  stack.push(...pkg.depends);
}
for (const name of [...seen].sort()) {
  const pkg = lock.packages[name];
  if (await download(pkg.file_name, pkg.sha256)) fetched++;
}
console.log(`Pyodide ${version} mirror in ${path.relative(root, out)}: ${CORE.length} core files, ${seen.size} packages (${fetched} downloaded).`);
