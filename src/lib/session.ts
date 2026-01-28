export interface SessionMeta {
    id: string;
    filename: string;
    lastAccessed: number;
    snippet?: string; // First few chars of first cell for preview?
}

const INDEX_KEY = "pynote-sessions-index";
const SESSION_PREFIX = "pynote-session-";
const MAX_SESSIONS = 10;

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

        // Evict if over limit
        let evictedId: string | null = null;
        if (sessions.length > MAX_SESSIONS) {
            const toRemove = sessions.pop(); // Remove oldest (last in list)
            if (toRemove) {
                evictedId = toRemove.id;
                localStorage.removeItem(`${SESSION_PREFIX}${toRemove.id}`);
            }
        }

        localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
        return evictedId;
    },

    // --- CRUD ---
    loadSession(id: string): any | null {
        try {
            const raw = localStorage.getItem(`${SESSION_PREFIX}${id}`);
            if (!raw) return null;

            // Update access time
            const data = JSON.parse(raw);
            // We should ideally update the index here too to mark as recently accessed
            // But we can do that on save to avoid excessive writes
            return data;
        } catch {
            return null;
        }
    },

    saveSession(id: string, data: any): string | null {
        try {
            localStorage.setItem(`${SESSION_PREFIX}${id}`, JSON.stringify(data));

            // Update Index
            return this.updateSessionIndex({
                id,
                filename: data.filename || "Untitled.ipynb",
                lastAccessed: Date.now()
            });
        } catch (e) {
            console.error("Autosave failed", e);
            return null;
        }
    },

    deleteSession(id: string) {
        localStorage.removeItem(`${SESSION_PREFIX}${id}`);
        const sessions = this.getSessions().filter(s => s.id !== id);
        localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
    },

    clearAllSessions() {
        const sessions = this.getSessions();
        sessions.forEach(s => localStorage.removeItem(`${SESSION_PREFIX}${s.id}`));
        localStorage.removeItem(INDEX_KEY);
    }
};
