import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sessionManager } from "./session";

// Sessions live in localStorage, which browsers cap at about 5 million
// characters for the whole site. These tests give it a small cap instead.
const QUOTA = 2_000;

const usedBy = (storage: Storage, except: string) => {
  let used = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)!;
    if (key !== except) used += key.length + storage.getItem(key)!.length;
  }
  return used;
};

const session = (filename: string, size: number) => ({ cells: [], filename, pad: "p".repeat(size) });

const stored = (id: string) => localStorage.getItem(`pynote-session-${id}`);

const indexed = () => sessionManager.getSessions().map((s) => s.id).sort();

// Web Locks as a browser has them: `elsewhere` are sessions other tabs hold.
function installLocks(elsewhere: string[] = []) {
  const holding: Array<{ name: string; mode?: LockMode }> = [];
  const locks = {
    request: vi.fn((name: string, options: LockOptions, callback: () => Promise<void>) => {
      const lock = { name, mode: options.mode };
      return Promise.resolve()
        .then(() => {
          holding.push(lock);
          return callback();
        })
        .finally(() => holding.splice(holding.indexOf(lock), 1));
    }),
    query: vi.fn(async () => ({
      held: [...elsewhere.map((id) => ({ name: `pynote-session:${id}`, mode: "shared" as LockMode })), ...holding],
      pending: [],
    })),
  };
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
  return { locks, holding };
}

describe("sessionManager.saveSession", () => {
  beforeEach(() => {
    localStorage.clear();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (usedBy(this, key) + key.length + value.length > QUOTA) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete (navigator as { locks?: unknown }).locks;
    await sessionManager.refreshOpenSessions();
    localStorage.clear();
  });

  it("makes room by dropping the least recently used other sessions", () => {
    // Both saved in the same millisecond: the index order alone says nothing.
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    expect(sessionManager.saveSession("old", session("old.ipynb", 700))).toBe(true);
    expect(sessionManager.saveSession("recent", session("recent.ipynb", 700))).toBe(true);
    // Mark "old" as the least recently used.
    const index = sessionManager.getSessions().map((s) => (s.id === "old" ? { ...s, lastAccessed: 1 } : s));
    localStorage.setItem("pynote-sessions-index", JSON.stringify(index));

    expect(sessionManager.saveSession("new", session("new.ipynb", 500))).toBe(true);

    expect(stored("old")).toBeNull();
    expect(stored("recent")).not.toBeNull();
    expect(JSON.parse(stored("new")!).filename).toBe("new.ipynb");
    expect(indexed()).toEqual(["new", "recent"]);
  });

  it("drops only as many sessions as it takes", () => {
    for (const [id, size] of [["first", 400], ["second", 400], ["third", 400]] as const) {
      expect(sessionManager.saveSession(id, session(`${id}.ipynb`, size))).toBe(true);
    }

    expect(sessionManager.saveSession("new", session("new.ipynb", 450))).toBe(true);

    expect(stored("first")).toBeNull();
    expect(stored("second")).not.toBeNull();
    expect(stored("third")).not.toBeNull();
    expect(indexed()).toEqual(["new", "second", "third"]);
  });

  it("drops sessions the index lost track of before any listed one", () => {
    expect(sessionManager.saveSession("listed", session("listed.ipynb", 700))).toBe(true);
    localStorage.setItem("pynote-session-orphan", JSON.stringify(session("orphan.ipynb", 700)));

    expect(sessionManager.saveSession("new", session("new.ipynb", 500))).toBe(true);

    expect(stored("orphan")).toBeNull();
    expect(stored("listed")).not.toBeNull();
  });

  it("keeps every other session when the notebook would not fit even without them", () => {
    expect(sessionManager.saveSession("other", session("other.ipynb", 500))).toBe(true);
    expect(sessionManager.saveSession("another", session("another.ipynb", 500))).toBe(true);
    const before = { other: stored("other"), another: stored("another"), index: localStorage.getItem("pynote-sessions-index") };

    expect(sessionManager.saveSession("huge", session("huge.ipynb", QUOTA))).toBe(false);

    expect(stored("huge")).toBeNull();
    expect({ other: stored("other"), another: stored("another"), index: localStorage.getItem("pynote-sessions-index") }).toEqual(before);
  });

  it("does not take the other sessions out again while the notebook still does not fit", () => {
    expect(sessionManager.saveSession("other", session("other.ipynb", 500))).toBe(true);
    expect(sessionManager.saveSession("too-big", session("too-big.ipynb", QUOTA))).toBe(false);
    expect(stored("other")).not.toBeNull();
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");

    // Typing on: bigger still, nothing new that could make room.
    expect(sessionManager.saveSession("too-big", session("too-big.ipynb", QUOTA + 10))).toBe(false);
    expect(removeItem).not.toHaveBeenCalled();

    // Smaller again: it fits once the other session is dropped.
    expect(sessionManager.saveSession("too-big", session("too-big.ipynb", 1_500))).toBe(true);
    expect(stored("other")).toBeNull();
  });

  it("tries again once the rest of storage takes up less", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    expect(sessionManager.saveSession("open", session("o.ipynb", 700))).toBe(true);
    expect(sessionManager.saveSession("closed", session("c.ipynb", 300))).toBe(true);
    installLocks(["open"]);
    await sessionManager.refreshOpenSessions();

    // Too big even without the closed session.
    expect(sessionManager.saveSession("big", session("b.ipynb", 1_100))).toBe(false);
    expect(stored("closed")).not.toBeNull();

    // The other tab's notebook gets smaller: now the closed session makes
    // enough room.
    localStorage.setItem("pynote-session-open", JSON.stringify(session("o.ipynb", 300)));
    expect(sessionManager.saveSession("big", session("b.ipynb", 1_100))).toBe(true);
    expect(stored("closed")).toBeNull();
    expect(indexed()).toEqual(["big", "open"]);
  });

  it("reports other storage failures without dropping anything", () => {
    expect(sessionManager.saveSession("other", session("other.ipynb", 100))).toBe(true);
    vi.mocked(Storage.prototype.setItem).mockImplementation(() => {
      throw new DOMException("Storage is disabled.", "SecurityError");
    });

    expect(sessionManager.saveSession("new", session("new.ipynb", 10))).toBe(false);

    expect(stored("other")).not.toBeNull();
  });

  it("never drops a session open in another tab to make room", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    expect(sessionManager.saveSession("open-elsewhere", session("open.ipynb", 600))).toBe(true);
    vi.mocked(Date.now).mockReturnValue(2_000);
    expect(sessionManager.saveSession("closed", session("closed.ipynb", 600))).toBe(true);
    installLocks(["open-elsewhere"]);
    await sessionManager.refreshOpenSessions();

    // The least recently used session is open in another tab: the closed one goes.
    vi.mocked(Date.now).mockReturnValue(3_000);
    expect(sessionManager.saveSession("new", session("new.ipynb", 500))).toBe(true);
    expect(stored("open-elsewhere")).not.toBeNull();
    expect(stored("closed")).toBeNull();

    // The notebook grows, and only the open session could make room: the
    // save fails, and that session stays.
    expect(sessionManager.saveSession("new", session("new.ipynb", 1_400))).toBe(false);
    expect(stored("open-elsewhere")).not.toBeNull();
    expect(indexed()).toEqual(["new", "open-elsewhere"]);
  });
});

