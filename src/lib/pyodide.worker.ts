// @ts-ignore
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide.mjs";

import { INIT_CODE } from "./python-runtime/init-code";
import { PYNOTE_UI_INIT_PY } from "./python-runtime/pynote-ui/init";
import { PYNOTE_UI_CORE_PY } from "./python-runtime/pynote-ui/core";
import { PYNOTE_UI_ELEMENTS_PY } from "./python-runtime/pynote-ui/elements";
import { PYNOTE_UI_OPLOT_PY } from "./python-runtime/pynote-ui/oplot";
import { PYNOTE_UI_UPLOT_PY } from "./python-runtime/pynote-ui/uplot";
import { PYNOTE_UI_FPLOT_PY } from "./python-runtime/pynote-ui/fplot";

let pyodide: any = null;
const WORKSPACE_ROOT = "/workspace";
let workspacePersistenceEnabled = false;

const normalizePath = (inputPath: string): string => {
    const source = inputPath.trim();
    const segments = source.replace(/\\/g, "/").split("/");
    const out: string[] = [];
    for (const segment of segments) {
        if (!segment || segment === ".") continue;
        if (segment === "..") {
            if (out.length > 0) out.pop();
            continue;
        }
        out.push(segment);
    }
    return `/${out.join("/")}`;
};

const normalizeWorkspacePath = (inputPath?: string): string => {
    const raw = inputPath && inputPath.trim() ? inputPath : WORKSPACE_ROOT;
    const normalized = raw.startsWith("/") ? normalizePath(raw) : normalizePath(`${WORKSPACE_ROOT}/${raw}`);
    if (normalized === WORKSPACE_ROOT) return normalized;
    if (!normalized.startsWith(`${WORKSPACE_ROOT}/`)) {
        throw new Error("Path must stay inside /workspace");
    }
    return normalized;
};

const pathExists = (path: string): boolean => {
    const analyzed = pyodide.FS.analyzePath(path);
    return !!analyzed.exists;
};

const isDirectory = (path: string): boolean => {
    const stat = pyodide.FS.stat(path);
    return pyodide.FS.isDir(stat.mode);
};

const basename = (path: string): string => {
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
};

const splitNameExtension = (name: string): { stem: string; extension: string } => {
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex <= 0) {
        return { stem: name, extension: "" };
    }
    return {
        stem: name.slice(0, dotIndex),
        extension: name.slice(dotIndex),
    };
};

const copyNameAtIndex = (name: string, index: number): string => {
    const { stem, extension } = splitNameExtension(name);
    if (index <= 1) return `${stem} (copy)${extension}`;
    return `${stem} (copy ${index})${extension}`;
};

const resolveKeepBothPath = (destinationDir: string, name: string): string => {
    for (let index = 1; index < 10000; index += 1) {
        const candidate = joinPath(destinationDir, copyNameAtIndex(name, index));
        if (!pathExists(candidate)) return candidate;
    }
    throw new Error("Could not generate copy name");
};

const joinPath = (dir: string, name: string): string => {
    return normalizePath(`${dir}/${name}`);
};

const syncWorkspaceFs = async (populate: boolean): Promise<void> => {
    if (!workspacePersistenceEnabled) return;
    await new Promise<void>((resolve, reject) => {
        pyodide.FS.syncfs(populate, (err: unknown) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const setupWorkspaceFs = async (): Promise<void> => {
    try {
        pyodide.FS.mkdirTree(WORKSPACE_ROOT);
    } catch {
        // Already exists.
    }

    try {
        pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, WORKSPACE_ROOT);
        workspacePersistenceEnabled = true;
        await syncWorkspaceFs(true);
    } catch {
        workspacePersistenceEnabled = false;
    }
};

const deleteRecursive = (target: string) => {
    if (!pathExists(target)) return;
    if (isDirectory(target)) {
        const children: string[] = pyodide.FS.readdir(target).filter((name: string) => name !== "." && name !== "..");
        for (const child of children) {
            deleteRecursive(joinPath(target, child));
        }
        pyodide.FS.rmdir(target);
        return;
    }
    pyodide.FS.unlink(target);
};

const copyRecursive = (sourcePath: string, destinationPath: string) => {
    if (isDirectory(sourcePath)) {
        pyodide.FS.mkdirTree(destinationPath);
        const children: string[] = pyodide.FS.readdir(sourcePath).filter((name: string) => name !== "." && name !== "..");
        for (const child of children) {
            copyRecursive(joinPath(sourcePath, child), joinPath(destinationPath, child));
        }
        return;
    }
    const data = pyodide.FS.readFile(sourcePath, { encoding: "binary" });
    pyodide.FS.writeFile(destinationPath, data, { encoding: "binary" });
};

const decodeBase64ToBytes = (base64: string): Uint8Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const encodeBytesToBase64 = (bytes: Uint8Array): string => {
    const chunk = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunk) {
        const view = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode(...view);
    }
    return btoa(binary);
};

const guessMime = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".py")) return "text/plain";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    return "application/octet-stream";
};

