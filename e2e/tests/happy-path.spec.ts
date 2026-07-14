import { test, expect } from "../support/fixtures";

// The core authoring loop. Add a code cell, run an expression, see its result.
test.describe("happy path", () => {
  test("add a code cell, execute it, and see output", async ({ notebook }) => {
    await notebook.open();

    await notebook.addCodeCell();
    const lastIndex = (await notebook.cellCount()) - 1;

    await notebook.typeInCell(lastIndex, "1 + 1");
    await notebook.runFocusedCell();

    await expect(notebook.outputs.last()).toContainText("2", {
      timeout: 60_000,
    });
  });
});
