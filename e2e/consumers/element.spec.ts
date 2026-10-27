import { TESTID } from "../../src/lib/testids";
import { cell, consumerUrl, editor, expect, expectThemedCells, openMenu, output, runButton, test } from "./support";

// <pynote-cell> on pages whose scripts and widgets do what pages do: create
// elements, set and remove attributes, move elements around, stop events.

test.describe("HTML", () => {
  test("an element added by a script picks up the attributes set after it, and a removed attribute goes back to its default", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("html"));
    await expect(editor(page, "define")).toHaveText("x = 21");
    // Its attributes arrive while the runtime still loads for it.
    await page.evaluate(() => {
      const element = document.createElement("pynote-cell");
      element.setAttribute("cell-id", "late");
      document.body.append(element);
      element.setAttribute("code", "print('late')");
      element.setAttribute("editable", "false");
    });
    await expect(editor(page, "late")).toHaveText("print('late')");
    await editor(page, "late").click();
    await page.keyboard.type("zz");
    await expect(editor(page, "late")).toHaveText("print('late')");

    await page.evaluate(() => document.querySelector('pynote-cell[cell-id="late"]')!.removeAttribute("editable"));
    await editor(page, "late").click();
    await page.keyboard.press("End");
    await page.keyboard.type("  # mine");
    await expect(editor(page, "late")).toHaveText("print('late')  # mine");

    await page.evaluate(() => document.querySelector('pynote-cell[cell-id="hidden"]')!.removeAttribute("show-code"));
    await expect(editor(page, "hidden")).toContainText("secret = 42");
  });

  test("a removed autorun attribute goes back to the config's, which runs the cell", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("html"));
    await page.evaluate(() => {
      const element = document.createElement("pynote-cell");
      element.setAttribute("cell-id", "later");
      element.setAttribute("autorun", "false");
      element.setAttribute("code", "print('later ran')");
      document.body.append(element);
    });
    await expect(editor(page, "later")).toHaveText("print('later ran')");
    // The page's settings now run cells on load (configure(), on the page-wide runtime the package shares).
    await page.evaluate(() => {
      const slot = globalThis as unknown as Record<symbol, { configure(config: { autorun: boolean }): void }>;
      slot[Symbol.for("pynote.runtime")].configure({ autorun: true });
    });
    // Every other cell runs, in page order; this one keeps to its own setting.
    await expect(output(page, "guarded")).toHaveText("guarded ran", { timeout: 90_000 });
    await expect(output(page, "later")).toHaveCount(0);
    await page.evaluate(() => document.querySelector('pynote-cell[cell-id="later"]')!.removeAttribute("autorun"));
    await expect(output(page, "later")).toHaveText("later ran");
  });

  test("an element moved on the page keeps its cell, which takes its new place in the notebook", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("html"));
    await editor(page, "use").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("print('edited')");
    await runButton(page, "use").click();
    await expect(output(page, "use")).toHaveText("edited", { timeout: 90_000 });
    await expect(cell(page, "use").getByText("[2]:", { exact: true })).toBeVisible();

    // Into a panel at the top of the page (a tab, a fullscreen view).
    await page.evaluate(() => {
      const panel = document.createElement("section");
      document.body.prepend(panel);
      panel.append(document.querySelector('pynote-cell[cell-id="use"]')!);
    });
    await expect(editor(page, "use")).toHaveText("print('edited')");
    await expect(output(page, "use")).toHaveText("edited");
    // First on the page, first in the notebook.
    await expect(cell(page, "use").getByText("[1]:", { exact: true })).toBeVisible();
    await expect(cell(page, "define").getByText("[2]:", { exact: true })).toBeVisible();
  });

  test("cells inside the page's own components, or passed to their slots, take their place in the notebook between the cells around them", async ({ page, watched }) => {
    void watched;
    // "middle" is in the open shadow root of the site's <site-callout>. The
    // site's <site-panel> has a closed shadow root: "slotted" (a child of the
    // panel) shows at its slot, before the panel's own cell, "inside". All
    // run on load, in page order.
    await page.goto(consumerUrl("html", "components.html"));
    await expect(output(page, "last")).toHaveText("['first', 'middle', 'slotted', 'inside', 'last']", { timeout: 90_000 });
    // ("inside" is out of reach in its closed root.)
    for (const [id, number] of [["first", 1], ["middle", 2], ["slotted", 3], ["last", 5]] as const) {
      await expect(cell(page, id).getByText(`[${number}]:`, { exact: true }), id).toBeVisible();
    }
  });

  test("cells mount and run on a plain-HTTP site, where pages have no crypto.randomUUID (no secure context)", async ({ page, watched }) => {
    void watched;
    // The site at a host other than localhost, over plain HTTP: an intranet
    // site, or a dev server opened from a phone on the LAN.
    const site = new URL(consumerUrl("html"));
    await page.route("http://pynote.test/**", async (route) => {
      const { pathname, search } = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: `${site.origin}${pathname}${search}` }) });
    });
    await page.goto("http://pynote.test/");
    expect(await page.evaluate(() => [window.isSecureContext, typeof crypto.randomUUID])).toEqual([false, "undefined"]);
    await expect(editor(page, "define")).toHaveText("x = 21");

    // A cell without an id gets one.
    await page.evaluate(() => {
      const element = document.createElement("pynote-cell");
      element.setAttribute("code", "print('no id')");
      document.body.append(element);
    });
    await expect(page.locator("pynote-cell:not([cell-id]) .pynote-cell")).toHaveAttribute("data-pynote-cell", /^[0-9a-f]{8}$/);

    await runButton(page, "define").click();
    await runButton(page, "use").click();
    await expect(output(page, "use")).toHaveText("x*2=42", { timeout: 90_000 });
  });

  test("the eye's show-all ends when the page turns visibilityToggle off, and does not come back with a cell added back", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("html"));
    const peek = page.locator('pynote-cell[cell-id="peek"]');
    const eye = cell(page, "peek").getByRole("button", { name: "Show all elements" });
    await eye.click();
    await expect(editor(page, "peek")).toBeVisible();

    // The page removes the option: the eye goes, and the cell shows what the page lets it.
    await peek.evaluate((element) => element.removeAttribute("visibility-toggle"));
    await expect(eye).toHaveCount(0);
    await expect(editor(page, "peek")).toBeHidden();

    // The option back, the eye pressed again; then the element leaves the
    // page and comes back: a new cell, which starts from the page's view.
    await peek.evaluate((element) => element.setAttribute("visibility-toggle", ""));
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await eye.click();
    await expect(editor(page, "peek")).toBeVisible();
    await peek.evaluate(async (element) => {
      element.remove();
      await new Promise((resolve) => setTimeout(resolve, 100));
      document.body.append(element);
    });
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await expect(editor(page, "peek")).toBeHidden();
  });

  test("cells work inside a widget that stops events from bubbling", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("html"));
    await runButton(page, "guarded").click();
    await expect(output(page, "guarded")).toHaveText("guarded ran", { timeout: 90_000 });
    let menu = await openMenu(page, "guarded");
    await menu.getByRole("menuitem", { name: "Clear Output" }).click();
    await expect(output(page, "guarded")).toHaveCount(0);
    // A click elsewhere in the card closes an open menu.
    menu = await openMenu(page, "guarded");
    await page.getByText("A card that keeps clicks and keys to itself").click();
    await expect(menu).toHaveCount(0);
    await editor(page, "guarded").click();
    await page.keyboard.press("Control+Enter");
    await expect(output(page, "guarded")).toHaveText("guarded ran");

    // A click on a cell (here its output) selects it, there as anywhere else:
    // the cell selected before loses its accent border.
    const frame = (id: string) => cell(page, id).getByTestId(TESTID.cell);
    await editor(page, "use").click();
    await expect(frame("use")).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await output(page, "guarded").click();
    await expect(frame("use")).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  });

  test("the page's own math keeps its style, and the cells' math has KaTeX's fonts", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("html"));
    await expect(editor(page, "define")).toHaveText("x = 21");
    // The site sets .katex { font-size: 1em }; PyNote's KaTeX rules stay in the cells.
    const siteMath = page.locator("#site-math");
    expect(await siteMath.evaluate((el) => getComputedStyle(el).fontSize)).toBe(await siteMath.evaluate((el) => getComputedStyle(el.parentElement!).fontSize));
    expect(await siteMath.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Georgia");

    await editor(page, "define").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("from pynote_ui import print_md\nprint_md('The area is $\\\\pi r^2$')");
    await page.keyboard.press("Control+Enter");
    const math = output(page, "define").locator(".katex").first();
    await expect(math).toBeVisible({ timeout: 90_000 });
    expect(await math.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("KaTeX_Main");
    // KaTeX's faces load at page level, from the same KaTeX version on the CDN.
    expect(await page.evaluate(async () => (await document.fonts.load("1em KaTeX_Main", "π")).length)).toBeGreaterThan(0);
  });
});

test.describe("Astro (custom elements)", () => {
  test("custom elements run on load, in page order", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("astro", "element"));
    await expect(output(page, "second")).toHaveText("total = 12", { timeout: 90_000 });
    await expect(editor(page, "first")).toHaveText("items = [3, 4, 5]total = sum(items)");
  });

  test("the configured theme reaches these cells too", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("astro", "element"));
    await expect(output(page, "second")).toHaveText("total = 12", { timeout: 90_000 });
    await expectThemedCells(page);
  });

  test("an element added back is a new cell, which runs on load again", async ({ page, watched }) => {
    void watched;
    await page.goto(consumerUrl("astro", "element"));
    await expect(output(page, "second")).toHaveText("total = 12", { timeout: 90_000 });
    await page.evaluate(() => {
      const element = document.querySelector('pynote-cell[cell-id="second"]')!;
      (window as unknown as { removed: Element }).removed = element;
      element.remove();
    });
    await expect(cell(page, "second")).toHaveCount(0);
    await page.evaluate(() => document.body.append((window as unknown as { removed: Element }).removed));
    await expect(output(page, "second")).toHaveText("total = 12");
  });
});