const listDirectory = (path: string) => {
    const names: string[] = pyodide.FS.readdir(path).filter((name: string) => name !== "." && name !== "..");
    const entries = names.map((name) => {
        const fullPath = joinPath(path, name);
        const stat = pyodide.FS.stat(fullPath);
        const dir = pyodide.FS.isDir(stat.mode);
        return {
            name,
            path: fullPath,
            type: dir ? "dir" : "file",
            size: dir ? 0 : Number(stat.size || 0),
            mtime: Number(stat.mtime || 0),
        };
    });
    entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return entries;
};

const handleFilesystemRequest = async (request: any) => {
    const op = request?.op;

    if (op === "list") {
        const path = normalizeWorkspacePath(request.path);
        if (!pathExists(path) || !isDirectory(path)) {
            throw new Error("Directory not found");
        }
        return {
            path,
            entries: listDirectory(path),
            persistent: workspacePersistenceEnabled,
        };
    }

    if (op === "mkdir") {
        const path = normalizeWorkspacePath(request.path);
        pyodide.FS.mkdirTree(path);
        await syncWorkspaceFs(false);
        return { ok: true };
    }

    if (op === "upload") {
        const targetDir = normalizeWorkspacePath(request.path);
        pyodide.FS.mkdirTree(targetDir);
        const files = Array.isArray(request.files) ? request.files : [];
        for (const file of files) {
            if (!file?.name || !file?.data_base64) continue;
            const targetPath = normalizeWorkspacePath(`${targetDir}/${file.name}`);
            const bytes = decodeBase64ToBytes(file.data_base64);
            pyodide.FS.writeFile(targetPath, bytes, { encoding: "binary" });
        }
        await syncWorkspaceFs(false);
        return { ok: true, count: files.length };
    }

    if (op === "delete") {
        const path = normalizeWorkspacePath(request.path);
        if (path === WORKSPACE_ROOT) {
            throw new Error("Cannot delete /workspace root");
        }
        deleteRecursive(path);
        await syncWorkspaceFs(false);
        return { ok: true };
    }

    if (op === "rename") {
        const path = normalizeWorkspacePath(request.path);
        if (path === WORKSPACE_ROOT) {
            throw new Error("Cannot rename /workspace root");
        }
        const newName = String(request.newName || "").trim();
        if (!newName || newName.includes("/")) {
            throw new Error("Invalid name");
        }
        const destination = normalizeWorkspacePath(`${parentPath(path)}/${newName}`);
        if (pathExists(destination)) {
            throw new Error("Target already exists");
        }
        pyodide.FS.rename(path, destination);
        await syncWorkspaceFs(false);
        return { ok: true, path: destination };
    }

    if (op === "move") {
        const sourcePath = normalizeWorkspacePath(request.sourcePath);
        const destinationDir = normalizeWorkspacePath(request.destinationDir);
        const onConflict = String(request.onConflict || "error");
        if (!pathExists(destinationDir) || !isDirectory(destinationDir)) {
            throw new Error("Destination directory does not exist");
        }
        let destinationPath = normalizeWorkspacePath(`${destinationDir}/${basename(sourcePath)}`);
        if (destinationPath === sourcePath) {
            return { ok: true, path: sourcePath, skipped: true };
        }
        if (pathExists(destinationPath)) {
            if (onConflict === "skip") {
                return { ok: true, path: sourcePath, skipped: true };
            }
            if (onConflict === "replace") {
                deleteRecursive(destinationPath);
            } else if (onConflict === "keep_both") {
                destinationPath = resolveKeepBothPath(destinationDir, basename(sourcePath));
            } else {
                throw new Error("Target already exists");
            }
        }
        pyodide.FS.rename(sourcePath, destinationPath);
        await syncWorkspaceFs(false);
        return { ok: true, path: destinationPath };
    }

    if (op === "copy") {
        const sourcePath = normalizeWorkspacePath(request.sourcePath);
        const destinationDir = normalizeWorkspacePath(request.destinationDir);
        const onConflict = String(request.onConflict || "error");
        if (!pathExists(destinationDir) || !isDirectory(destinationDir)) {
            throw new Error("Destination directory does not exist");
        }
        let destinationPath = normalizeWorkspacePath(`${destinationDir}/${basename(sourcePath)}`);
        if (pathExists(destinationPath)) {
            if (onConflict === "skip") {
                return { ok: true, path: destinationPath, skipped: true };
            }
            if (onConflict === "replace") {
                if (destinationPath === sourcePath) {
                    throw new Error("Cannot replace source with itself");
                }
                deleteRecursive(destinationPath);
            } else if (onConflict === "keep_both") {
                destinationPath = resolveKeepBothPath(destinationDir, basename(sourcePath));
            } else {
                throw new Error("Target already exists");
            }
        }
        copyRecursive(sourcePath, destinationPath);
        await syncWorkspaceFs(false);
        return { ok: true, path: destinationPath };
    }

    if (op === "read_text") {
        const path = normalizeWorkspacePath(request.path);
        if (!pathExists(path) || isDirectory(path)) {
            throw new Error("File not found");
        }
        const maxBytes = typeof request.maxBytes === "number" ? request.maxBytes : 8192;
        const data: Uint8Array = pyodide.FS.readFile(path, { encoding: "binary" });
        const truncated = data.byteLength > maxBytes;
        const slice = truncated ? data.subarray(0, maxBytes) : data;
        const text = new TextDecoder("utf-8").decode(slice);
        return { text, truncated };
    }

    if (op === "download") {
        const path = normalizeWorkspacePath(request.path);
        if (!pathExists(path) || isDirectory(path)) {
            throw new Error("File not found");
        }
        const bytes: Uint8Array = pyodide.FS.readFile(path, { encoding: "binary" });
        return {
            name: basename(path),
            mime: guessMime(path),
            data_base64: encodeBytesToBase64(bytes),
        };
    }

    throw new Error("Unsupported filesystem operation");
};

