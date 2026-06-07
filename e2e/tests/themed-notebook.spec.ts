import { test, expect } from "../support/fixtures";

// A `?theme=` query param injects a built-in theme's CSS variables before the
// kernel loads, so we assert on `:root` custom properties directly.
test.describe("themed notebook", () => {
  test("loading with ?theme=magic_dark applies theme CSS variables", async ({
    notebook,
  }) => {
    // Theme is applied synchronously on mount — no need to wait for the kernel.
    await notebook.goto("?theme=magic_dark");

    await expect.poll(() => notebook.cssVariable("--background")).toBe("#0b0a0f");
    expect(await notebook.cssVariable("--primary")).toBe("#b9bbfe");
  });
});
