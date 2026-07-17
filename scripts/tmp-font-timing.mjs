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
  const marks = await page.evaluate(() =>
    performance.getEntriesByType("mark").map((m) => `${m.name}@${m.startTime.toFixed(0)}`).join(" ")
  );
  console.log(`${label}: firstRender=${ms?.toFixed(0)}ms, fontRequests=${requests.length}`);
  console.log(`   marks: ${marks}`);
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

// A again at the end: if this is now slow too, the C slowdown is an order
// artifact of the harness, not the font path.
await page.evaluate(() => {
  localStorage.setItem("pynote-theme", JSON.stringify({ font: '"JetBrains Mono Variable", monospace' }));
});
await measure("A2 bundled font, at end");
await measure("A2 bundled font, at end 2");

await browser.close();