const parentPath = (path: string): string => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) return WORKSPACE_ROOT;
    return `/${parts.slice(0, -1).join("/")}`;
};
async function initPyodide() {
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/",
            // Since 0.28, JS null converts to pyodide.ffi.jsnull instead of None.
            // Interaction payloads (e.g. Form child values) can contain null and
            // the Python handlers compare against None, so keep the old mapping.
            convertNullToNone: true,
        });
        await pyodide.loadPackage("micropip");

        // Write pynote_ui straight into the FS instead of installing the wheel
        // through micropip; skips the HTTP round trip on startup.
        pyodide.FS.mkdir("pynote_ui");
        pyodide.FS.writeFile("pynote_ui/__init__.py", PYNOTE_UI_INIT_PY);
        pyodide.FS.writeFile("pynote_ui/core.py", PYNOTE_UI_CORE_PY);
        pyodide.FS.writeFile("pynote_ui/elements.py", PYNOTE_UI_ELEMENTS_PY);
        pyodide.FS.writeFile("pynote_ui/oplot.py", PYNOTE_UI_OPLOT_PY);
        pyodide.FS.writeFile("pynote_ui/uplot.py", PYNOTE_UI_UPLOT_PY);
        pyodide.FS.writeFile("pynote_ui/fplot.py", PYNOTE_UI_FPLOT_PY);

        await pyodide.runPythonAsync(INIT_CODE);
        await setupWorkspaceFs();

        // Register stream callback
        const register_cb = pyodide.globals.get("register_stream_callback");
        register_cb((id: string, stream: string, text: string) => {
            postMessage({ id, type: stream, content: text });
        });
        register_cb.destroy();

        // Register comm target
        const pkg = pyodide.pyimport("pynote_ui");
        pkg.register_comm_target((uid: string, data: any) => {
            const jsData = data.toJs({ dict_converter: Object.fromEntries });
            postMessage({ type: "component_update", uid, data: jsData });
        });
        pkg.destroy();

        postMessage({ type: "ready" });
    } catch (e) {
        postMessage({ type: "error", error: String(e) });
    }
}

async function runCode(id: string, code: string) {
    if (!pyodide) {
        postMessage({ id, type: "error", error: "Kernel not ready" });
        return;
    }

    // No setStdout here; Python routes streams per-cell via contextvars.

    try {
        await pyodide.loadPackagesFromImports(code);

        const run_cell_code = pyodide.globals.get("run_cell_code");
        const result = await run_cell_code(code, id);
        run_cell_code.destroy();

        // Python returns a dict with __pynote_error__ when it captured a traceback
        if (result && result.toJs && typeof result.has === "function" && result.has("__pynote_error__")) {
            const errorMsg = result.get("__pynote_error__");
            postMessage({ id, type: "error", error: errorMsg });
            result.destroy();
            return;
        }

        let mimebundle = undefined;
        if (result && result._repr_mimebundle_) {
            try {
                const mb = result._repr_mimebundle_();
                mimebundle = mb.toJs({ dict_converter: Object.fromEntries });
                mb.destroy();
            } catch (e) {
                console.error("Error extracting mimebundle", e);
            }
        }

        postMessage({ id, type: "success", result: result?.toString(), mimebundle });
    } catch (error: any) {
        postMessage({ id, type: "error", error: error.toString() });
    }
}

