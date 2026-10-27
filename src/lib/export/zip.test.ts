import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, zipFiles } from "./zip";

// Python's zipfile is the reference reader: it checks every CRC (testzip)
// and decodes names by the UTF-8 flag. Contents come back as hex.
const hex = (text: string) => Buffer.from(text, "utf8").toString("hex");

const readWithPython = (zip: Uint8Array): { names: string[]; contents: Record<string, string>; bad: string | null; dates: number[][] } => {
  const dir = mkdtempSync(path.join(tmpdir(), "pynote-zip-"));
  try {
    const file = path.join(dir, "out.zip");
    writeFileSync(file, zip);
    const script = [
      "import json, sys, zipfile",
      "z = zipfile.ZipFile(sys.argv[1])",
      "print(json.dumps({'names': z.namelist(), 'bad': z.testzip(),",
      "  'contents': {n: z.read(n).hex() for n in z.namelist()},",
      "  'dates': [list(i.date_time) for i in z.infolist()]}))",
    ].join("\n");
    return JSON.parse(execFileSync("python3", ["-I", "-c", script, file], { encoding: "utf8" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("zipFiles", () => {
  test("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  test("writes an archive Python's zipfile reads back exactly", () => {
    const files = new Map<string, string | Uint8Array>([
      ["notebook/index.html", "<!doctype html>\n<p>hi</p>\n"],
      ["notebook/pyodide/numpy-2.2.5.whl.js", "window.__pynoteAsset(\"numpy\", \"QUJD\");\n"],
      ["notebook/README.txt", "Ünïcödé name check: 日本語\n"],
      ["notebook/empty.txt", ""],
      ["notebook/bytes.bin", new Uint8Array([0, 1, 2, 255])],
    ]);
    const zip = zipFiles(files, new Date(2026, 9, 14, 13, 45, 30));
    const read = readWithPython(zip);
    expect(read.bad).toBeNull();
    expect(read.names).toEqual([...files.keys()]);
    expect(read.contents["notebook/index.html"]).toBe(hex("<!doctype html>\n<p>hi</p>\n"));
    expect(read.contents["notebook/README.txt"]).toBe(hex("Ünïcödé name check: 日本語\n"));
    expect(read.contents["notebook/empty.txt"]).toBe("");
    expect(read.contents["notebook/bytes.bin"]).toBe("000102ff");
    expect(read.dates[0]).toEqual([2026, 10, 14, 13, 45, 30]);
  });

  test("keeps UTF-8 file names", () => {
    const read = readWithPython(zipFiles(new Map([["café/ノート.py", "print(1)\n"]])));
    expect(read.names).toEqual(["café/ノート.py"]);
  });

  test("rejects paths that could escape the extraction folder", () => {
    expect(() => zipFiles(new Map([["../evil.txt", "x"]]))).toThrow(/relative/);
    expect(() => zipFiles(new Map([["/abs.txt", "x"]]))).toThrow(/relative/);
  });
});
