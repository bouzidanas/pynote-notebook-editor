import { holdZeroDelayTimers } from "../support/timers";
import { cell, consumerUrl, docsShortcuts, drawnOver, editor, expect, openMenu, output, pageShortcuts, receivesClicksAtRightEnd, runButton, test, toolbar } from "./support";

// pynote cells in real projects: several cells on a page are one notebook,
// they edit and run like PyNote's, look like PyNote's whatever the site's
// styles, never change the site, and degrade to plain code without JavaScript.

const PROJECTS = [
  { name: "Astro (MDX page)", consumer: "astro", ssr: true },
  { name: "SolidStart", consumer: "solidstart", ssr: true },
  { name: "Next.js", consumer: "next", ssr: true },
  { name: "HTML", consumer: "html", ssr: false },
] as const;

// Inherited properties: what an element passes to everything inside it,
// shadow roots included, unless they set their own.
const INHERITED = [
  "color", "cursor", "direction", "font-family", "font-size", "font-style", "font-variant-caps", "font-weight",
  "letter-spacing", "line-height", "text-align", "text-indent", "text-shadow", "text-transform", "white-space", "word-spacing",
];

// Site styles that give the elements holding the cells inherited properties
// (a rule that matches an element beats the cells' :host rules), each with a
// change it makes to the page's own prose. Font sizes go through body: the
// root's font size is the rem the cells' sizes follow, by design.
const SITE_STYLES = [
  {
    name: "a universal rule",
    css: "* { font-family: 'Comic Sans MS', cursive; font-style: italic; font-variant: small-caps; font-weight: 900; color: rgb(200, 0, 0); letter-spacing: 0.3em; word-spacing: 1em; line-height: 3; text-align: right; text-indent: 2em; text-transform: uppercase; text-shadow: rgb(255, 0, 0) 1px 1px 0px; white-space: nowrap; cursor: crosshair; }",
    prose: ["color", "rgb(200, 0, 0)"],
  },
  { name: "a dark site", css: "body { background: rgb(20, 20, 20); } * { color: rgb(230, 230, 230); }", prose: ["color", "rgb(230, 230, 230)"] },
  {
    name: "Eric Meyer's reset (the React and Solid cells' elements are divs)",
    css: "html, body, div, span, p, pre { margin: 0; padding: 0; border: 0; font-size: 100%; font: inherit; vertical-align: baseline; } body { font: 20px/3 Georgia, serif; }",
    prose: ["margin-top", "0px"],
  },
  { name: "a larger text size", css: "body, body * { font-size: 22px; }", prose: ["font-size", "22px"] },
] as const;

