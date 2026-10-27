import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, originPrivateFile, queueFileToOpen, writtenFiles } from "../support/file-pickers";
import { TESTID } from "../support/selectors";

/**
 * Notebooks with big attachments (images pasted into Jupyter) or big metadata
 * open, autosave and survive a reload like any other, and nothing in them is
 * lost. localStorage holds about 5 million characters for the whole site in
 * every major browser, so the session keeps those in IndexedDB and only what
 * is edited in PyNote in localStorage.
 */

// 6 MB of base64 (a few screenshots), more than localStorage can hold at all.
const IMAGE = "iVBORw0KGgo".padEnd(6 * 1024 * 1024, "A");
// Widget state other tools keep in the notebook metadata (about 1 MB).
const WIDGETS = { "application/vnd.jupyter.widget-state+json": { state: { w: { blob: "x".repeat(1024 * 1024) } }, version_major: 2 } };

const notebookWith = (image: string) =>
  JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" }, widgets: WIDGETS },
    cells: [
      { id: "pic", cell_type: "markdown", metadata: {}, source: "Screenshot: ![s](attachment:s.png)", attachments: { "s.png": { "image/png": image } } },
      { id: "code", cell_type: "code", metadata: { tags: ["t"] }, source: "x = 1", outputs: [], execution_count: null },
    ],
  });

const BIG = notebookWith(IMAGE);

// The notebook shows exactly these cells, in order. Polled, and a read
// during a page load (the fallback open path loads a new page) counts as
// not yet.
async function expectCells(page: Page, ids: string[]): Promise<void> {
  const shown = () => page.locator("[data-cell-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-cell-id")));
  await expect.poll(() => shown().catch(() => null)).toEqual(ids);
}

async function savedNotebook(page: Page): Promise<any> {
  const before = (await writtenFiles(page)).length;
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await writtenFiles(page)).length).toBe(before + 1);
  const files = await writtenFiles(page);
  return JSON.parse(files[files.length - 1].content);
}

const expectEverythingKept = (saved: any) => {
  expect(saved.cells.map((c: any) => c.id)).toEqual(["pic", "code"]);
  expect(saved.cells[0].attachments["s.png"]["image/png"]).toBe(IMAGE);
  expect(saved.cells[1].metadata).toEqual({ tags: ["t"] });
  expect(saved.metadata.widgets).toEqual(WIDGETS);
  expect(saved.metadata.kernelspec.display_name).toBe("Python 3");
};

const sessionSize = (page: Page) =>
  page.evaluate(() => localStorage.getItem(`pynote-session-${new URLSearchParams(location.search).get("session")}`)?.length ?? -1);

const sessionIdOf = async (page: Page) => (await page.evaluate(() => new URLSearchParams(location.search).get("session")))!;
const storedSession = (page: Page, id: string) => page.evaluate((sid) => localStorage.getItem(`pynote-session-${sid}`), id);
const indexedSessions = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("pynote-sessions-index") ?? "[]") as { id: string }[]).map((s) => s.id));

// Whether IndexedDB database `name` (the session documents, or the file
// handles) has an entry for session `id`.
const inIndexedDb = (page: Page, name: "pynote-session-documents" | "pynote-file-handles", id: string) =>
  page.evaluate(
    ([dbName, sid]) =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(dbName === "pynote-file-handles" ? "handles" : "documents");
        request.onsuccess = () => {
          const db = request.result;
          const store = db.transaction(db.objectStoreNames[0], "readonly").objectStore(db.objectStoreNames[0]);
          const count = store.count(sid);
          count.onsuccess = () => {
            resolve(count.result > 0);
            db.close();
          };
          count.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      }),
    [name, id] as const,
  );

// A new notebook in `page`, once its session is stored.
async function newSessionIn(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByTestId(TESTID.appRoot)).toBeVisible();
  const id = await sessionIdOf(page);
  await expect.poll(() => storedSession(page, id)).not.toBeNull();
  return id;
}

