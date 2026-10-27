import { cell, consumerUrl, editor, expect, output, runButton, test } from "./support";

// The Next.js project under `next dev`: React's StrictMode mounts every
// component, unmounts it and mounts it again. Cells must come out as they do
// in production, with the ids the page gave them.

test("Next.js in development: every cell keeps its id", async ({ page, watched }) => {
  await page.goto(consumerUrl("next-dev"));
  for (const id of ["define", "use", "locked", "plain", "dynamic", "hidden"]) {
    await expect(cell(page, id), id).toHaveCount(1);
  }
  await expect(editor(page, "define")).toHaveText("x = 21");
  await runButton(page, "define").click();
  await runButton(page, "use").click();
  await expect(output(page, "use")).toHaveText("x*2=42", { timeout: 90_000 });
  expect(watched.warnings.filter((warning) => warning.startsWith("pynote:"))).toEqual([]);
});