for (const project of PROJECTS) {
  const url = () => consumerUrl(project.consumer);

  test.describe(project.name, () => {
    test("cells share one Python runtime, and edit and run like PyNote's", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      await expect(editor(page, "define")).toHaveText("x = 21");
      await expect(cell(page, "use").locator(".cm-content")).toContainText("print(f'x*2={x * 2}')");

      // Python starts on first use.
      const menu = await openMenu(page, "define");
      await expect(menu).toContainText("Python starts when a cell runs");
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);

      await runButton(page, "define").click();
      await editor(page, "use").click();
      await page.keyboard.press("Control+Enter");
      await expect(output(page, "use")).toHaveText("x*2=42", { timeout: 90_000 });

      // Edit the second cell and run it again.
      await editor(page, "use").click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText("print(x + 1)");
      await page.keyboard.press("Shift+Enter");
      await expect(output(page, "use")).toHaveText("22");
      await expect(cell(page, "use").locator("text=[2]:")).toBeVisible();
    });

    test("the cell menu shows Python's state, and starts, restarts and shuts it down", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      const status = (menu: Awaited<ReturnType<typeof openMenu>>) => menu.getByRole("status");
      let menu = await openMenu(page, "use");
      await expect(status(menu)).toHaveText("Python starts when a cell runs");
      await expect(menu.getByRole("menuitem", { name: "Restart", exact: true })).toHaveCount(0);
      await page.mouse.click(5, 5);

      // The menu was built before Python started; it follows it all the same.
      await runButton(page, "define").click();
      menu = await openMenu(page, "use");
      await expect(status(menu)).toHaveText("Python is ready", { timeout: 90_000 });
      await expect(menu.getByRole("menuitem", { name: "Start", exact: true })).toHaveCount(0);

      await menu.getByRole("menuitem", { name: "Shut Down", exact: true }).click();
      menu = await openMenu(page, "use");
      await expect(status(menu)).toHaveText("Python is shut down");
      await expect(menu.getByRole("menuitem", { name: "Shut Down", exact: true })).toHaveCount(0);
      await menu.getByRole("menuitem", { name: "Start", exact: true }).click();
      menu = await openMenu(page, "use");
      await expect(status(menu)).toHaveText("Python is ready", { timeout: 90_000 });

      // A restart starts a fresh Python: x is gone until its cell runs again.
      await menu.getByRole("menuitem", { name: "Restart", exact: true }).click();
      menu = await openMenu(page, "use");
      await expect(status(menu)).toHaveText("Python is ready", { timeout: 90_000 });
      await page.mouse.click(5, 5);
      await runButton(page, "use").click();
      await expect(cell(page, "use").getByText(/NameError/)).toBeVisible();
      await runButton(page, "define").click();
      await runButton(page, "use").click();
      await expect(output(page, "use")).toHaveText("x*2=42");
    });

    test("a cell's own view options hold, whatever else the menus change", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      // The page hides this cell's code and printed output.
      await expect(cell(page, "hidden").getByText("Code is hidden")).toBeVisible();
      await expect(editor(page, "hidden")).toBeHidden();

      // Line numbers, from another cell's menu, apply to every cell...
      await (await openMenu(page, "define")).getByRole("menuitem", { name: "Show Line Numbers" }).click();
      await expect(cell(page, "define").locator(".cm-lineNumbers")).toBeVisible();
      // ...and leave this cell's code hidden.
      await expect(editor(page, "hidden")).toBeHidden();

      // It runs (its output replaces the placeholder) and shows no printed output.
      await runButton(page, "hidden").click();
      await expect(cell(page, "hidden").getByText("Code is hidden")).toBeHidden({ timeout: 90_000 });
      await expect(output(page, "hidden")).toHaveCount(0);

      // Show Code changes only the code: the printed output stays hidden.
      let menu = await openMenu(page, "hidden");
      await menu.getByRole("menuitem", { name: "Show Code" }).click();
      await expect(editor(page, "hidden")).toBeVisible();
      await expect(editor(page, "hidden")).toContainText("secret = 42");
      await expect(output(page, "hidden")).toHaveCount(0);
      menu = await openMenu(page, "hidden");
      await menu.getByRole("menuitem", { name: "Hide Code" }).click();
      await expect(editor(page, "hidden")).toBeHidden();
    });

    test("an open menu stays visible and on top of the cells below it", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      await expect(editor(page, "use")).toBeVisible();
      const menu = await openMenu(page, "define");
      // The menu reaches over the next cell's corner, where that cell has its
      // own run button and menu: every item gets the clicks meant for it.
      const items = menu.getByRole("menuitem");
      for (let i = 0; i < (await items.count()); i++) {
        const item = items.nth(i);
        await item.scrollIntoViewIfNeeded();
        expect(await receivesClicksAtRightEnd(item), (await item.textContent())!.trim()).toBe(true);
      }
      // With the pointer elsewhere and the focus gone (Safari and Firefox on
      // macOS do not focus a clicked button), the open menu stays visible.
      await page.evaluate(() => {
        let focused = document.activeElement;
        while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
        (focused as HTMLElement | null)?.blur();
      });
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.mouse.move(2, 2);
      // Once any fade has run its course.
      await expect.poll(() => toolbar(page, "define").evaluate((el) => el.getAnimations().length)).toBe(0);
      await expect(toolbar(page, "define")).toHaveCSS("opacity", "1");
      await expect(toolbar(page, "use")).toHaveCSS("opacity", "0");
    });

    test("a click in a cell reaches the page, and closes another cell's open menu", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      await expect(editor(page, "use")).toBeVisible();
      // The page's own click handlers (closing its menus, say) see clicks made in cells.
      await page.evaluate(() => {
        const site = window as unknown as { clicks: number };
        site.clicks = 0;
        document.addEventListener("click", () => site.clicks++);
      });
      const menu = await openMenu(page, "define");
      await editor(page, "use").click();
      await expect(menu).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(2);
    });

    test("Cmd+Enter runs the cell without adding a line to its code (macOS)", async ({ page, watched }) => {
      void watched;
      // CodeMirror binds Mod (Cmd on macOS) from the platform it sees.
      await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" }));
      await page.goto(url());
      await runButton(page, "define").click();
      await editor(page, "use").click();
      await page.keyboard.press("End");
      await page.keyboard.press("Meta+Enter");
      await expect(output(page, "use")).toHaveText("x*2=42", { timeout: 90_000 });
      await expect(editor(page, "use")).toHaveText("print(f'x*2={x * 2}')");
      await expect(cell(page, "use").locator(".cm-line")).toHaveCount(1);
    });

    test("keys typed in a cell never reach the page's shortcuts, which keep working outside the cells", async ({ page, watched }) => {
      void watched;
      await page.addInitScript(docsShortcuts);
      await page.goto(url());
      await expect(editor(page, "define")).toHaveText("x = 21");

      // Typed into code: the site's search ("/", "s") and page turns (arrows)
      // take none of it, and the cell's own shortcuts work.
      await editor(page, "define").click();
      await page.keyboard.press("End");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.type("  # s/s");
      await expect(editor(page, "define")).toHaveText("x = 21  # s/s");
      // With Ctrl or Cmd, arrows still move in the code (the editor leaves
      // some of them to the browser), and turn no page.
      for (const key of ["Control+ArrowLeft", "Meta+ArrowLeft", "Control+ArrowRight", "Meta+ArrowRight"]) await page.keyboard.press(key);
      await expect(editor(page, "define")).toHaveText("x = 21  # s/s");
      await page.keyboard.press("Control+Enter");
      await editor(page, "use").click();
      await page.keyboard.press("Shift+Enter");
      await expect(output(page, "use")).toHaveText("x*2=42", { timeout: 90_000 });

      // Typed into a widget's field, or moving its slider.
      await runButton(page, "controls").click();
      const name = output(page, "controls").getByRole("textbox", { name: "Your name" });
      await name.click();
      await page.keyboard.type("s/s");
      await expect(name).toHaveValue("s/s");
      const slider = output(page, "controls").getByRole("slider");
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await expect(slider).toHaveValue("31");
      expect(await pageShortcuts(page)).toEqual([]);

      // A shortcut with Ctrl or Cmd that the cell leaves alone reaches the
      // page, as from any text field: the site's search opens.
      await editor(page, "use").click();
      await page.keyboard.press("Meta+k");
      await expect(editor(page, "use")).toHaveText("print(f'x*2={x * 2}')");
      expect(await pageShortcuts(page)).toEqual(["search"]);

      // Outside the cells, the site's shortcuts work.
      await page.mouse.click(5, 5);
      for (const key of ["/", "s", "ArrowRight"]) await page.keyboard.press(key);
      expect(await pageShortcuts(page)).toEqual(["search", "/", "s", "ArrowRight"]);
    });

    test("a click outside a cell takes the keys back from it, however late a busy page handles the click into it", async ({ page, watched }) => {
      void watched;
      await page.addInitScript(docsShortcuts);
      await page.goto(url());
      await expect(editor(page, "define")).toHaveText("x = 21");

      // What the click into the cell sets off runs after the click outside.
      const timers = await holdZeroDelayTimers(page);
      await editor(page, "define").click();
      await page.mouse.click(5, 5);
      await timers.release();
      for (const key of ["/", "s"]) await page.keyboard.press(key);
      expect(await pageShortcuts(page)).toEqual(["/", "s"]);
      await expect(editor(page, "define")).toHaveText("x = 21");
    });

    if (project.consumer !== "html") {
      test("read-only code still runs, and a cell can leave out its menu", async ({ page, watched }) => {
        void watched;
        await page.goto(url());
        await expect(editor(page, "locked")).toHaveText("print('read-only code')");
        await editor(page, "locked").click();
        await page.keyboard.type("zzz");
        await expect(editor(page, "locked")).toHaveText("print('read-only code')");
        await runButton(page, "locked").click();
        await expect(output(page, "locked")).toHaveText("read-only code", { timeout: 90_000 });

        await expect(runButton(page, "plain")).toHaveCount(1);
        await expect(cell(page, "plain").getByRole("button", { name: "Cell menu" })).toHaveCount(0);
      });

      test("the editor's completions show over the cell below", async ({ page, watched }) => {
        void watched;
        await page.goto(url());
        // Completions come from Python.
        await runButton(page, "locked").click();
        await expect(output(page, "locked")).toHaveText("read-only code", { timeout: 90_000 });
        // "locked" comes right after this cell: the completion list goes on over it.
        await editor(page, "use").click();
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type("s");
        const completions = cell(page, "use").locator(".cm-tooltip-autocomplete");
        await expect(completions).toBeVisible();
        expect(await drawnOver(completions, cell(page, "locked"))).toBe(true);
      });
    }

    if (project.consumer === "next" || project.consumer === "solidstart") {
      test("a re-render keeps the reader's edits, and a new code prop replaces them", async ({ page, watched }) => {
        void watched;
        await page.goto(url());
        await expect(editor(page, "dynamic")).toHaveText("print('original')");
        await editor(page, "dynamic").click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.insertText("print('mine')");
        await page.mouse.click(5, 5);
        await page.getByRole("button", { name: /^Re-render/ }).click();
        await expect(editor(page, "dynamic")).toHaveText("print('mine')");
        await page.getByRole("button", { name: "Replace code" }).click();
        await expect(editor(page, "dynamic")).toHaveText("print('replaced')");
      });

      test("a changed view prop changes that option only", async ({ page, watched }) => {
        void watched;
        await page.goto(url());
        await runButton(page, "hidden").click();
        await expect(cell(page, "hidden").getByText("Code is hidden")).toBeHidden({ timeout: 90_000 });
        await expect(output(page, "hidden")).toHaveCount(0);
        // The page stops setting showStdout: it goes back to its default (shown).
        await page.getByRole("button", { name: "Show output" }).click();
        await expect(output(page, "hidden")).toHaveText("the secret is 42", { timeout: 90_000 });
        await expect(editor(page, "hidden")).toBeHidden();
        await page.getByRole("button", { name: "Hide output" }).click();
        await expect(output(page, "hidden")).toHaveCount(0);
        await expect(editor(page, "hidden")).toBeHidden();
      });

      test("a cell mounted again runs on load again", async ({ page, watched }) => {
        void watched;
        await page.goto(url());
        await page.getByRole("button", { name: "Add setup cell" }).click();
        await expect(output(page, "setup")).toHaveText("setup ran", { timeout: 90_000 });
        await page.getByRole("button", { name: "Remove setup cell" }).click();
        await expect(cell(page, "setup")).toHaveCount(0);
        // Back with the same id (a page navigated away from and back to): a new cell, which runs.
        await page.getByRole("button", { name: "Add setup cell" }).click();
        await expect(output(page, "setup")).toHaveText("setup ran");
      });
    }

    if (project.consumer === "html") {
      test("a changed attribute applies, an unchanged code attribute keeps the reader's edits", async ({ page, watched }) => {
        void watched;
        await page.goto(url());
        await expect(editor(page, "define")).toHaveText("x = 21");
        await editor(page, "define").click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.insertText("x = 5");
        await page.mouse.click(5, 5);
        await page.evaluate(() => document.querySelector('pynote-cell[cell-id="define"]')!.setAttribute("menu", "false"));
        await expect(cell(page, "define").getByRole("button", { name: "Cell menu" })).toHaveCount(0);
        await expect(editor(page, "define")).toHaveText("x = 5");
        await page.evaluate(() => document.querySelector('pynote-cell[cell-id="define"]')!.setAttribute("code", "x = 7"));
        await expect(editor(page, "define")).toHaveText("x = 7");
      });
    }

    test("visibilityToggle puts the eye button after Run: it shows what the cell hides, and hides it again", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      const eye = cell(page, "peek").getByRole("button", { name: "Show all elements" });
      await expect(eye).toHaveAttribute("aria-pressed", "false");
      // Hidden code stays in the page, out of sight.
      await expect(editor(page, "peek")).toBeHidden();

      // In the toolbar, right after Run and before the menu.
      const [run, shown, menu] = await Promise.all([
        runButton(page, "peek").boundingBox(),
        eye.boundingBox(),
        cell(page, "peek").getByRole("button", { name: "Cell menu" }).boundingBox(),
      ]);
      expect(shown!.x).toBeGreaterThan(run!.x);
      expect(menu!.x).toBeGreaterThan(shown!.x);

      await eye.click();
      await expect(eye).toHaveAttribute("aria-pressed", "true");
      await expect(editor(page, "peek")).toBeVisible();
      await expect(editor(page, "peek")).toHaveText("answer = 6 * 7");
      await eye.click();
      await expect(eye).toHaveAttribute("aria-pressed", "false");
      await expect(editor(page, "peek")).toBeHidden();

      // The menu's Hide Code while the eye shows everything: the reader's
      // choice for this cell, which ends showing everything.
      await eye.click();
      let cellMenu = await openMenu(page, "peek");
      await cellMenu.getByRole("menuitem", { name: "Hide Code" }).click();
      await expect(editor(page, "peek")).toBeHidden();
      await expect(eye).toHaveAttribute("aria-pressed", "false");
      cellMenu = await openMenu(page, "peek");
      await cellMenu.getByRole("menuitem", { name: "Show Code" }).click();
      await expect(editor(page, "peek")).toBeVisible();
      // Now the cell hides nothing: no eye.
      await expect(eye).toHaveCount(0);

      // Without the option, a cell that hides its code has no eye button.
      await expect(cell(page, "hidden").getByRole("button", { name: "Show all elements" })).toHaveCount(0);
    });

    test("the site's inherited styles never reach into the cells: fonts, colors, spacing, text direction", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      await runButton(page, "define").click();
      await runButton(page, "use").click();
      await expect(output(page, "use")).toHaveText("x*2=42", { timeout: 90_000 });
      await page.mouse.click(5, 5);
      const parts = {
        frame: cell(page, "define"),
        code: editor(page, "define"),
        "execution count": cell(page, "use").getByText("[2]:", { exact: true }),
        "printed output": output(page, "use"),
        "hidden code note": cell(page, "hidden").getByText("Code is hidden"),
        "run button": runButton(page, "define"),
      };
      const look = async () => {
        const styles: Record<string, string[]> = {};
        for (const [name, part] of Object.entries(parts)) {
          styles[name] = await part.evaluate(async (element, properties) => {
            // Once its transitions have run (from a hover, or from a style that changed).
            const transitions = element.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
            await Promise.all(transitions.map((transition) => transition.finished.catch(() => undefined)));
            const style = getComputedStyle(element);
            return properties.map((property) => `${property}: ${style.getPropertyValue(property)}`);
          }, INHERITED);
        }
        return styles;
      };
      const prose = page.getByText(/^Prose between the cells/);
      const before = await look();
      expect(before.frame).toContain("direction: ltr");

      for (const site of SITE_STYLES) {
        const style = await page.addStyleTag({ content: site.css });
        await expect(prose, site.name).toHaveCSS(site.prose[0], site.prose[1]);
        expect(await look(), site.name).toEqual(before);
        await style.evaluate((element) => (element as HTMLStyleElement).remove());
      }
      // A right-to-left site: Python code still reads left to right.
      await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
      await expect(prose).toHaveCSS("direction", "rtl");
      expect(await look(), "dir=rtl").toEqual(before);

      // What hides or disables the page's content (a closed modal, say) still
      // reaches the cells in it, and so does the page's language.
      await page.addStyleTag({ content: "body { visibility: hidden; pointer-events: none; }" });
      const passedOn = await cell(page, "define").evaluate((frame) => {
        const host = (frame.getRootNode() as ShadowRoot).host;
        return ["visibility", "pointer-events", "-webkit-locale"].map((property) => [
          getComputedStyle(frame).getPropertyValue(property),
          getComputedStyle(host).getPropertyValue(property),
        ]);
      });
      expect(passedOn.map(([inCell]) => inCell).slice(0, 2)).toEqual(["hidden", "none"]);
      for (const [inCell, onHost] of passedOn) expect(inCell).toBe(onHost);
    });

    test("the execution mode set from one cell's menu applies to every cell", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      await expect(editor(page, "define")).toHaveText("x = 21");
      const first = await openMenu(page, "define");
      await first.getByText("Reactive", { exact: true }).click();
      const second = await openMenu(page, "use");
      await expect(second.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveText("Reactive");
    });

    if (project.ssr) {
      test("the server-rendered page shows the code as text before any JavaScript", async ({ page, watched }) => {
        void watched;
        const html = await (await page.request.get(url())).text();
        expect(html).toMatch(/<pre data-pynote-source[^>]*>x = 21<\/pre>/);
        // Once the cell runs, that text is replaced by the live cell.
        await page.goto(url());
        await expect(editor(page, "define")).toHaveText("x = 21");
        await expect(page.locator("pre[data-pynote-source]").first()).toBeHidden();
      });
    }
  });
}
