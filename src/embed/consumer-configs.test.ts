import { expect, test } from "vitest";
import path from "node:path";
import { DEFAULT_PREFERENCES, componentOptionsFor } from "../components/export-dialog/preferences";
import { DEFAULT_CODE_VISIBILITY } from "../lib/codeVisibility";
import { CONFIG_FILE, type NotebookLook, componentConfig } from "../lib/export/component-export";
import { currentTheme, defaultTheme, updateTheme } from "../lib/theme";
import { type BuiltinThemeType, getBuiltinTheme } from "../lib/themes";

// The consumer projects (test/consumers, tested by e2e/consumers) all have
// the pynote.config.json PyNote's Export dialog writes for a notebook themed
// with one of PyNote's presets: the e2e tests check that every cell, output
// and widget on their pages follows it. Regenerate with `npx vitest run -u`.

const PRESET: BuiltinThemeType = "neobrutal_light";
const PROJECTS = ["astro", "html", "next", "solidstart"];
const CONSUMERS = path.resolve(import.meta.dirname, "../../test/consumers");

test(`every consumer project has the config the Export dialog writes for the ${PRESET} preset`, async () => {
  // As the theme dialog loads a preset: back to the defaults, the preset over them, its name.
  updateTheme({ ...defaultTheme });
  updateTheme(getBuiltinTheme(PRESET));
  updateTheme({ preset: PRESET });
  // As the Export dialog reads the notebook, with its default Component settings.
  const look: NotebookLook = {
    theme: { ...currentTheme } as unknown as Record<string, unknown>,
    defaultTheme: defaultTheme as unknown as Record<string, unknown>,
    codeVisibility: { ...DEFAULT_CODE_VISIBILITY },
    defaultCodeVisibility: { ...DEFAULT_CODE_VISIBILITY },
  };
  const config = componentConfig(look, componentOptionsFor(DEFAULT_PREFERENCES, "hybrid"));
  expect(config.theme.preset).toBe(PRESET);
  for (const project of PROJECTS) {
    await expect(`${JSON.stringify(config, null, 2)}\n`).toMatchFileSnapshot(path.join(CONSUMERS, project, CONFIG_FILE));
  }
});
