import { existsSync } from "node:fs";
import path from "node:path";
import { MIRROR, cell, consumerUrl, editor, expect, openMenu, output, runButton, test } from "./support";

// Pages set up the way packages/pynote/README.md describes: a config that
// locks the execution mode and serves Pyodide from the site itself, and a
// page under the documented Content Security Policy.

test("Pyodide from a folder of the site, named by a path; a locked execution mode", async ({ page, context, watched }) => {
  // The site's /pyodide/ folder holds Pyodide's files (here the local mirror).
  const served: string[] = [];
  const origin = new URL(consumerUrl("html")).origin;
  await context.route(`${origin}/pyodide/**`, async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice("/pyodide/".length));
    served.push(name);
    const file = path.join(MIRROR, name);
    if (existsSync(file)) await route.fulfill({ path: file });
    else await route.fulfill({ status: 404 });
  });
  await page.goto(consumerUrl("html", "settings.html"));
  await expect(editor(page, "define")).toHaveText("x = 21");

  await runButton(page, "use").click();
  await expect(cell(page, "use").getByText(/NameError/)).toBeVisible({ timeout: 90_000 });
  // Reactive mode (from the config): running the first cell reruns the cell that uses x.
  await runButton(page, "define").click();
  await expect(output(page, "use")).toHaveText("x*2=42");
  expect(served).toContain("pyodide.asm.wasm");
  expect(watched.pyodideFromCdn, "Pyodide requests that went to the CDN").toEqual([]);

  // Readers cannot change the execution mode: the menu has no Execution section.
  const menu = await openMenu(page, "define");
  await expect(menu.getByRole("status")).toHaveText("Python is ready");
  await expect(menu.getByText("Execution", { exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitemradio")).toHaveCount(0);
});

test("the Content Security Policy the README documents lets cells run, render math, show figures and widgets", async ({ page, watched }) => {
  // Any blocked script, connection, style, font or image is a console error (the fixture fails on those).
  await page.goto(consumerUrl("html", "csp.html"));
  await runButton(page, "math").click();
  await expect(output(page, "math").locator(".katex").first()).toBeVisible({ timeout: 90_000 });
  expect(await page.evaluate(async () => (await document.fonts.load("1em KaTeX_Main", "π")).length)).toBeGreaterThan(0);
  await runButton(page, "figure").click();
  const figure = cell(page, "figure").locator("img");
  await expect(figure).toBeVisible({ timeout: 90_000 });
  expect(await figure.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // pynote_ui widgets and plots style themselves with inline styles and data: images.
  await runButton(page, "widgets").click();
  await expect(output(page, "widgets").getByRole("slider")).toHaveValue("3", { timeout: 90_000 });
  await expect(output(page, "widgets").getByRole("combobox")).toHaveValue("a");
  await expect(output(page, "widgets").locator(".pynote-plot svg").first()).toBeVisible();
  expect(watched.errors).toEqual([]);
});
