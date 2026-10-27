import type { Page } from "@playwright/test";

/**
 * Holds the page's zero-delay timers (setTimeout with no delay) until
 * `release`, which runs them in the order they were set. A busy page runs its
 * timers late, after input that came in later; this makes it happen on cue.
 * A held timer that is cleared still runs.
 */
export async function holdZeroDelayTimers(page: Page): Promise<{ release: () => Promise<void> }> {
  await page.evaluate(() => {
    const page = window as unknown as { heldTimers: Array<() => void>; setTimeoutAsIs: typeof setTimeout };
    page.heldTimers = [];
    page.setTimeoutAsIs = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout) return page.setTimeoutAsIs(handler, timeout, ...args);
      page.heldTimers.push(() => (typeof handler === "function" ? handler(...args) : undefined));
      return 0;
    }) as typeof setTimeout;
  });
  return {
    release: () =>
      page.evaluate(() => {
        const page = window as unknown as { heldTimers: Array<() => void>; setTimeoutAsIs: typeof setTimeout };
        window.setTimeout = page.setTimeoutAsIs;
        for (const run of page.heldTimers.splice(0)) run();
      }),
  };
}
