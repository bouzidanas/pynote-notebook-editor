import { describe, expect, test } from "vitest";
import { FRAMEWORKS } from "../../lib/export/component-export";
import { formatInfo } from "./formats";

describe("formats", () => {
  test("the Component summary names every framework its Framework toggle offers", () => {
    const summary = formatInfo("component").summary;
    for (const framework of FRAMEWORKS) expect(summary).toContain(framework.label);
  });
});
