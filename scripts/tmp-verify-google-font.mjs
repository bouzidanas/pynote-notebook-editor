import { chromium } from "playwright";

const URL = "http://127.0.0.1:5199/";
const browser = await chromium.launch();
const context = await browser.newContext();

// Record whether the Google font was already usable at the moment the app
// first rendered anything into #root (i.e. font landed with the theme).
await context.addInitScript(() => {
  window.__fontReadyAtFirstRender = "no-render";
  const poll = () => {
    const root = document.getElementById("root");
    if (root && root.firstChild) {
      window.__fontReadyAtFirstRender = document.fonts.check('16px "Fira Code"');
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});

const page = await context.newPage();

// Visit once to establish the origin, then set an app theme that references
// a Google font that is not bundled with the app.
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem(
    "pynote-theme",
    JSON.stringify({ font: '"Fira Code", monospace' })
  );
});

await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector("#root > *", { timeout: 15000 });

const result = await page.evaluate(() => ({
  fontReadyAtFirstRender: window.__fontReadyAtFirstRender,
  fontLoadedNow: document.fonts.check('16px "Fira Code"'),
  styleTagInjected: !!document.querySelector('style[data-google-font="Fira Code"]'),
  fontMonoVar: getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim(),
}));

console.log(JSON.stringify(result, null, 2));

// Reload: same session cache (sessionStorage CSS) should serve the font with
// zero requests to the Google Fonts CSS endpoint.
let cssRequests = 0;
page.on("request", (req) => {
  if (req.url().startsWith("https://fonts.googleapis.com/")) cssRequests++;
});
await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector("#root > *", { timeout: 15000 });
const reload = await page.evaluate(() => ({
  fontReadyAtFirstRender: window.__fontReadyAtFirstRender,
  cssCached: !!sessionStorage.getItem("pynote-gfont-Fira Code"),
}));
console.log(JSON.stringify({ ...reload, cssRequests }, null, 2));

// Second scenario: bundled font stays untouched (no Google fetch).
await page.evaluate(() => {
  localStorage.setItem(
    "pynote-theme",
    JSON.stringify({ font: '"JetBrains Mono Variable", monospace' })
  );
});
await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector("#root > *", { timeout: 15000 });
const bundled = await page.evaluate(() => ({
  googleStyleTags: document.querySelectorAll("style[data-google-font]").length,
}));
console.log(JSON.stringify(bundled, null, 2));

await browser.close();
