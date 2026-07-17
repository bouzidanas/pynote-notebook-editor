import { chromium } from "playwright";

const URL = "http://127.0.0.1:5199/";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector(".cm-editor", { timeout: 15000 });

// Select the code cell so the dialog opens in cell scope.
await page.locator(".cm-editor").first().click();
await page.keyboard.press("Escape"); // stay selected, exit edit mode
await page.keyboard.press("Alt+v");
await page.waitForSelector("text=Code Cell Visibility");

const inCellScope = await page.locator("text=Execution Count").count();

// Switch scope to Notebook via the Cell/Notebook slider.
await page.locator('div.fixed:has-text("Code Cell Visibility")').locator("text=Notebook").last().click();
await page.waitForTimeout(200);
const inNotebookScope = await page.locator("text=Execution Count").count();

console.log(JSON.stringify({ inCellScope, inNotebookScope }));
const pass = inCellScope === 0 && inNotebookScope === 1;
console.log(pass ? "PASS" : "FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
