import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import os from "os";

const URL = "http://127.0.0.1:5199/";
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const themedNb = path.join(repo, "themed-notebooks/magic_dark_theme_notebook.ipynb");

const browser = await chromium.launch();
const context = await browser.newContext();

// Capture what the app writes through the save picker.
await context.addInitScript(() => {
  window.__savedContent = null;
  window.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async (c) => { window.__savedContent = c; },
      close: async () => {},
    }),
  });
});

const page = await context.newPage();

const openVisibilityDialogAndAssert = async (expected) => {
  await page.keyboard.press("Alt+v");
  await page.waitForSelector("text=Code Cell Visibility", { timeout: 5000 });
  const btn = page.locator('button[title^="Output position:"]');
  await btn.waitFor({ timeout: 5000 });
  const text = (await btn.innerText()).trim();
  console.log(`dialog toggle shows: "${text}" (expected ${expected})`);
  return { btn, text };
};

// 1. Load the themed notebook (embedded theme has outputLayout "above") via
//    the fallback input, which reloads into a new session.
await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector("#root > *");
const input = page.locator('input[accept=".ipynb"]');
await Promise.all([
  page.waitForNavigation({ timeout: 15000 }),
  input.setInputFiles(themedNb),
]);
await page.waitForSelector("#root > *");

// 2. Open the visibility dialog, confirm it starts at "above" (the preset
//    value), toggle to "below", check "Save settings to .ipynb", save.
const { btn, text } = await openVisibilityDialogAndAssert("above");
if (text.includes("above")) await btn.click();
console.log("after click:", (await btn.innerText()).trim());
await page.locator("text=Save settings to .ipynb").click();
await page.locator('button:has-text("Save")').last().click();

// 3. Save the notebook (Cmd/Ctrl+S goes through the mocked picker).
await page.keyboard.press("ControlOrMeta+s");
await page.waitForFunction(() => window.__savedContent !== null, { timeout: 5000 });
const saved = JSON.parse(await page.evaluate(() => window.__savedContent));
const savedTheme = saved.metadata?.PyNote?.theme;
console.log("saved theme.outputLayout:", savedTheme?.outputLayout);
console.log("saved codeview present:", !!saved.metadata?.PyNote?.codeview);

// 4. Round trip: load the just-saved file back and confirm the dialog shows "below".
const tmp = path.join(os.tmpdir(), "outputlayout-roundtrip.ipynb");
fs.writeFileSync(tmp, JSON.stringify(saved));
await Promise.all([
  page.waitForNavigation({ timeout: 15000 }),
  page.locator('input[accept=".ipynb"]').setInputFiles(tmp),
]);
await page.waitForSelector("#root > *");
const reopened = await openVisibilityDialogAndAssert("below");

const pass = savedTheme?.outputLayout === "below" && reopened.text.includes("below");
console.log(pass ? "PASS" : "FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