async function typeAtEndOfCell(page: Page, index: number, text: string): Promise<void> {
  await page.locator("[data-cell-id]").nth(index).locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

// A notebook whose one code cell holds `size` characters.
const bigNotebook = (id: string, size: number) =>
  JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [{ id, cell_type: "code", metadata: {}, source: `${id} = "${"d".repeat(size)}"`, outputs: [], execution_count: null }],
  });

async function openWithFileInput(page: Page, name: string, content: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(content) });
}

test.describe("big notebooks in the session", () => {
  test("open without the File System Access API, reload, save: nothing is lost", async ({ page, notebook }) => {
    await installFilePickerStubs(page, { openPicker: false });
    await notebook.goto();
    await openWithFileInput(page, "pictures.ipynb", BIG);
    // This path stores the notebook as a new session and loads that page.
    await expectCells(page, ["pic", "code"]);
    await expect(page.getByTestId(TESTID.autosaveWarning)).toHaveCount(0);
    // The session in localStorage holds what PyNote edits, not the image.
    expect(await sessionSize(page)).toBeLessThan(50_000);

    await page.reload();
    await expectCells(page, ["pic", "code"]);
    expectEverythingKept(await savedNotebook(page));
  });

  test("open in place, edit, reload: the edit and the attachments are kept", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, { name: "pictures.ipynb", content: BIG });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["pic", "code"]);

    await notebook.cells.nth(1).locator(".cm-content").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" + 1");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(TESTID.autosaveWarning)).toHaveCount(0);

    await page.reload();
    await expect(notebook.cells.nth(1).locator(".cm-content")).toContainText("x = 1 + 1");
    const saved = await savedNotebook(page);
    expect(saved.cells[1].source.join("")).toBe("x = 1 + 1");
    saved.cells[1].source = ["x = 1"];
    expectEverythingKept(saved);
  });

  test("when storage is full of older sessions, the oldest make room", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    // Two older sessions fill nearly all of localStorage.
    await page.evaluate(() => {
      const index = JSON.parse(localStorage.getItem("pynote-sessions-index") ?? "[]");
      for (const [id, age] of [["old-1", 2], ["old-2", 1]] as const) {
        localStorage.setItem(`pynote-session-${id}`, JSON.stringify({ cells: [], filename: `${id}.ipynb`, pad: "p".repeat(2_560_000) }));
        index.push({ id, filename: `${id}.ipynb`, lastAccessed: Date.now() - age * 86_400_000 });
      }
      localStorage.setItem("pynote-sessions-index", JSON.stringify(index));
    });
    // A notebook whose own text is large (200 000 characters of code).
    const longCode = `data = "${"d".repeat(200_000)}"`;
    await queueFileToOpen(page, {
      name: "long.ipynb",
      content: JSON.stringify({
        nbformat: 4, nbformat_minor: 5, metadata: {},
        cells: [{ id: "long", cell_type: "code", metadata: {}, source: longCode, outputs: [], execution_count: null }],
      }),
    });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["long"]);
    await expect(page.getByTestId(TESTID.autosaveWarning)).toHaveCount(0);
    // The oldest session made room; the more recent one still fits.
    expect(await page.evaluate(() => localStorage.getItem("pynote-session-old-1"))).toBeNull();

    await page.reload();
    await expectCells(page, ["long"]);
    expect((await savedNotebook(page)).cells[0].source.join("")).toBe(longCode);
  });

  test("when the browser cannot store the notebook, it still opens and says it is not autosaved", async ({ page, notebook }) => {
    await installFilePickerStubs(page, { openPicker: false });
    // localStorage refuses every session (as when it is full of other data).
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith("pynote-session-")) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        return setItem.call(this, key, value);
      };
    });
    await notebook.goto();
    await openWithFileInput(page, "pictures.ipynb", BIG);
    await expectCells(page, ["pic", "code"]);
    await expect(page.getByTestId(TESTID.autosaveWarning)).toBeVisible();
    // Saving to a file still keeps everything.
    expectEverythingKept(await savedNotebook(page));
  });

  test("without IndexedDB, a notebook with small attachments keeps them in localStorage", async ({ page, notebook }) => {
    await installFilePickerStubs(page, { openPicker: false });
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    });
    const small = "iVBORw0KGgo".padEnd(20_000, "B");
    await notebook.goto();
    await openWithFileInput(page, "small.ipynb", notebookWith(small));
    await expectCells(page, ["pic", "code"]);
    await page.reload();
    await expectCells(page, ["pic", "code"]);
    const saved = await savedNotebook(page);
    expect(saved.cells[0].attachments["s.png"]["image/png"]).toBe(small);
    expect(saved.metadata.widgets).toEqual(WIDGETS);
  });

  test("after a reload Save writes to the opened file, unless its attachments were lost", async ({ page, notebook }) => {
    const image = "iVBORw0KGgo".padEnd(100_000, "C");
    await installFilePickerStubs(page, { realOpenHandles: true });
    await notebook.goto();
    await queueFileToOpen(page, { name: "real.ipynb", content: notebookWith(image) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["pic", "code"]);
    await notebook.cells.nth(1).locator(".cm-content").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" + 1");
    await page.keyboard.press("Escape");

    // The handle survives the reload (IndexedDB), so Save writes the file back.
    await page.reload();
    await expect(notebook.cells.nth(1).locator(".cm-content")).toContainText("x = 1 + 1");
    await expect(page.getByTestId(TESTID.documentDataLost)).toHaveCount(0);
    await page.keyboard.press("Control+s");
    await expect.poll(() => originPrivateFile(page, "real.ipynb")).toContain("x = 1 + 1");
    const saved = JSON.parse((await originPrivateFile(page, "real.ipynb"))!);
    expect(saved.cells[0].attachments["s.png"]["image/png"]).toBe(image);
    expect(saved.metadata.widgets).toEqual(WIDGETS);

    // The browser dropped the attachments and metadata (IndexedDB cleared,
    // localStorage kept): Save asks where to save instead of overwriting the
    // file without them.
    await page.evaluate(() => new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("pynote-session-documents");
      request.onsuccess = request.onerror = request.onblocked = () => resolve(null);
    }));
    // That holds for good, also after edits are autosaved and the page is
    // reloaded again.
    for (const reload of [1, 2]) {
      await page.reload();
      await expectCells(page, ["pic", "code"]);
      // The toolbar says what is missing, not only the console.
      await expect(page.getByTestId(TESTID.documentDataLost)).toBeVisible();
      const writesBefore = (await writtenFiles(page)).length;
      await page.keyboard.press("Control+s");
      await expect.poll(async () => (await writtenFiles(page)).length, `reload ${reload}`).toBe(writesBefore + 1);
      await notebook.cells.nth(1).locator(".cm-content").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" + 1");
      await page.keyboard.press("Escape");
    }
    expect(JSON.parse((await originPrivateFile(page, "real.ipynb"))!).cells[0].attachments["s.png"]["image/png"]).toBe(image);
  });
});

