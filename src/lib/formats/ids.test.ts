import { afterEach, describe, expect, test, vi } from "vitest";
import { isValidCellId, newCellId } from "./ids";

// New cell ids, for the app's notebooks and for cells the pynote package
// embeds in other sites, some of which are served over plain HTTP.

/**
 * The page's crypto without a secure context (plain HTTP on any host but
 * localhost): getRandomValues, but no randomUUID. Each call fills its array
 * from the next of `draws`.
 */
const insecureCrypto = (...draws: number[][]) =>
  vi.stubGlobal("crypto", {
    getRandomValues: <T extends ArrayBufferView>(array: T): T => {
      (array as unknown as Uint8Array).set(draws.shift()!);
      return array;
    },
  });

afterEach(() => vi.unstubAllGlobals());

describe("new cell ids", () => {
  test("are 8 lowercase hex characters, valid nbformat ids, and random", () => {
    const ids = Array.from({ length: 50 }, () => newCellId());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}$/);
      expect(isValidCellId(id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("come from 32 random bits, also on pages without a secure context (no crypto.randomUUID)", () => {
    insecureCrypto([0x00, 0x0a, 0xbc, 0xff]);
    expect(typeof (globalThis.crypto as Partial<Crypto>).randomUUID).toBe("undefined");
    expect(newCellId()).toBe("000abcff");
  });

  test("never repeat an id the notebook already has", () => {
    insecureCrypto([0xde, 0xad, 0xbe, 0xef], [0x12, 0x34, 0x56, 0x78]);
    expect(newCellId(new Set(["deadbeef"]))).toBe("12345678");
  });
});
