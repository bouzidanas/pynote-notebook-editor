/* preserveFocus dropdowns: formatting toolbar menus keep editor focus;
   app menus (File) still take focus as before. */
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
    };
  });

// Formatting toolbar dropdown: highlight word, apply Heading 2 from menu
await page.dblclick(".milkdown-editor-wrapper p:has-text('Click a cell')", { position: { x: 60, y: 8 } });
await page.waitForTimeout(200);
await page.click("button[title='Heading Options']");
await page.waitForTimeout(250);
await page.click("text=Heading 2");
await page.waitForTimeout(300);
console.log("formatting menu:", JSON.stringify(await info()), "h2:", await page.evaluate(() => !!document.querySelector(".milkdown-editor-wrapper h2")));

await browser.close();