/**
 * localStorage is shared by every PyNote tab, so one tab's saves can drop
 * another's sessions: the session limit keeps the ten most recently used,
 * and a save that does not fit makes room by dropping the least recently
 * used. Neither may lose a notebook open in a tab, nor drop anything for a
 * save that fails anyway. These use the browser's real storage limit.
 */
test.describe("sessions open in other tabs, and storage that is full", () => {
  test("a notebook too big for the browser's storage leaves the other notebooks alone", async ({ page }) => {
    test.setTimeout(180_000);
    await installFilePickerStubs(page);
    // Three notebooks the user worked on, never saved to a file.
    const others: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const id = await newSessionIn(page);
      await page.locator("[data-cell-id]").nth(1).locator(".cm-content").click();
      await page.keyboard.press("Control+a");
      await page.keyboard.type(`my work ${i}`);
      await page.keyboard.press("Escape");
      await expect.poll(async () => (await storedSession(page, id)) ?? "").toContain(`my work ${i}`);
      others.push(id);
    }
    const indexBefore = await indexedSessions(page);

    // Its own text is more than localStorage holds for the whole site.
    await queueFileToOpen(page, { name: "big.ipynb", content: bigNotebook("big", 5_400_000) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["big"]);
    await expect(page.getByTestId(TESTID.autosaveWarning)).toBeVisible();

    for (const [i, id] of others.entries()) expect(await storedSession(page, id)).toContain(`my work ${i + 1}`);
    expect(await indexedSessions(page)).toEqual(indexBefore);
    // As the user finds it: the first notebook still has their work.
    await page.goto(`/?session=${others[0]}`);
    await expect(page.locator("[data-cell-id]").nth(1).locator(".cm-content")).toContainText("my work 1");
  });

  test("making room never drops a notebook open in another tab", async ({ page, notebook, context }) => {
    test.setTimeout(180_000);
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, { name: "first.ipynb", content: bigNotebook("first", 2_600_000) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["first"]);
    const first = await sessionIdOf(page);
    await expect.poll(async () => (await storedSession(page, first))?.length ?? 0).toBeGreaterThan(2_600_000);

    // Another tab opens a notebook that only fits without the first one.
    const other = await context.newPage();
    await installFilePickerStubs(other);
    await other.goto("/");
    await expect(other.getByTestId(TESTID.appRoot)).toBeVisible();
    await queueFileToOpen(other, { name: "second.ipynb", content: bigNotebook("second", 2_700_000) });
    await other.keyboard.press("Control+o");
    await expectCells(other, ["second"]);
    await expect(other.getByTestId(TESTID.autosaveWarning)).toBeVisible();

    expect((await storedSession(page, first))?.length ?? 0).toBeGreaterThan(2_600_000);
    expect(await indexedSessions(page)).toContain(first);
  });

  test("a notebook a tab no longer shows makes room for the one it opens in its place", async ({ page, notebook }) => {
    test.setTimeout(180_000);
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, { name: "first.ipynb", content: bigNotebook("first", 2_600_000) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["first"]);
    const first = await sessionIdOf(page);
    await expect.poll(async () => (await storedSession(page, first))?.length ?? 0).toBeGreaterThan(2_600_000);

    // The same tab opens another one that only fits without the first.
    await queueFileToOpen(page, { name: "second.ipynb", content: bigNotebook("second", 2_700_000) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["second"]);
    const second = await sessionIdOf(page);
    await expect.poll(async () => (await storedSession(page, second))?.length ?? 0).toBeGreaterThan(2_700_000);
    await expect(page.getByTestId(TESTID.autosaveWarning)).toHaveCount(0);
    expect(await storedSession(page, first)).toBeNull();

    // So a reload, before any edit, still shows it.
    await page.reload();
    await expectCells(page, ["second"]);
  });

  test("a notebook whose tab was closed makes room, though this tab last saw it open", async ({ page, notebook, context }) => {
    test.setTimeout(180_000);
    await installFilePickerStubs(page);
    await notebook.goto();
    const other = await context.newPage();
    await installFilePickerStubs(other);
    await other.goto("/");
    await expect(other.getByTestId(TESTID.appRoot)).toBeVisible();
    await queueFileToOpen(other, { name: "first.ipynb", content: bigNotebook("first", 2_600_000) });
    await other.keyboard.press("Control+o");
    await expectCells(other, ["first"]);
    const first = await sessionIdOf(other);
    await expect.poll(async () => (await storedSession(other, first))?.length ?? 0).toBeGreaterThan(2_600_000);
    // An edit here, saved while the other tab shows its notebook: this tab
    // looks at which notebooks are open after each save.
    const shown = await sessionIdOf(page);
    await typeAtEndOfCell(page, 1, " # seen");
    await expect.poll(async () => (await storedSession(page, shown)) ?? "").toContain("# seen");
    // The other tab closes without saving anything, so nothing tells this
    // tab its notebook is no longer open.
    await other.close();

    // A notebook that only fits without the closed tab's one.
    await queueFileToOpen(page, { name: "second.ipynb", content: bigNotebook("second", 2_700_000) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["second"]);
    const second = await sessionIdOf(page);
    await expect.poll(async () => (await storedSession(page, second))?.length ?? 0).toBeGreaterThan(2_700_000);
    await expect(page.getByTestId(TESTID.autosaveWarning)).toHaveCount(0);
    expect(await storedSession(page, first)).toBeNull();
  });

  test("a notebook open in a tab is not dropped for newer notebooks", async ({ page, notebook, context }) => {
    test.setTimeout(240_000);
    await installFilePickerStubs(page, { openPicker: false });
    await notebook.goto();
    await openWithFileInput(page, "pictures.ipynb", notebookWith("iVBORw0KGgo".padEnd(20_000, "A")));
    await expectCells(page, ["pic", "code"]);
    const opened = await sessionIdOf(page);
    expect(await inIndexedDb(page, "pynote-session-documents", opened)).toBe(true);

    // The user keeps that tab open and works in another one: ten newer notebooks.
    const other = await context.newPage();
    for (let i = 0; i < 10; i++) await newSessionIn(other);
    expect(await storedSession(page, opened)).not.toBeNull();
    expect(await inIndexedDb(page, "pynote-session-documents", opened)).toBe(true);
    expect(await indexedSessions(page)).toContain(opened);

    // Back in the first tab: an edit, a reload, a save. Nothing is lost.
    await typeAtEndOfCell(page, 1, " + 1");
    await page.reload();
    await expectCells(page, ["pic", "code"]);
    const saved = await savedNotebook(page);
    expect(saved.cells[1].source.join("")).toBe("x = 1 + 1");
    expect(saved.cells[0].attachments["s.png"]["image/png"]).toBe("iVBORw0KGgo".padEnd(20_000, "A"));
    expect(saved.metadata.widgets).toEqual(WIDGETS);
    expect(saved.metadata.kernelspec.display_name).toBe("Python 3");
  });

  test("without Web Locks, a notebook dropped while its tab is open is stored again in full", async ({ page, notebook, context }) => {
    test.setTimeout(240_000);
    // Older browsers, and pages served over plain HTTP, have no Web Locks:
    // other tabs cannot tell the notebook is open.
    await context.addInitScript(() => {
      delete (Navigator.prototype as { locks?: unknown }).locks;
    });
    const image = "iVBORw0KGgo".padEnd(20_000, "C");
    await installFilePickerStubs(page, { realOpenHandles: true });
    await notebook.goto();
    expect(await page.evaluate(() => "locks" in navigator)).toBe(false);
    await queueFileToOpen(page, { name: "real.ipynb", content: notebookWith(image) });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["pic", "code"]);
    const opened = await sessionIdOf(page);
    await expect.poll(() => inIndexedDb(page, "pynote-file-handles", opened)).toBe(true);

    // Ten newer notebooks in another tab drop it, all of it.
    const other = await context.newPage();
    for (let i = 0; i < 10; i++) await newSessionIn(other);
    expect(await storedSession(page, opened)).toBeNull();
    await expect.poll(() => inIndexedDb(page, "pynote-session-documents", opened)).toBe(false);
    await expect.poll(() => inIndexedDb(page, "pynote-file-handles", opened)).toBe(false);

    // The next edit in its tab stores it again: the session, its attachments
    // and metadata, and the opened file's handle.
    await typeAtEndOfCell(page, 1, " + 1");
    await expect.poll(async () => (await storedSession(page, opened)) ?? "").toContain("x = 1 + 1");
    await expect.poll(() => inIndexedDb(page, "pynote-session-documents", opened)).toBe(true);
    await expect.poll(() => inIndexedDb(page, "pynote-file-handles", opened)).toBe(true);

    // So a reload keeps everything, and Save still writes the opened file.
    await page.reload();
    await expectCells(page, ["pic", "code"]);
    await expect(page.getByTestId(TESTID.documentDataLost)).toHaveCount(0);
    await page.keyboard.press("Control+s");
    await expect.poll(() => originPrivateFile(page, "real.ipynb")).toContain("x = 1 + 1");
    const saved = JSON.parse((await originPrivateFile(page, "real.ipynb"))!);
    expect(saved.cells[0].attachments["s.png"]["image/png"]).toBe(image);
    expect(saved.metadata.widgets).toEqual(WIDGETS);
    expect(saved.metadata.kernelspec.display_name).toBe("Python 3");
  });
});