describe("a tab that has not looked at the locks yet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { locks?: unknown }).locks;
    localStorage.clear();
  });

  it("drops no session, as any of them could be open in another tab", async () => {
    vi.resetModules();
    const { sessionManager: fresh } = await import("./session");
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    for (let i = 1; i <= 10; i++) expect(fresh.saveSession(`earlier-${i}`, session(`${i}.ipynb`, 10))).toBe(true);
    // A page that just started, before its first look at the locks.
    installLocks(["earlier-1"]);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith("pynote-session-") && value.length > 500) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Over the session limit: nothing goes yet.
    expect(fresh.saveSession("new", session("new.ipynb", 10))).toBe(true);
    expect(fresh.getSessions()).toHaveLength(11);
    // Storage full: the save fails instead of dropping a session.
    expect(fresh.saveSession("new", session("new.ipynb", 600))).toBe(false);
    for (let i = 1; i <= 10; i++) expect(stored(`earlier-${i}`)).not.toBeNull();

    // Once it has looked, the least recently used closed session goes, and
    // the one open in another tab stays.
    await fresh.refreshOpenSessions();
    expect(fresh.saveSession("newer", session("newer.ipynb", 10))).toBe(true);
    expect(stored("earlier-1")).not.toBeNull();
    expect(stored("earlier-2")).toBeNull();
    expect(fresh.getSessions()).toHaveLength(11);
  });
});

