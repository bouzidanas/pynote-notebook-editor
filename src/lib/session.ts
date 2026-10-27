import { deleteFileHandle } from "./file-handles";
import { idbStore } from "./idb-store";
import type { JsonObject } from "./formats/document";

export interface SessionMeta {
    id: string;
    filename: string;
    lastAccessed: number;
    snippet?: string; // First few chars of first cell for preview?
}

// Where a notebook session is kept. localStorage holds about 5 million
// characters for the whole site in every major browser (all sessions and
// preferences together), but it writes synchronously, so even the last edit
// before a reload or a closed tab is kept. IndexedDB holds gigabytes, but a
// write still pending when the page unloads can be dropped. So:
// - localStorage keeps everything edited in PyNote, rewritten by every
//   autosave: the cells (ids, types, sources, metadata), the undo history,
//   the notebook's settings, theme and code view, and the PyNote settings the
//   document was opened with.
// - IndexedDB keeps what an opened document brought that PyNote never edits,
//   which can run to megabytes (images pasted into Jupyter): the cells'
//   attachments and the rest of the notebook metadata (kernelspec, other
//   tools' keys such as widget state). It is written when the notebook is
//   opened (and again if the session is dropped while its tab is open), and
//   a session only refers to it once it is stored.
// Where IndexedDB is unavailable, that data stays in the localStorage session.
//
// PyNote keeps the MAX_SESSIONS most recently used sessions, and when
// localStorage is full, a session being saved makes room by dropping the
// least recently used ones, but only when that makes it fit. A session open
// in a tab is never dropped: each tab holds a Web Lock named after the session
// it shows (holdSession), and the other tabs leave locked sessions alone. A
// tab whose session is dropped anyway (a browser without Web Locks, or a tab
// that had not seen the lock yet) stores all of it again with its next
// autosave (see Notebook.tsx).
export interface SessionDocumentData {
    // Attachments of markdown and raw cells, by cell id.
    attachments: Record<string, JsonObject>;
    // The notebook metadata without PyNote's own settings (metadata.PyNote).
    metadata: JsonObject;
}

const INDEX_KEY = "pynote-sessions-index";
const SESSION_PREFIX = "pynote-session-";
const MAX_SESSIONS = 10;
const LOCK_PREFIX = "pynote-session:";

const documents = idbStore<SessionDocumentData>("pynote-session-documents", "documents");

const isQuotaError = (e: unknown) =>
    e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

// Web Locks are missing in older browsers and outside secure contexts, and
// refused for good where the page has no origin of its own (a sandboxed
// frame): then it is as if the browser had none.
let locksRefused = false;
const lockManager = (): LockManager | undefined =>
    locksRefused || typeof navigator === "undefined" ? undefined : (navigator.locks as LockManager | undefined);
const refusesLocks = (e: unknown) => e instanceof DOMException && e.name === "SecurityError";

// The sessions open in a tab (this one included), as the locks showed them
// when last looked at: first when the page starts, then when this tab's lock
// is granted, when another tab changes the list of sessions (a tab that opens
// a session marks it used once it holds its lock), and after every save.
// Until the first look, no session is dropped: any of them could be open.
let openSessions = new Set<string>();
let openSessionsSeen = false;
let looks = 0; // so an older look never replaces a newer one
let latestLook: Promise<void> = Promise.resolve(); // which an older one waits for
// How many locks each of those sessions had at the last look, and the one
// this tab held then (its own lock was one of them).
let lockCounts = new Map<string, number>();
let heldAtLook: string | null = null;
// The lock this tab holds for the session it shows (`granted` once held).
let held: { id: string; acquired: Promise<void>; release: () => void; granted: boolean } | null = null;
let watchingIndex = false;

// The smallest total the browser refused to hold in localStorage, counted as
// browsers count it (the characters of every key and value): it holds less.
// So a save that would come to that much even with every session that may
// go dropped fails at once, instead of taking them all out and putting them
// back again with every keystroke.
let refusedTotal = Infinity;

// The characters each localStorage entry takes up, its key and its value.
function storedSizes(): Map<string, number> {
    const sizes = new Map<string, number>();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) sizes.set(key, key.length + (localStorage.getItem(key)?.length ?? 0));
    }
    return sizes;
}

