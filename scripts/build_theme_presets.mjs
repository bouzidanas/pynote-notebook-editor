#!/usr/bin/env node
// Regenerates src/lib/themes.ts from the themed notebooks in themed-notebooks/.
//
// Each notebook's metadata.PyNote.theme is extracted into a built-in preset.
// The preset key is the notebook filename with the "_theme_notebook.ipynb"
// suffix removed (e.g. magic_dark_theme_notebook.ipynb -> "magic_dark"), and the
// display label is that key title-cased (e.g. "Magic Dark"). Notebooks without a
// theme in their metadata are skipped.
//
// Run with: npm run gen:presets

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const NOTEBOOKS_DIR = join(ROOT, "themed-notebooks");
const OUT_FILE = join(ROOT, "src", "lib", "themes.ts");

/** filename -> preset key, e.g. "magic_dark_theme_notebook.ipynb" -> "magic_dark" */
const keyForFile = (file) =>
  basename(file, ".ipynb").replace(/_theme_notebook$/, "");

/** preset key -> display label, e.g. "magic_dark" -> "Magic Dark" */
const labelForKey = (key) =>
  key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Indent every line of a JSON string by `pad` spaces (first line excluded). */
const indent = (json, pad) =>
  json
    .split("\n")
    .map((line, i) => (i === 0 ? line : " ".repeat(pad) + line))
    .join("\n");

const files = readdirSync(NOTEBOOKS_DIR)
  .filter((f) => f.endsWith(".ipynb"))
  .sort();

const presets = [];
const skipped = [];

for (const file of files) {
  const nb = JSON.parse(readFileSync(join(NOTEBOOKS_DIR, file), "utf8"));
  const theme = nb?.metadata?.PyNote?.theme;
  if (!theme || typeof theme !== "object" || Object.keys(theme).length === 0) {
    skipped.push(file);
    continue;
  }
  const key = keyForFile(file);
  presets.push({ key, label: labelForKey(key), theme });
}

const presetEntries = presets
  .map(({ key, theme }) => `    "${key}": ${indent(JSON.stringify(theme, null, 4), 4)},`)
  .join("\n");

const listEntries = presets
  .map(({ key, label }) => `    { type: "${key}", label: ${JSON.stringify(label)} },`)
  .join("\n");

const out = `// AUTO-GENERATED FILE — do not edit by hand.
// Regenerate with: npm run gen:presets
//
// Built-in theme presets, extracted from themed-notebooks/*.ipynb
// (metadata.PyNote.theme). Used by the Presets section of the theme dialog and
// the ?theme= query parameter.

import type { Theme } from "./theme";

// Deep partial — allows omitting nested keys. updateTheme() merges each
// sub-object independently, so missing keys keep their current/default values.
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Theme data without saveToExport (added at application time).
type ThemePreset = DeepPartial<Omit<Theme, "saveToExport">>;

const PRESETS = {
${presetEntries}
} satisfies Record<string, ThemePreset>;

export const BUILTIN_THEMES = PRESETS;

/** A built-in preset key (derived from the themed-notebook filename). */
export type BuiltinThemeType = keyof typeof PRESETS;

/** Ordered list of presets for the theme dialog's Presets dropdown. */
export const THEME_PRESETS: { type: BuiltinThemeType; label: string }[] = [
${listEntries}
];

/** Check if a string is a valid built-in theme type. */
export function isBuiltinTheme(value: string | null): value is BuiltinThemeType {
    return value !== null && value in PRESETS;
}

/** Get the theme data for a built-in theme. */
export function getBuiltinTheme(type: BuiltinThemeType): ThemePreset {
    return PRESETS[type];
}
`;

writeFileSync(OUT_FILE, out, "utf8");

console.log(`Generated ${OUT_FILE}`);
console.log(`  Presets: ${presets.map((p) => p.label).join(", ") || "(none)"}`);
if (skipped.length) {
  console.log(`  Skipped (no metadata.PyNote.theme): ${skipped.join(", ")}`);
}
