import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Button from "./Button";

const { sendInteraction } = vi.hoisted(() => ({
  sendInteraction: vi.fn(),
}));

vi.mock("../../lib/pyodide", () => ({
  kernel: {
    registerComponentListener: vi.fn(),
    unregisterComponentListener: vi.fn(),
    sendInteraction,
  },
}));

describe("Button", () => {
  beforeEach(() => {
    sendInteraction.mockClear();
  });

  test.each([false, "none"] as const)("keeps interaction feedback when border is %s", async (border) => {
    const { container } = render(() => (
      <Button id="borderless" props={{ label: "Run", border, color: "success" }} />
    ));
    const button = screen.getByRole("button", { name: "Run" });

    expect(button).toHaveClass("hover:bg-foreground", "active:bg-primary", "active:text-background");
    expect(container.querySelector("style")?.textContent).toContain(".button-borderless:active");
    expect(container.querySelector("style")?.textContent).toContain("background-color: var(--success) !important");
    expect(container.querySelector("style")?.textContent).toContain("border: none !important");

    await fireEvent.click(button);
    expect(sendInteraction).toHaveBeenCalledWith("borderless", { clicked: true, label: "Run" });
  });
});