export const sessionManager = {
    // --- URL Helpers ---
    getSessionIdFromUrl(): string | null {
        if (typeof window === "undefined") return null;
        const params = new URLSearchParams(window.location.search);
        return params.get("session");
    },

    setSessionIdInUrl(id: string) {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.set("session", id);
        // Use replaceState to update URL without reloading
        window.history.replaceState({}, "", url.toString());
    },

    createNewSessionUrl(): string {
        const id = crypto.randomUUID();
        // Start fresh - only include the new session ID
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set("session", id);
        return url.toString();
    },

    // --- Sessions open in a tab ---

    /**
     * This tab shows session `id`: hold its lock (and let go of the one it
     * held before), so other tabs never drop it. Resolves once the lock is
     * held and this tab has looked again at which sessions are open, or right
     * away where there are no Web Locks.
     */
    holdSession(id: string): Promise<void> {
        if (held?.id === id) return held.acquired;
        // The session this tab showed until now is open in no tab once it
        // lets go of it, if its lock was the only one at the last look: then
        // the next save may drop it without waiting for another look.
        if (held && held.id === heldAtLook && lockCounts.get(held.id) === 1) openSessions.delete(held.id);
        held?.release();
        held = null;
        const locks = lockManager();
        if (!locks) return Promise.resolve();
        let release = () => {};
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const hold = { id, acquired: Promise.resolve(), release, granted: false };
        hold.acquired = new Promise<void>((resolve) => {
            locks
                .request(`${LOCK_PREFIX}${id}`, { mode: "shared" }, async () => {
                    hold.granted = true;
                    await this.refreshOpenSessions();
                    resolve();
                    return released;
                })
                // No lock to hold: nothing protects the session but its tab
                // storing it again. The next call asks again, unless the
                // browser refuses locks for good.
                .catch((e: unknown) => {
                    if (refusesLocks(e)) locksRefused = true;
                    if (held === hold) held = null;
                    resolve();
                });
        });
        held = hold;
        if (!watchingIndex && typeof window !== "undefined") {
            watchingIndex = true;
            window.addEventListener("storage", (event) => {
                if (event.key === INDEX_KEY || event.key === null) void this.refreshOpenSessions();
            });
        }
        return hold.acquired;
    },

    /**
     * Looks again at which sessions are open in a tab. Resolves once a look
     * at least as recent as this call is in.
     */
    refreshOpenSessions(): Promise<void> {
        const look = ++looks;
        const locks = lockManager();
        if (!locks) {
            openSessions = new Set();
            return Promise.resolve();
        }
        // The session whose lock this tab holds as it asks, among those the
        // look finds.
        const own = held?.granted ? held.id : null;
        const done = (async (): Promise<void> => {
            try {
                const { held: holding = [], pending = [] } = await locks.query();
                // A newer look is under way: this one is out of date.
                if (look !== looks) return latestLook;
                const counts = new Map<string, number>();
                for (const lock of [...holding, ...pending]) {
                    const name = lock.name ?? "";
                    if (!name.startsWith(LOCK_PREFIX)) continue;
                    const id = name.slice(LOCK_PREFIX.length);
                    counts.set(id, (counts.get(id) ?? 0) + 1);
                }
                lockCounts = counts;
                heldAtLook = own;
                openSessions = new Set(counts.keys());
                openSessionsSeen = true;
            } catch (e) {
                if (look !== looks) return latestLook;
                // Refused for good: as without Web Locks. Otherwise (asked
                // while the page is not shown, for one) the last look stands.
                if (refusesLocks(e)) {
                    locksRefused = true;
                    openSessions = new Set();
                }
            }
        })();
        latestLook = done;
        return done;
    },

    // Whether sessions may be dropped now: once this tab knows which are open.
    mayDropSessions(): boolean {
        return openSessionsSeen || !lockManager();
    },

    // --- Index Management ---
    getSessions(): SessionMeta[] {
        try {
            const raw = localStorage.getItem(INDEX_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    },

    updateSessionIndex(meta: SessionMeta) {
        const sessions = this.getSessions();
        const existingIndex = sessions.findIndex(s => s.id === meta.id);

        if (existingIndex >= 0) {
            sessions[existingIndex] = { ...sessions[existingIndex], ...meta, lastAccessed: Date.now() };
        } else {
            sessions.push({ ...meta, lastAccessed: Date.now() });
        }

        // Sort by Last Accessed (Desc)
        sessions.sort((a, b) => b.lastAccessed - a.lastAccessed);

        // Over the limit: the most recently used sessions stay, and so does
        // every session open in a tab.
        const kept: SessionMeta[] = [];
        const dropped: string[] = [];
        const mayDrop = this.mayDropSessions();
        for (const session of sessions) {
            if (!mayDrop || kept.length < MAX_SESSIONS || session.id === meta.id || openSessions.has(session.id)) kept.push(session);
            else dropped.push(session.id);
        }

        // The list first, so it never lists a session whose data is gone.
        localStorage.setItem(INDEX_KEY, JSON.stringify(kept));
        dropped.forEach(id => this.removeSessionData(id));
    },

    /** Marks a session as used now (opening it counts, not only saving it). */
    touchSession(id: string, filename: string) {
        try {
            this.updateSessionIndex({ id, filename, lastAccessed: Date.now() });
        } catch (e) {
            console.error("Updating the session list failed", e);
        }
    },

    // The sessions that may be dropped to make room for `keep`, first to
    // last: those the index lost track of (an interrupted write), then the
    // least recently used. Only sessions that take up space, and none open in
    // a tab.
    evictionCandidates(keep: string): string[] {
        const stored = new Set<string>();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(SESSION_PREFIX)) stored.add(key.slice(SESSION_PREFIX.length));
        }
        stored.delete(keep);
        openSessions.forEach(id => stored.delete(id));
        const indexed = this.getSessions().sort((a, b) => a.lastAccessed - b.lastAccessed).map(s => s.id);
        const unindexed = [...stored].filter(id => !indexed.includes(id));
        return [...unindexed, ...indexed.filter(id => stored.has(id))];
    },

    // --- CRUD ---
    loadSession(id: string): any | null {
        try {
            const raw = localStorage.getItem(`${SESSION_PREFIX}${id}`);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    },

    /** Whether a session is in localStorage (it was not dropped). */
    isStored(id: string): boolean {
        try {
            return localStorage.getItem(`${SESSION_PREFIX}${id}`) !== null;
        } catch {
            return false;
        }
    },

    /** Write a session to localStorage. False when the browser could not keep it. */
    saveSession(id: string, data: any): boolean {
        const stored = this.writeSession(id, JSON.stringify(data));
        void this.refreshOpenSessions();
        if (!stored) return false;
        try {
            this.updateSessionIndex({
                id,
                filename: data.filename || "Untitled.ipynb",
                lastAccessed: Date.now()
            });
        } catch (e) {
            // The session itself is stored; only the list of sessions is stale.
            console.error("Updating the session list failed", e);
        }
        return true;
    },

    // Writes a session's JSON. When storage is full, the sessions that may go
    // (evictionCandidates) are taken out one at a time until it fits, and are
    // then dropped for good. When it does not fit even without all of them,
    // they are put back as they were, so nothing is lost for a save that
    // fails anyway, and none are taken out at all when what the browser
    // refused before shows that it cannot fit (refusedTotal).
    writeSession(id: string, json: string): boolean {
        const key = `${SESSION_PREFIX}${id}`;
        try {
            localStorage.setItem(key, json);
            return true;
        } catch (e) {
            if (!isQuotaError(e)) {
                console.error("Autosave failed", e);
                return false;
            }
        }
        // What the refused write would have made the total (it replaces the
        // session's entry).
        const sizes = storedSizes();
        sizes.delete(key);
        let total = key.length + json.length;
        sizes.forEach(size => { total += size; });
        refusedTotal = Math.min(refusedTotal, total);
        if (!this.mayDropSessions()) {
            console.error("Autosave failed: storage is full, and which sessions other tabs have open is not known yet");
            return false;
        }
        const candidates = this.evictionCandidates(id);
        const room = candidates.reduce((sum, candidate) => sum + (sizes.get(`${SESSION_PREFIX}${candidate}`) ?? 0), 0);
        if (total - room >= refusedTotal) {
            console.error("Autosave failed: the notebook does not fit in the browser's storage, even without the sessions no tab has open");
            return false;
        }
        const takenOut: Array<[string, string]> = [];
        for (const candidate of candidates) {
            const candidateKey = `${SESSION_PREFIX}${candidate}`;
            const value = localStorage.getItem(candidateKey);
            if (value === null) continue;
            localStorage.removeItem(candidateKey);
            takenOut.push([candidate, value]);
            total -= candidateKey.length + value.length;
            try {
                localStorage.setItem(key, json);
                this.dropSessions(takenOut.map(([taken]) => taken));
                return true;
            } catch (e) {
                if (!isQuotaError(e)) break;
                refusedTotal = Math.min(refusedTotal, total);
            }
        }
        for (const [candidate, value] of takenOut) {
            try {
                localStorage.setItem(`${SESSION_PREFIX}${candidate}`, value);
            } catch (e) {
                console.error(`Could not put session ${candidate} back`, e);
            }
        }
        console.error("Autosave failed: the notebook does not fit in the browser's storage, even without the sessions no tab has open");
        return false;
    },

    /** Keep a session's document data in IndexedDB. False when it could not. */
    async saveDocumentData(id: string, data: SessionDocumentData): Promise<boolean> {
        try {
            await documents.put(id, data);
            return true;
        } catch (e) {
            console.warn("Could not store the notebook's attachments and metadata in IndexedDB", e);
            return false;
        }
    },

    async loadDocumentData(id: string): Promise<SessionDocumentData | null> {
        try {
            return (await documents.get(id)) ?? null;
        } catch (e) {
            console.warn("Could not read the notebook's attachments and metadata from IndexedDB", e);
            return null;
        }
    },

    // Everything stored for a session, except its entry in the index.
    removeSessionData(id: string) {
        localStorage.removeItem(`${SESSION_PREFIX}${id}`);
        void deleteFileHandle(id);
        documents.delete(id).catch(() => {
            // A leftover entry is only unused space.
        });
    },

    // Sessions and everything stored for them. The index goes first, so it
    // never lists a session whose data is gone.
    dropSessions(ids: string[]) {
        const sessions = this.getSessions().filter(s => !ids.includes(s.id));
        try {
            localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
        } catch {
            // The index only lists sessions; a stale entry is skipped on load.
        }
        ids.forEach(id => this.removeSessionData(id));
    },

    deleteSession(id: string) {
        this.dropSessions([id]);
    },

    clearAllSessions() {
        const sessions = this.getSessions();
        localStorage.removeItem(INDEX_KEY);
        sessions.forEach(s => this.removeSessionData(s.id));
    }
};
