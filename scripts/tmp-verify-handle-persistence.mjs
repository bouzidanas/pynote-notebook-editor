import { chromium } from "playwright";

const URL = "http://127.0.0.1:5199/";
const browser = await chromium.launch();
const context = await browser.newContext();

// Route the open picker to a real OPFS-backed FileSystemFileHandle (cloneable,
// writable without prompts, so the genuine IndexedDB persistence is exercised).
// Also flag if the save picker or a download ever gets used.
await context.addInitScript(() => {
  window.__savePickerUsed = false;
  window.__openPickerUsed = false;
  window.showOpenFilePicker = async () => {
    window.__openPickerUsed = true;
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("roundtrip.ipynb", { create: false });
    return [handle];
  };
  window.showSaveFilePicker = async () => {
    window.__savePickerUsed = true;
    throw new DOMException("nope", "AbortError");
  };
});

const page = await context.newPage();
let downloads = 0;
page.on("download", () => downloads++);
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text().slice(0, 200)); });
page.on("dialog", (d) => { console.log("[dialog]", d.message()); d.dismiss().catch(() => {}); });

await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector("#root > *");

// Seed the OPFS file with a minimal valid notebook.
await page.evaluate(async () => {
  const nb = {
    cells: [{ cell_type: "markdown", source: ["# handle test"], metadata: {}, outputs: [] }],
    metadata: {}, nbformat: 4, nbformat_minor: 5,
  };
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("roundtrip.ipynb", { create: true });
  const w = await handle.createWritable();
  await w.write(JSON.stringify(nb));
  await w.close();
});

// Open it (Cmd+O goes through the mocked picker; handle path, no reload).
await page.keyboard.press("ControlOrMeta+o");
await page.waitForFunction(() => document.body.innerText.includes("handle test"), null, { timeout: 8000 });
console.log("file opened, handle path");

// Refresh. The localStorage session restores; the handle must come from IndexedDB.
await page.reload({ waitUntil: "load" });
await page.waitForSelector("#root > *");
await page.waitForTimeout(600); // allow async handle restore
console.log("reloaded, session restored:", await page.evaluate(() => document.body.innerText.includes("handle test")));

// Save. Should write to the original file, not picker/download.
await page.keyboard.press("ControlOrMeta+s");
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("roundtrip.ipynb");
  const text = await (await handle.getFile()).text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return {
    savedByApp: !!parsed?.metadata?.PyNote,
    cellsPreserved: parsed?.cells?.[0]?.source?.join("").includes("# handle test"),
    savePickerUsed: window.__savePickerUsed,
  };
});
console.log(JSON.stringify({ ...result, downloads }, null, 2));

const pass = result.savedByApp && result.cellsPreserved && !result.savePickerUsed && downloads === 0;
console.log(pass ? "PASS" : "FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
