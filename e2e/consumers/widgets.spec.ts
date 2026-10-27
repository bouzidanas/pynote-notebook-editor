import { TESTID } from "../../src/lib/testids";
import { CONFIG, THEME, cell, consumerUrl, editor, expect, expectThemedCells, openMenu, output, px, rgb, runButton, test } from "./support";

// pynote_ui in embedded cells, used the way a reader uses it, and the theme
// of pynote.config.json (one of PyNote's presets, exported as the Export
// dialog does) on every cell, output and widget, whatever the site's styles.

const PROJECTS = [
  { name: "Astro (MDX page)", consumer: "astro" },
  { name: "SolidStart", consumer: "solidstart" },
  { name: "Next.js", consumer: "next" },
  { name: "HTML", consumer: "html" },
] as const;

/** A border or box shadow of the theme ("2px solid #171717"), as computed styles give it. */
const border = (value: string) => value.replace(/#[0-9a-f]{6}/i, rgb);
const shadow = (value: string) => {
  const [x, y, blur, color] = value.split(" ");
  return `${rgb(color)} ${x} ${y} ${blur} 0px`;
};

for (const project of PROJECTS) {
  const url = () => consumerUrl(project.consumer);

  test.describe(project.name, () => {
    test("input widgets answer the mouse and the keyboard, Python hears them, and what Python changes shows", async ({ page, watched }) => {
      void watched;
      await page.goto(url());
      await runButton(page, "controls").click();
      const widgets = output(page, "controls");
      const slider = widgets.getByRole("slider");
      const loud = widgets.getByRole("checkbox", { name: "Loud" });
      const fruit = widgets.getByRole("combobox");
      const name = widgets.getByRole("textbox", { name: "Your name" });
      // A Text widget, rewritten by the Python callback of every control.
      const summary = widgets.getByText(/ likes /i);
      await expect(slider).toHaveValue("30", { timeout: 90_000 });
      await expect(summary).toHaveText("Someone likes apple at 30");

      // The mouse.
      const track = (await slider.boundingBox())!;
      await slider.click({ position: { x: track.width - 2, y: track.height / 2 } });
      await expect(slider).toHaveValue("100");
      await expect(summary).toHaveText("Someone likes apple at 100");
      await widgets.getByText("Loud", { exact: true }).click();
      await expect(loud).toBeChecked();
      await expect(summary).toHaveText("SOMEONE LIKES APPLE AT 100");
      await fruit.click();
      await widgets.getByRole("option", { name: "banana" }).click();
      await expect(fruit).toHaveValue("banana");
      await expect(summary).toHaveText("SOMEONE LIKES BANANA AT 100");
      await name.click();
      await page.keyboard.type("Ada");
      await expect(summary).toHaveText("ADA LIKES BANANA AT 100");
      // The button's callback sets the slider from Python.
      await widgets.getByRole("button", { name: "Reset" }).click();
      await expect(slider).toHaveValue("30");
      await expect(summary).toHaveText("ADA LIKES BANANA AT 30");

      // The keyboard, from the slider through every control in tab order.
      await slider.focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
      await expect(slider).toHaveValue("35");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Space");
      await expect(loud).not.toBeChecked();
      await page.keyboard.press("Tab");
      // Opens the list on the chosen fruit, moves to the next one, takes it.
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(fruit).toHaveValue("cherry");
      // Tab selects the field's text: typing replaces it.
      await page.keyboard.press("Tab");
      await page.keyboard.type("Ada Lovelace");
      await expect(name).toHaveValue("Ada Lovelace");
      await expect(summary).toHaveText("Ada Lovelace likes cherry at 35");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(slider).toHaveValue("30");
      await expect(summary).toHaveText("Ada Lovelace likes cherry at 30");

      // Python saw every change.
      await runButton(page, "report").click();
      await expect(output(page, "report")).toHaveText("30 False cherry Ada Lovelace");
    });

    test("the configured theme reaches every cell, output and widget, and the page and the cells keep their own styles", async ({ page, watched }) => {
      void watched;
      expect(CONFIG.theme.preset, "the preset the consumer configs were exported with").toBe("neobrutal_light");
      await page.goto(url());
      await expect(editor(page, "define")).toHaveText("x = 21");

      // Printed output, at the theme's output size.
      await runButton(page, "define").click();
      await runButton(page, "use").click();
      const printed = output(page, "use");
      await expect(printed).toHaveText("x*2=42", { timeout: 90_000 });
      await expect(printed).toHaveCSS("font-size", px(THEME.codeTypography.outputFontSize));
      await expect(printed).toHaveCSS("color", rgb(THEME.colors.secondary));

      // Output widgets: Markdown in the theme's prose and header colors, with
      // KaTeX's math; a text box and a plot in the theme's borders and colors.
      await runButton(page, "outputs").click();
      const outputs = output(page, "outputs");
      await expect(outputs.getByRole("heading", { name: "Circles" })).toHaveCSS("color", rgb(THEME.typography.headerColors[1]), { timeout: 90_000 });
      await expect(outputs.locator("p").first()).toHaveCSS("font-size", px(THEME.typography.fontSize));
      await expect(outputs.locator(".katex").first()).toHaveCSS("font-family", /^KaTeX_Main/);
      const box = outputs.getByText("Squares of 0 to 9", { exact: true });
      await expect(box).toHaveCSS("border", border(`2px solid ${THEME.colors.secondary}`));
      await expect(box).toHaveCSS("border-radius", px(THEME.radii.sm));
      await expect(box).toHaveCSS("font-family", THEME.font);
      const plot = outputs.locator(".pynote-plot");
      await expect(plot).toHaveCSS("background-color", rgb(THEME.colors.background));
      await expect(plot).toHaveCSS("border", border(`2px solid ${THEME.colors.foreground}`));
      await expect(plot).toHaveCSS("border-radius", px(THEME.radii.sm));
      await expect(plot.getByText("Squares", { exact: true })).toHaveCSS("font-family", THEME.font);
      await expect(plot.locator('[aria-label="line"] path').first()).toHaveCSS("stroke", rgb(THEME.colors.accent));

      // Input widgets: in the theme's component border (the secondary color),
      // radius and font, never in the site's green; the slider and the toggle
      // in the theme's primary color.
      await runButton(page, "controls").click();
      const widgets = output(page, "controls");
      const slider = widgets.getByRole("slider");
      await expect(slider).toHaveValue("30", { timeout: 90_000 });
      const controls = [
        slider.locator("xpath=../.."),
        widgets.locator("label", { hasText: "Loud" }),
        widgets.getByRole("combobox"),
        widgets.getByRole("textbox", { name: "Your name" }),
        widgets.getByRole("button", { name: "Reset" }),
        widgets.getByText(/ likes /i),
      ];
      for (const control of controls) {
        await expect(control).toHaveCSS("border", border(THEME.componentBorder.replace("var(--secondary)", THEME.colors.secondary)));
        await expect(control).toHaveCSS("border-radius", px(THEME.radii.sm));
        await expect(control).toHaveCSS("font-family", THEME.font);
        await expect(control).toHaveCSS("color", rgb(THEME.colors.secondary));
        await expect(control).not.toHaveCSS("background-color", "rgb(0, 128, 0)");
      }
      await expect(widgets.getByText("30", { exact: true })).toHaveCSS("color", rgb(THEME.colors.primary));
      const toggleTrack = widgets.locator("label", { hasText: "Loud" }).locator(".rounded-full").first();
      await expect(toggleTrack).toHaveCSS("background-color", rgb(THEME.colors.foreground));
      await widgets.getByText("Loud", { exact: true }).click();
      await expect(toggleTrack).toHaveCSS("background-color", rgb(THEME.colors.primary));

      // The cell menu in the theme's UI font and borders, the execution mode
      // marked in the accent color.
      const menu = await openMenu(page, "define");
      const panel = menu.locator("..");
      await expect(panel).toHaveCSS("font-family", THEME.font);
      await expect(panel).toHaveCSS("font-weight", THEME.uiTypography.fontWeight);
      await expect(panel).toHaveCSS("border", border(`${THEME.uiBorder.border} solid ${THEME.uiBorder.color}`));
      await expect(panel).toHaveCSS("border-radius", px(THEME.radii.sm));
      await expect(menu.getByRole("status")).toHaveCSS("font-size", px(THEME.uiTypography.baseFontSize));
      await expect(menu.locator('[role="menuitemradio"][aria-checked="true"] > div')).toHaveCSS("background-color", rgb(THEME.colors.accent));
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);

      // A selected cell, then one being edited, in the theme's cell borders
      // and shadow, with the caret in the accent color.
      const frame = cell(page, "use").getByTestId(TESTID.cell);
      await printed.click();
      await expect(frame).toHaveCSS("border", border(THEME.cellBorder.select));
      await editor(page, "use").click();
      await expect(frame).toHaveCSS("border", border(THEME.cellBorder.edit));
      await expect(frame).toHaveCSS("box-shadow", shadow(THEME.cellShadow.edit));
      await expect(cell(page, "use").locator(".cm-cursor").first()).toHaveCSS("border-left-color", rgb(THEME.colors.accent));
      await page.mouse.click(5, 5);

      // Every cell on the page, and the theme's fonts loaded (not only named).
      await expectThemedCells(page);
      for (const family of [THEME.font, THEME.codeTypography.fontFamily]) {
        expect(await page.evaluate(async (font) => (await document.fonts.load(`16px ${font}`)).length, family), family).toBeGreaterThan(0);
      }

      // The site's rules (red code, green buttons, inputs and selects) do not
      // reach into the cells...
      expect(await editor(page, "define").evaluate((el) => getComputedStyle(el).color)).not.toBe("rgb(200, 0, 0)");
      expect(await runButton(page, "define").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(0, 128, 0)");
      // ...and nothing of PyNote's reaches the page.
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(250, 248, 240)");
      expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Georgia");
      expect(await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Georgia");
      expect(await page.evaluate(() => document.documentElement.getAttribute("style") ?? "")).toBe("");
    });
  });
}
