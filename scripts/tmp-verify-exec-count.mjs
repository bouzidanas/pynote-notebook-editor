import { chromium } from "playwright";

const URL = "http://127.0.0.1:5199/";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector(".cm-editor", { timeout: 15000 });

const gutterCount = () => page.evaluate(() =>
  [...document.querySelectorAll("div")].filter((d) => /^\[\d+\]:$/.test(d.textContent?.trim() ?? "") && d.childElementCount === 0).length
);
const editorWidth = () => page.evaluate(() => document.querySelector(".cm-editor").getBoundingClientRect().width);

const before = { gutters: await gutterCount(), width: await editorWidth() };
console.log("before:", JSON.stringify(before));

// Open the visibility dialog, uncheck Execution Count, save.
await page.keyboard.press("Alt+v");
await page.waitForSelector("text=Code Cell Visibility");
await page.locator("text=Execution Count").click();
await page.locator('div.fixed:has-text("Code Cell Visibility") button:has-text("Save")').click();
await page.waitForSelector("text=Code Cell Visibility", { state: "detached" });
await page.waitForTimeout(300);

const after = { gutters: await gutterCount(), width: await editorWidth() };
console.log("after:", JSON.stringify(after));

// Toggle back on to confirm it round-trips.
await page.keyboard.press("Alt+v");
await page.waitForSelector("text=Code Cell Visibility");
await page.locator("text=Execution Count").click();
await page.locator('div.fixed:has-text("Code Cell Visibility") button:has-text("Save")').click();
await page.waitForSelector("text=Code Cell Visibility", { state: "detached" });
await page.waitForTimeout(300);
const restored = { gutters: await gutterCount(), width: await editorWidth() };
console.log("restored:", JSON.stringify(restored));

const pass =
  before.gutters > 0 &&
  after.gutters === 0 &&
  after.width > before.width + 30 &&
  restored.gutters === before.gutters;
console.log(pass ? "PASS" : "FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