describe("a tab that opens another notebook in place", () => {
  beforeEach(() => {
    localStorage.clear();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (usedBy(this, key) + key.length + value.length > QUOTA) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { locks?: unknown }).locks;
    localStorage.clear();
  });

  // A fresh page that shows `first`, stored, with `elsewhere` open in other tabs.
  async function showing(first: string, elsewhere: string[]) {
    vi.resetModules();
    const { sessionManager: fresh } = await import("./session");
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    installLocks(elsewhere);
    await fresh.holdSession(first);
    expect(fresh.saveSession(first, session(`${first}.ipynb`, 1_000))).toBe(true);
    await fresh.refreshOpenSessions();
    return fresh;
  }

  it("makes room with the notebook it showed before, which no tab shows any more", async () => {
    const fresh = await showing("first", []);

    // The second notebook fits only without the first, at its first save.
    void fresh.holdSession("second");
    expect(fresh.saveSession("second", session("second.ipynb", 900))).toBe(true);
    expect(stored("first")).toBeNull();
    expect(fresh.getSessions().map((s) => s.id)).toEqual(["second"]);
  });

  it("keeps the notebook it showed before when another tab shows it too", async () => {
    const fresh = await showing("first", ["first"]);

    void fresh.holdSession("second");
    expect(fresh.saveSession("second", session("second.ipynb", 900))).toBe(false);
    expect(stored("first")).not.toBeNull();
  });
});

describe("sessionManager.refreshOpenSessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { locks?: unknown }).locks;
    localStorage.clear();
  });

  it("resolves once the newest look is in, so what it shows is never older than the call", async () => {
    vi.resetModules();
    const { sessionManager: fresh } = await import("./session");
    const { locks } = installLocks(["closing"]);
    localStorage.setItem("pynote-session-closing", JSON.stringify(session("c.ipynb", 10)));
    await fresh.refreshOpenSessions();
    expect(fresh.evictionCandidates("shown")).toEqual([]);

    // A look, then a newer one after the other tab closed, which takes
    // longer: the first resolves with what the newer one finds.
    const first = fresh.refreshOpenSessions();
    let finish = () => {};
    locks.query.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ held: [], pending: [] });
    }));
    void fresh.refreshOpenSessions();
    let resolved = false;
    void first.then(() => {
      resolved = true;
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(resolved).toBe(false);
    finish();
    await first;
    expect(fresh.evictionCandidates("shown")).toEqual(["closing"]);
  });
});

describe("a browser that refuses Web Locks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { locks?: unknown }).locks;
    localStorage.clear();
  });

  it("drops sessions as one without them does", async () => {
    vi.resetModules();
    const { sessionManager: fresh } = await import("./session");
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    // A sandboxed frame, for one: the page has no origin of its own.
    const refused = () => Promise.reject(new DOMException("Access to the Locks API is denied in this context.", "SecurityError"));
    Object.defineProperty(navigator, "locks", { value: { request: vi.fn(refused), query: vi.fn(refused) }, configurable: true });

    await fresh.holdSession("shown");
    await fresh.refreshOpenSessions();
    for (let i = 1; i <= 11; i++) expect(fresh.saveSession(`session-${i}`, session(`${i}.ipynb`, 10))).toBe(true);

    expect(stored("session-1")).toBeNull();
    expect(fresh.getSessions()).toHaveLength(10);
  });
});

describe("the session limit", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    delete (navigator as { locks?: unknown }).locks;
    await sessionManager.refreshOpenSessions();
    localStorage.clear();
  });

  it("keeps the ten most recently used sessions, and every session open in a tab", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    expect(sessionManager.saveSession("oldest-open", session("a.ipynb", 10))).toBe(true);
    expect(sessionManager.saveSession("oldest-closed", session("b.ipynb", 10))).toBe(true);
    installLocks(["oldest-open"]);
    await sessionManager.refreshOpenSessions();

    for (let i = 1; i <= 10; i++) expect(sessionManager.saveSession(`newer-${i}`, session(`${i}.ipynb`, 10))).toBe(true);

    expect(stored("oldest-open")).not.toBeNull();
    expect(stored("oldest-closed")).toBeNull();
    expect(indexed()).toContain("oldest-open");
    expect(indexed()).not.toContain("oldest-closed");
    expect(indexed()).toHaveLength(11);
  });
});

describe("sessionManager.holdSession", () => {
  afterEach(async () => {
    delete (navigator as { locks?: unknown }).locks;
    await sessionManager.refreshOpenSessions();
  });

  it("holds a shared lock named after the session the tab shows, one at a time", async () => {
    const { locks, holding } = installLocks();

    await sessionManager.holdSession("shown-first");
    expect(locks.request).toHaveBeenCalledWith("pynote-session:shown-first", { mode: "shared" }, expect.any(Function));
    expect(holding.map((lock) => lock.name)).toEqual(["pynote-session:shown-first"]);

    // The same session again: nothing changes.
    await sessionManager.holdSession("shown-first");
    expect(locks.request).toHaveBeenCalledTimes(1);

    // Another session: its lock replaces the first one.
    await sessionManager.holdSession("shown-next");
    await vi.waitFor(() => expect(holding.map((lock) => lock.name)).toEqual(["pynote-session:shown-next"]));
  });

  it("resolves at once where the browser has no Web Locks", async () => {
    await expect(sessionManager.holdSession("no-locks")).resolves.toBeUndefined();
  });
});
