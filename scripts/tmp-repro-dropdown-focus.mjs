/* Clicking dropdown options in the formatting toolbar must not steal focus. */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:5173/");
await page.waitForSelector("strong:has-text('modern')");
await page.waitForTimeout(600);

await page.dblclick("p:has-text('Click a cell')");
await page.waitForSelector(".milkdown-editor-wrapper");
await page.waitForTimeout(400);
await page.getByTitle("Show Formatting Toolbar").click();
await page.waitForTimeout(300);

const info = () =>
  page.evaluate(() => {
    const sel = window.getSelection();
    return {
      focusInEditor: !!document.activeElement?.closest(".milkdown"),
      selText: sel?.toString().slice(0, 20),
      anchorParent: sel?.anchorNode?.parentElement?.tagName,
      menuOpen: !!document.querySelector("[role='menu']"),
    };
  });

// Highlight a word, then use the Heading dropdown
await page.dblclick(".milkdown-editor-wrapper p:has-text('Click a cell')", { position: { x: 60, y: 8 } });
await page.waitForTimeout(200);
console.log("highlighted    :", JSON.stringify(await info()));

await page.click("button[title='Heading Options']");
await page.waitForTimeout(250);
console.log("menu open      :", JSON.stringify(await info()));

await page.click("text=Heading 2");
await page.waitForTimeout(300);
console.log("after H2 click :", JSON.stringify(await info()));
console.log("h2 exists:", await page.evaluate(() => !!document.querySelector(".milkdown-editor-wrapper h2")));

// Table dropdown too (portal-less, align right)
await page.click("button[title='Table Options']");
await page.waitForTimeout(250);
await page.click("text=Insert Table");
await page.waitForTimeout(300);
console.log("after insert   :", JSON.stringify(await info()));
// Type into first header cell to prove editor focus + caret
await page.keyboard.type("W");
console.log("first th:", await page.evaluate(() => document.querySelector(".milkdown-editor-wrapper th")?.textContent));

await browser.close();