self.onmessage = async (e) => {
    const { type, id, code } = e.data;

    if (type === "init") {
        await initPyodide();
    } else if (type === "cleanup") {
        // Clear caches when kernel is stopped/restarted
        if (pyodide) {
            try {
                const clear_completion_cache = pyodide.globals.get("clear_completion_cache");
                clear_completion_cache();
                clear_completion_cache.destroy();
            } catch (err) {
                console.error("Cache cleanup error", err);
            }
        }
        postMessage({ type: "cleanup_complete", id });
    } else if (type === "run") {
        // Deliberately not awaited: cells run in the background so the message
        // loop stays free, which is what hybrid/concurrent mode needs.
        // runCode handles its own errors.
        runCode(id, code);
    } else if (type === "interaction") {
        const { uid, data } = e.data;
        if (pyodide) {
            try {
                const pkg = pyodide.pyimport("pynote_ui");
                const pyData = pyodide.toPy(data);
                pkg.handle_interaction(uid, pyData);
                pyData.destroy();
                pkg.destroy();
            } catch (err) {
                console.error("Interaction error", err);
            }
        }
    } else if (type === "set_cell_context") {
        if (pyodide) {
            try {
                const pkg = pyodide.pyimport("pynote_ui");
                pkg.set_current_cell(id);
                pkg.destroy();
            } catch (err) {
                console.error("Set cell context error", err);
            }
        }
    } else if (type === "clear_cell_context") {
        if (pyodide) {
            try {
                const pkg = pyodide.pyimport("pynote_ui");
                pkg.clear_cell(id);
                pkg.destroy();
            } catch (err) {
                console.error("Clear cell context error", err);
            }
        }
    } else if (type === "filesystem") {
        if (!pyodide) {
            postMessage({ type: "filesystem_result", id, ok: false, error: "Kernel not ready" });
            return;
        }
        try {
            const result = await handleFilesystemRequest(e.data.request);
            postMessage({ type: "filesystem_result", id, ok: true, result });
        } catch (err) {
            postMessage({
                type: "filesystem_result",
                id,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    } else if (type === "analyze_cell") {
        // Reactive execution mode: analyze cell dependencies using Python AST
        if (pyodide) {
            try {
                const result = pyodide.runPython(`analyze_cell_dependencies(${JSON.stringify(code)})`);
                const jsResult = result.toJs({ dict_converter: Object.fromEntries });
                result.destroy();
                postMessage({
                    type: "analyze_cell_result",
                    id,
                    definitions: jsResult.definitions || [],
                    references: jsResult.references || []
                });
            } catch (err) {
                console.error("Analyze cell error", err);
                postMessage({
                    type: "analyze_cell_result",
                    id,
                    definitions: [],
                    references: [],
                    error: String(err)
                });
            }
        }
    } else if (type === "lint") {
        if (pyodide) {
            try {
                const { code, extract_defs } = e.data;
                const lint_code_with_defs = pyodide.globals.get("lint_code_with_defs");
                const result = lint_code_with_defs(code, extract_defs);
                const jsResult = result.toJs({ dict_converter: Object.fromEntries });
                result.destroy();
                lint_code_with_defs.destroy();
                postMessage({ type: "lint_result", id, diagnostics: jsResult.diagnostics, definitions: jsResult.definitions });
            } catch (err) {
                postMessage({ type: "lint_result", id, diagnostics: [], definitions: [] });
            }
        }
    } else if (type === "complete") {
        if (pyodide) {
            try {
                const { code, offset } = e.data;
                const get_completions = pyodide.globals.get("get_completions");
                const result = get_completions(code, offset);
                const jsResult = result.toJs({ dict_converter: Object.fromEntries });
                result.destroy();
                get_completions.destroy();
                postMessage({ type: "complete_result", id, completions: jsResult });
            } catch (err) {
                postMessage({ type: "complete_result", id, completions: [] });
            }
        }
    } else if (type === "inspect") {
        if (pyodide) {
            try {
                const { code, offset } = e.data;
                const get_hover_help = pyodide.globals.get("get_hover_help");
                const result = get_hover_help(code, offset);
                const jsResult = result.toJs({ dict_converter: Object.fromEntries });
                result.destroy();
                get_hover_help.destroy();
                postMessage({ type: "inspect_result", id, result: jsResult });
            } catch (err) {
                postMessage({ type: "inspect_result", id, result: { found: false } });
            }
        }
    }
};
