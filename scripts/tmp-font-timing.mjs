import { chromium } from "playwright";

const URL = "http://127.0.0.1:5199/";
const browser = await chromium.launch();
const context = await browser.newContext();

await context.addInitScript(() => {
  window.__firstRenderMs = null;
  const poll = () => {
    const root = document.getElementById("root");
    if (root && root.firstChild) {
      window.__firstRenderMs = performance.now();
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});

const page = await context.newPage();
const requests = [];
page.on("request", (req) => {
  const u = req.url();
  if (u.includes("fonts.googleapis.com") || u.includes("fonts.gstatic.com")) {
    requests.push(u.slice(0, 90));
  }
});

const measure = async (label) => {
  requests.length = 0;
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector("#root > *", { timeout: 20000 });
  const ms = await page.evaluate(() => window.__firstRenderMs);
  console.log(`${label}: firstRender=${ms?.toFixed(0)}ms, fontRequests=${requests.length}`);
  for (const r of requests) console.log(`   ${r}`);
};

// establish origin
await page.goto(URL, { waitUntil: "domcontentloaded" });

// A: bundled font theme (no Google fonts involved)
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("pynote-theme", JSON.stringify({ font: '"JetBrains Mono Variable", monospace' }));
});
await measure("A bundled font, refresh");
await measure("A bundled font, refresh 2");

// B: Google font theme, cold
await page.evaluate(() => {
  localStorage.setItem("pynote-theme", JSON.stringify({ font: '"Fira Code", monospace' }));
  sessionStorage.clear();
});
await measure("B google font, first load");

// C: Google font theme, warm (sessionStorage CSS + HTTP cache)
await measure("C google font, refresh");
await measure("C google font, refresh 2");

// D: existing session whose theme has a Google font, but nothing cached
// (fresh tab). Must NOT block render; font swaps in when ready.
await page.evaluate(() => {
  const id = "timing-test-session";
  localStorage.setItem(
    "pynote-session-" + id,
    JSON.stringify({ cells: [{ id: "c1", type: "markdown", content: "# hi" }], filename: "t.ipynb", theme: { font: '"Fira Code", monospace' } })
  );
  sessionStorage.clear();
});
const dUrl = URL + "?session=timing-test-session";
requests.length = 0;
await page.goto(dUrl, { waitUntil: "load" });
await page.waitForSelector("#root > *", { timeout: 20000 });
const dMs = await page.evaluate(() => window.__firstRenderMs);
console.log(`D existing session, uncached google font: firstRender=${dMs?.toFixed(0)}ms, fontRequests=${requests.length}`);

// E: refresh of the same session, font CSS now session-cached by D's
// background load. This is the everyday refresh case.
for (const n of [1, 2]) {
  requests.length = 0;
  await page.goto(dUrl, { waitUntil: "load" });
  await page.waitForSelector("#root > *", { timeout: 20000 });
  const eMs = await page.evaluate(() => window.__firstRenderMs);
  console.log(`E existing session, cached google font, refresh ${n}: firstRender=${eMs?.toFixed(0)}ms, fontRequests=${requests.length}`);
}

await browser.close();
