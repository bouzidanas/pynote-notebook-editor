import { type Component, For, Show, createEffect, createMemo, createSignal, onMount, onCleanup } from "solid-js";
import { ArrowDownFromLine, ArrowRight, ArrowRightLeft, ChevronDown, ChevronRight, CloudUpload, Copy, Download, File, FileCode2, FileDigit, FileImage, FileMusic, FilePlay, FileSpreadsheet, FileText, Folder, FolderOpen, FolderSymlink, FolderUp, ListChevronsDownUp, ListTree, Pencil, Plus, RotateCw, Trash2 } from "lucide-solid";
import clsx from "clsx";
import { kernel } from "../lib/pyodide";
import { TESTID } from "../lib/testids";

type EntryType = "file" | "dir";

interface FileEntry {
  name: string;
  path: string;
  type: EntryType;
  size: number;
  mtime: number;
}

interface ListResult {
  path: string;
  entries: FileEntry[];
  persistent: boolean;
}

interface ReadTextResult {
  text: string;
  truncated: boolean;
}

interface DownloadResult {
  name: string;
  mime: string;
  data_base64: string;
}

type MoveConflictChoice = "replace" | "keep_both" | "skip";
type FileListViewMode = "list" | "tree";

interface ClipboardEntry {
  sourcePath: string;
  name: string;
}

interface TreeVisibleRow {
  entry: FileEntry;
  depth: number;
}

interface FileWorkspacePanelProps {
  mode: "side" | "dialog";
  viewMode: FileListViewMode;
  onViewModeChange: (nextMode: FileListViewMode) => void;
}

const WORKSPACE_ROOT = "/workspace";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value: number): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

const toBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

const parentPath = (path: string): string => {
  if (path === WORKSPACE_ROOT) return WORKSPACE_ROOT;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return WORKSPACE_ROOT;
  return `/${parts.slice(0, -1).join("/")}`;
};

const basename = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

const splitBreadcrumbs = (path: string): Array<{ label: string; path: string }> => {
  const clean = path.split("/").filter(Boolean);
  const out: Array<{ label: string; path: string }> = [];
  out.push({ label: "workspace", path: WORKSPACE_ROOT });
  for (let i = 1; i < clean.length; i += 1) {
    out.push({ label: clean[i], path: `/${clean.slice(0, i + 1).join("/")}` });
  }
  return out;
};

const getFileExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1).toLowerCase();
};

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff", "ico", "heic", "heif"]);
const tabularDataExtensions = new Set(["csv", "tsv", "xls", "xlsx", "ods", "parquet", "feather", "arrow"]);
const structuredDataExtensions = new Set(["json", "jsonl", "ndjson", "yaml", "yml", "toml", "xml", "sql", "db", "sqlite", "sqlite3"]);
const documentExtensions = new Set(["txt", "md", "rst", "tex", "pdf", "doc", "docx", "rtf"]);
const codeExtensions = new Set(["ipynb", "py", "r", "jl", "js", "jsx", "ts", "tsx", "java", "cpp", "c", "cs", "go", "rs", "sh", "bash"]);
const audioExtensions = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a"]);
const videoExtensions = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv"]);

const getFileIcon = (name: string) => {
  const ext = getFileExtension(name);
  if (imageExtensions.has(ext)) return FileImage;
  if (tabularDataExtensions.has(ext)) return FileSpreadsheet;
  if (structuredDataExtensions.has(ext)) return FileDigit;
  if (audioExtensions.has(ext)) return FileMusic;
  if (videoExtensions.has(ext)) return FilePlay;
  if (codeExtensions.has(ext)) return FileCode2;
  if (documentExtensions.has(ext)) return FileText;
  return File;
};

const FileWorkspacePanel: Component<FileWorkspacePanelProps> = (props) => {
  let panelRootRef: HTMLDivElement | undefined;
  let uploadInputRef: HTMLInputElement | undefined;
  let editingInputRef: HTMLInputElement | undefined;
  let renameHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let actionMessageTimer: ReturnType<typeof setTimeout> | null = null;
  let dragGhostEl: HTMLDivElement | null = null;

  const [currentPath, setCurrentPath] = createSignal(WORKSPACE_ROOT);
  const [entries, setEntries] = createSignal<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
  const [selectedPaths, setSelectedPaths] = createSignal<string[]>([]);
  const [selectionAnchorPath, setSelectionAnchorPath] = createSignal<string | null>(null);
  const [persistenceEnabled, setPersistenceEnabled] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [draggedPath, setDraggedPath] = createSignal<string | null>(null);
  const [dragOverDirPath, setDragOverDirPath] = createSignal<string | null>(null);
  const [dragOverBreadcrumbPath, setDragOverBreadcrumbPath] = createSignal<string | null>(null);
  const [editingPath, setEditingPath] = createSignal<string | null>(null);
  const [editingName, setEditingName] = createSignal("");
  const [clipboardEntries, setClipboardEntries] = createSignal<ClipboardEntry[]>([]);
  const [actionMessage, setActionMessage] = createSignal<string | null>(null);
  const [treeEntries, setTreeEntries] = createSignal<FileEntry[]>([]);
  const [expandedDirPaths, setExpandedDirPaths] = createSignal<string[]>([WORKSPACE_ROOT]);
  const viewMode = () => props.viewMode;

  const panelColumnTemplate = "grid-cols-[minmax(0,1fr)_6.5rem]";
  const dialogColumnTemplate = "grid-cols-[minmax(0,1fr)_6.5rem_10.5rem]";
  const dialogBorderBottom = "[border-bottom-width:var(--ui-border-width,1px)] [border-bottom-style:var(--ui-border-style,solid)] border-[var(--ui-border-color,var(--foreground))]";
  const dialogBorderTop = "[border-top-width:var(--ui-border-width,1px)] [border-top-style:var(--ui-border-style,solid)] border-[var(--ui-border-color,var(--foreground))]";

  const selectedPathSet = createMemo(() => new Set(selectedPaths()));
  const selectableEntries = createMemo(() => (viewMode() === "tree" ? treeEntries() : entries()));
  const selectedEntries = createMemo(() => selectableEntries().filter((entry) => selectedPathSet().has(entry.path)));
  const selectedEntry = createMemo(() => (selectedEntries().length === 1 ? selectedEntries()[0] : null));
  const selectedFolderEntry = createMemo(() => {
    const selected = selectedEntry();
    return selected?.type === "dir" ? selected : null;
  });
  const breadcrumbs = createMemo(() => splitBreadcrumbs(currentPath()));
  const parentDirPath = createMemo(() => parentPath(currentPath()));
  const expandedDirPathSet = createMemo(() => new Set(expandedDirPaths()));
  const isSelectedFolderExpanded = createMemo(() => {
    const selected = selectedFolderEntry();
    return !!selected && expandedDirPathSet().has(selected.path);
  });
  const treeChildrenByParent = createMemo(() => {
    const grouped = new Map<string, FileEntry[]>();
    for (const entry of treeEntries()) {
      const parent = parentPath(entry.path);
      if (!grouped.has(parent)) grouped.set(parent, []);
      grouped.get(parent)!.push(entry);
    }
    for (const [, children] of grouped) {
      children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return grouped;
  });
  const visibleTreeRows = createMemo<TreeVisibleRow[]>(() => {
    if (viewMode() !== "tree") return [];
    const out: TreeVisibleRow[] = [];
    const walk = (parent: string, depth: number) => {
      const children = treeChildrenByParent().get(parent) || [];
      for (const child of children) {
        out.push({ entry: child, depth });
        if (child.type === "dir" && expandedDirPathSet().has(child.path)) {
          walk(child.path, depth + 1);
        }
      }
    };
    walk(WORKSPACE_ROOT, 0);
    return out;
  });

  const indexByPath = createMemo(() => {
    const map = new Map<string, number>();
    const orderedEntries = viewMode() === "tree" ? visibleTreeRows().map((row) => row.entry) : entries();
    orderedEntries.forEach((entry, index) => map.set(entry.path, index));
    return map;
  });

  const flashAction = (shortMessage: string, detailMessage?: string) => {
    setActionMessage(props.mode === "side" ? shortMessage : (detailMessage || shortMessage));
    if (actionMessageTimer) {
      clearTimeout(actionMessageTimer);
      actionMessageTimer = null;
    }
    actionMessageTimer = setTimeout(() => {
      setActionMessage(null);
      actionMessageTimer = null;
    }, 1400);
  };

  const refreshList = async (targetPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await kernel.filesystem<ListResult>({
        op: "list",
        path: targetPath || currentPath(),
      });
      setCurrentPath(result.path);
      setEntries(result.entries);
      setPersistenceEnabled(result.persistent);
      const nextSelectedPaths = selectedPaths().filter((path) => result.entries.some((e) => e.path === path));
      setSelectedPaths(nextSelectedPaths);
      setSelectedPath((prev) => (prev && result.entries.some((e) => e.path === prev) ? prev : (nextSelectedPaths[0] || null)));
      setSelectionAnchorPath((prev) => (prev && result.entries.some((e) => e.path === prev) ? prev : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const refreshTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const collected: FileEntry[] = [];
      const listRecursive = async (path: string) => {
        const result = await kernel.filesystem<ListResult>({ op: "list", path });
        if (path === WORKSPACE_ROOT) setPersistenceEnabled(result.persistent);
        for (const entry of result.entries) {
          collected.push(entry);
          if (entry.type === "dir") {
            await listRecursive(entry.path);
          }
        }
      };

      await listRecursive(WORKSPACE_ROOT);
      setCurrentPath(WORKSPACE_ROOT);
      setTreeEntries(collected);

      const treePathSet = new Set(collected.map((entry) => entry.path));
      const nextSelectedPaths = selectedPaths().filter((path) => treePathSet.has(path));
      setSelectedPaths(nextSelectedPaths);
      setSelectedPath((prev) => (prev && treePathSet.has(prev) ? prev : (nextSelectedPaths[0] || null)));
      setSelectionAnchorPath((prev) => (prev && treePathSet.has(prev) ? prev : null));
      setExpandedDirPaths((prev) => {
        const next = prev.filter((path) => path === WORKSPACE_ROOT || treePathSet.has(path));
        return next.includes(WORKSPACE_ROOT) ? next : [WORKSPACE_ROOT, ...next];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async (targetPath?: string) => {
    if (viewMode() === "tree") {
      await refreshTree();
      return;
    }
    await refreshList(targetPath);
  };

  const openDirectory = async (path: string) => {
    if (viewMode() === "tree") {
      setExpandedDirPaths((prev) => (prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]));
      return;
    }
    await refresh(path);
  };

  const previewFile = async (path: string) => {
    setSelectedPath(path);
    setSelectedPaths([path]);
    await kernel.filesystem<ReadTextResult>({
      op: "read_text",
      path,
      maxBytes: 32,
    }).catch(() => undefined);
  };

  const openEntry = async (entry: FileEntry) => {
    if (entry.type === "dir") {
      await openDirectory(entry.path);
      return;
    }
    await previewFile(entry.path);
  };

  const createFolder = async () => {
    const name = window.prompt("New folder name", "data");
    if (!name) return;
    try {
      const selected = selectedEntry();
      const targetDir = viewMode() === "tree" && selected?.type === "dir" ? selected.path : currentPath();
      await kernel.filesystem({
        op: "mkdir",
        path: `${targetDir}/${name}`,
      });
      if (viewMode() === "tree") {
        setExpandedDirPaths((prev) => (prev.includes(targetDir) ? prev : [...prev, targetDir]));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const expandSelectedFolder = async () => {
    const selected = selectedFolderEntry();
    if (!selected) return;

    if (viewMode() !== "tree") {
      props.onViewModeChange("tree");
      await refreshTree();
    }

    const nextExpanded = new Set(expandedDirPaths());
    nextExpanded.add(selected.path);

    const walk = (parent: string, depth: number) => {
      if (depth >= 10) return;
      const children = treeChildrenByParent().get(parent) || [];
      for (const child of children) {
        if (child.type !== "dir") continue;
        nextExpanded.add(child.path);
        walk(child.path, depth + 1);
      }
    };

    walk(selected.path, 0);
    setExpandedDirPaths(Array.from(nextExpanded));
  };

  const collapseSelectedFolder = () => {
    const selected = selectedFolderEntry();
    if (!selected) return;

    const nextExpanded = new Set(expandedDirPaths());
    const walk = (parent: string, depth: number) => {
      if (depth >= 10) return;
      const children = treeChildrenByParent().get(parent) || [];
      for (const child of children) {
        if (child.type !== "dir") continue;
        nextExpanded.delete(child.path);
        walk(child.path, depth + 1);
      }
    };

    walk(selected.path, 0);
    nextExpanded.delete(selected.path);
    nextExpanded.add(WORKSPACE_ROOT);
    setExpandedDirPaths(Array.from(nextExpanded));
  };

  const toggleExpandCollapseSelectedFolder = async () => {
    if (isSelectedFolderExpanded()) {
      collapseSelectedFolder();
      return;
    }
    await expandSelectedFolder();
  };

  const uploadFiles = async (fileList: FileList | null, targetDir?: string) => {
    if (!fileList || fileList.length === 0) return;
    try {
      const files = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          name: file.name,
          data_base64: await toBase64(file),
        })),
      );
      await kernel.filesystem({
        op: "upload",
        path: targetDir || currentPath(),
        files,
      });
      flashAction("Uploaded", `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload files");
    } finally {
      if (uploadInputRef) uploadInputRef.value = "";
    }
  };

  const deleteEntry = async (entry: FileEntry) => {
    const ok = window.confirm(`Delete ${entry.name}? This cannot be undone.`);
    if (!ok) return;
    try {
      await kernel.filesystem({ op: "delete", path: entry.path });
      setSelectedPath((prev) => (prev === entry.path ? null : prev));
      setSelectedPaths((prev) => prev.filter((path) => path !== entry.path));
      flashAction("Deleted", `Deleted ${entry.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    }
  };

  const renameEntry = async (entry: FileEntry) => {
    const nextName = window.prompt("Rename to", entry.name);
    if (!nextName || nextName === entry.name) return;
    try {
      await kernel.filesystem({ op: "rename", path: entry.path, newName: nextName });
      flashAction("Renamed", `Renamed to ${nextName}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename entry");
    }
  };

  const moveEntry = async (entry: FileEntry) => {
    const destination = window.prompt("Move to directory path", currentPath());
    if (!destination) return;
    try {
      await kernel.filesystem({ op: "move", sourcePath: entry.path, destinationDir: destination });
      setSelectedPath((prev) => (prev === entry.path ? null : prev));
      setSelectedPaths((prev) => prev.filter((path) => path !== entry.path));
      flashAction("Moved", `Moved ${entry.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move entry");
    }
  };

  const copyEntry = async (entry: FileEntry) => {
    const destination = window.prompt("Copy to directory path", currentPath());
    if (!destination) return;
    try {
      await kernel.filesystem({ op: "copy", sourcePath: entry.path, destinationDir: destination });
      flashAction("Copied", `Copied ${entry.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy entry");
    }
  };

  const downloadEntry = async (entry: FileEntry) => {
    if (entry.type !== "file") return;
    try {
      const result = await kernel.filesystem<DownloadResult>({ op: "download", path: entry.path });
      const binary = atob(result.data_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: result.mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.name;
      a.click();
      URL.revokeObjectURL(url);
      flashAction("Downloaded", `Downloaded ${entry.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download file");
    }
  };

  onMount(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const root = panelRootRef;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.contains(target)) return;
      if (!selectedPath() && selectedPaths().length === 0) return;
      clearSelection();
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    });

    if (viewMode() === "tree") {
      void refreshTree();
      return;
    }
    void refreshList(WORKSPACE_ROOT);
  });

  onCleanup(() => {
    if (renameHoldTimer) {
      clearTimeout(renameHoldTimer);
      renameHoldTimer = null;
    }
    if (actionMessageTimer) {
      clearTimeout(actionMessageTimer);
      actionMessageTimer = null;
    }
    if (dragGhostEl) {
      dragGhostEl.remove();
      dragGhostEl = null;
    }
  });

  const deleteSelectedEntry = async () => {
    const selected = selectedEntries();
    if (selected.length === 0) return;
    if (selected.length === 1) {
      await deleteEntry(selected[0]);
      return;
    }

    const ok = window.confirm(`Delete ${selected.length} items? This cannot be undone.`);
    if (!ok) return;

    try {
      for (const entry of selected) {
        await kernel.filesystem({ op: "delete", path: entry.path });
      }
      setSelectedPath(null);
      setSelectedPaths([]);
      setSelectionAnchorPath(null);
      flashAction("Deleted", `Deleted ${selected.length} items`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete selected entries");
    }
  };

  const armHoldRename = (entry: FileEntry, e: PointerEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || selectedEntries().length > 1) return;
    if (renameHoldTimer) clearTimeout(renameHoldTimer);
    renameHoldTimer = setTimeout(() => {
      setSelectedPath(entry.path);
      setSelectedPaths([entry.path]);
      setSelectionAnchorPath(entry.path);
      setEditingPath(entry.path);
      setEditingName(entry.name);
      renameHoldTimer = null;
    }, 500);
  };

  const clearHoldRename = () => {
    if (renameHoldTimer) {
      clearTimeout(renameHoldTimer);
      renameHoldTimer = null;
    }
  };

  const clearSelection = () => {
    setSelectedPath(null);
    setSelectedPaths([]);
    setSelectionAnchorPath(null);
  };

  const commitInlineRename = async (entry: FileEntry) => {
    const nextName = editingName().trim();
    setEditingPath(null);

    if (!nextName || nextName === entry.name) {
      setEditingName("");
      return;
    }

    try {
      const result = await kernel.filesystem<{ ok: boolean; path: string }>({ op: "rename", path: entry.path, newName: nextName });
      setSelectedPath(result.path);
      setSelectedPaths([result.path]);
      setSelectionAnchorPath(result.path);
      setEditingName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename entry");
      setEditingName("");
    }
  };

  const cancelInlineRename = () => {
    setEditingPath(null);
    setEditingName("");
  };

  const copySelectedToClipboard = () => {
    const selected = selectedEntries();
    if (selected.length === 0) return;
    setClipboardEntries(selected.map((entry) => ({ sourcePath: entry.path, name: entry.name })));
    flashAction("Copied", `Copied ${selected.length} item${selected.length === 1 ? "" : "s"}`);
  };

  const pasteClipboardToCurrentDirectory = async () => {
    const clips = clipboardEntries();
    if (clips.length === 0) return;
    try {
      for (const clip of clips) {
        await kernel.filesystem({ op: "copy", sourcePath: clip.sourcePath, destinationDir: currentPath() });
      }
      flashAction("Pasted", `Pasted ${clips.length} item${clips.length === 1 ? "" : "s"}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to paste entry");
    }
  };

  const moveSelectedEntries = async () => {
    const selected = selectedEntries();
    if (selected.length === 0) return;
    if (selected.length === 1) {
      await moveEntry(selected[0]);
      return;
    }

    const destination = window.prompt("Move selected items to directory path", currentPath());
    if (!destination) return;
    try {
      for (const entry of selected) {
        await kernel.filesystem({ op: "move", sourcePath: entry.path, destinationDir: destination });
      }
      setSelectedPath(null);
      setSelectedPaths([]);
      setSelectionAnchorPath(null);
      flashAction("Moved", `Moved ${selected.length} items`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move selected entries");
    }
  };

  const copySelectedEntries = async () => {
    const selected = selectedEntries();
    if (selected.length === 0) return;
    if (selected.length === 1) {
      await copyEntry(selected[0]);
      return;
    }

    const destination = window.prompt("Copy selected items to directory path", currentPath());
    if (!destination) return;
    try {
      for (const entry of selected) {
        await kernel.filesystem({ op: "copy", sourcePath: entry.path, destinationDir: destination });
      }
      flashAction("Copied", `Copied ${selected.length} items`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy selected entries");
    }
  };

  createEffect(() => {
    const activeEditingPath = editingPath();
    if (!activeEditingPath) return;
    const scheduleFocus = () => {
      const input = editingInputRef;
      if (!input) return;
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    };
    queueMicrotask(scheduleFocus);
    requestAnimationFrame(scheduleFocus);
  });

  const handleEntryDragStart = (entry: FileEntry, e: DragEvent, rowEl: HTMLDivElement) => {
    clearHoldRename();
    if (editingPath() === entry.path) {
      cancelInlineRename();
    }
    setDraggedPath(entry.path);

    if (dragGhostEl) {
      dragGhostEl.remove();
      dragGhostEl = null;
    }

    const rowLabel = rowEl.querySelector("span.truncate");
    const labelStyles = rowLabel ? getComputedStyle(rowLabel) : getComputedStyle(rowEl);

    const ghost = document.createElement("div");
    ghost.style.position = "fixed";
    ghost.style.top = "0";
    ghost.style.left = "0";
    ghost.style.transform = "translate(-10000px, -10000px)";
    ghost.style.pointerEvents = "none";
    ghost.style.display = "inline-flex";
    ghost.style.alignItems = "center";
    ghost.style.gap = "6px";
    ghost.style.maxWidth = "260px";
    ghost.style.padding = "4px 8px";
    ghost.style.borderRadius = "6px";
    ghost.style.background = "color-mix(in srgb, var(--foreground) 12%, transparent)";
    ghost.style.border = "1px solid color-mix(in srgb, var(--foreground) 24%, transparent)";
    ghost.style.color = labelStyles.color;
    ghost.style.fontFamily = labelStyles.fontFamily;
    ghost.style.fontSize = labelStyles.fontSize;
    ghost.style.fontWeight = labelStyles.fontWeight;
    ghost.style.letterSpacing = labelStyles.letterSpacing;
    ghost.style.lineHeight = labelStyles.lineHeight;
    ghost.style.opacity = "1";
    ghost.style.filter = "none";
    ghost.style.textRendering = "geometricPrecision";

    const sourceIcon = rowEl.querySelector("svg");
    if (sourceIcon) {
      const iconClone = sourceIcon.cloneNode(true) as SVGElement;
      iconClone.setAttribute("width", "13");
      iconClone.setAttribute("height", "13");
      ghost.appendChild(iconClone);
    }

    const label = document.createElement("span");
    label.textContent = entry.name;
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.whiteSpace = "nowrap";
    label.style.opacity = "1";
    label.style.filter = "none";
    label.style.fontWeight = labelStyles.fontWeight;
    ghost.appendChild(label);

    document.body.appendChild(ghost);
    dragGhostEl = ghost;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", entry.path);
      e.dataTransfer.setDragImage(ghost, 10, 10);
    }
  };

  const handleEntryDragEnd = () => {
    setDraggedPath(null);
    setDragOverDirPath(null);
    setDragOverBreadcrumbPath(null);
    if (dragGhostEl) {
      dragGhostEl.remove();
      dragGhostEl = null;
    }
  };

  const moveDraggedEntryToDirectory = async (destinationDir: string, sourceOverride?: string | null) => {
    const sourcePath = sourceOverride || draggedPath();
    if (!sourcePath || sourcePath === destinationDir) return;
    if (parentPath(sourcePath) === destinationDir) return;
    try {
      await kernel.filesystem({ op: "move", sourcePath, destinationDir });
      if (selectedPath() === sourcePath) setSelectedPath(null);
      setSelectedPaths((prev) => prev.filter((path) => path !== sourcePath));
      flashAction("Moved", "Moved item");
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move entry";
      if (message === "Target already exists") {
        const itemName = basename(sourcePath) || "item";
        const rawChoice = window.prompt(
          `An item named ${itemName} already exists here. Type: replace, copy, or skip`,
          "skip",
        );

        if (!rawChoice) return;
        const choice = rawChoice.trim().toLowerCase();
        const conflictChoice: MoveConflictChoice | null =
          choice === "replace" ? "replace" : choice === "copy" ? "keep_both" : choice === "skip" ? "skip" : null;

        if (!conflictChoice) {
          setError("Invalid choice. Type replace, copy, or skip.");
          return;
        }

        if (conflictChoice === "skip") {
          return;
        }

        try {
          await kernel.filesystem({ op: "move", sourcePath, destinationDir, onConflict: conflictChoice });
          if (selectedPath() === sourcePath) setSelectedPath(null);
          setSelectedPaths((prev) => prev.filter((path) => path !== sourcePath));
          flashAction(conflictChoice === "replace" ? "Replaced" : "Copied", conflictChoice === "replace" ? "Replaced item" : "Saved copy");
          await refresh();
          return;
        } catch (conflictErr) {
          setError(conflictErr instanceof Error ? conflictErr.message : "Failed to resolve move conflict");
          return;
        }
      }

      setError(message);
    }
  };

  const handlePanelDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDirPath(null);
    setDragOverBreadcrumbPath(null);
    const dt = e.dataTransfer;
    if (!dt) return;

    if (dt.files && dt.files.length > 0) {
      await uploadFiles(dt.files, viewMode() === "tree" ? WORKSPACE_ROOT : undefined);
      return;
    }

    const sourcePath = dt.getData("text/plain") || draggedPath();
    if (sourcePath) {
      await moveDraggedEntryToDirectory(viewMode() === "tree" ? WORKSPACE_ROOT : currentPath(), sourcePath);
    }
  };

  const toggleViewMode = () => {
    const nextMode: FileListViewMode = viewMode() === "list" ? "tree" : "list";
    props.onViewModeChange(nextMode);
    if (nextMode === "tree") {
      setCurrentPath(WORKSPACE_ROOT);
      if (!expandedDirPathSet().has(WORKSPACE_ROOT)) {
        setExpandedDirPaths((prev) => [WORKSPACE_ROOT, ...prev]);
      }
      void refreshTree();
      return;
    }
    void refreshList(currentPath());
  };

  const Breadcrumbs: Component = () => (
    <div class="flex flex-wrap items-center gap-1">
        {">"}
      <For each={breadcrumbs()}>
        {(crumb, index) => (
          <>
            <Show when={index() > 0}>
              <span class="text-secondary/50 select-none">/</span>
            </Show>
            <button
              data-testid={TESTID.filesPanelBreadcrumb}
              data-path={crumb.path}
              class={clsx(
                "px-1.5 py-0.5 rounded-sm bg-foreground/53 hover:bg-foreground",
                index() === breadcrumbs().length - 1 && "font-semibold",
                dragOverBreadcrumbPath() === crumb.path && "ring-1 ring-inset ring-accent/70 bg-foreground",
              )}
              onClick={() => void openDirectory(crumb.path)}
              title={`Open ${crumb.path}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverDirPath(null);
                setDragOverBreadcrumbPath(crumb.path);
              }}
              onDragLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                if (related && (e.currentTarget as HTMLButtonElement).contains(related)) return;
                if (dragOverBreadcrumbPath() === crumb.path) setDragOverBreadcrumbPath(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverBreadcrumbPath(null);
                setDragOverDirPath(null);

                const dt = e.dataTransfer;
                if (!dt) return;

                if (dt.files && dt.files.length > 0) {
                  void uploadFiles(dt.files, crumb.path);
                  return;
                }

                const sourcePath = dt.getData("text/plain") || draggedPath();
                void moveDraggedEntryToDirectory(crumb.path, sourcePath);
              }}
            >
              {crumb.label}
            </button>
          </>
        )}
      </For>
    </div>
  );

  return (
    <div
      ref={panelRootRef}
      tabIndex={0}
      data-testid={TESTID.filesPanelRoot}
      data-mode={props.mode}
      class={clsx(
        "flex flex-col gap-3 rounded-sm outline-none",
        props.mode === "side" ? "text-xs" : "text-sm",
      )}
      onKeyDown={(e) => {
        if (editingPath()) return;
        const key = e.key.toLowerCase();
        const hasCommandModifier = e.metaKey || e.ctrlKey;
        if (!hasCommandModifier || e.altKey || e.shiftKey) return;

        if (key === "c") {
          if (selectedEntries().length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          copySelectedToClipboard();
          return;
        }

        if (key === "v") {
          if (clipboardEntries().length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          void pasteClipboardToCurrentDirectory();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        void handlePanelDrop(e);
      }}
    >
      <div class={clsx("flex items-center gap-2", props.mode === "side" ? "justify-start" : "justify-between")}>
        <div class="flex items-center gap-2.5">
          <h3 class="font-bold uppercase tracking-wide text-secondary/80">Files and Data</h3>
          <Show when={props.mode === "side"}>
            <span
              class={clsx("inline-block w-2 h-2 rounded-full", persistenceEnabled() ? "bg-success" : "bg-warning")}
              title={persistenceEnabled() ? "Persistent" : "Session memory"}
              aria-label={persistenceEnabled() ? "Persistent" : "Session memory"}
            />
          </Show>
        </div>

        <Show when={props.mode === "dialog"}>
          <div class={clsx("text-[10px] text-right", persistenceEnabled() ? "text-success" : "text-warning")}>
            {persistenceEnabled() ? "Persistent" : "Session memory"}
          </div>
        </Show>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        class="hidden"
        onChange={(e) => {
          void uploadFiles(e.currentTarget.files);
        }}
      />

      <Show when={error()}>
        <div data-testid={TESTID.filesPanelError} class="rounded-sm ui-border border-primary/60 bg-primary/10 p-2 text-primary text-[11px]">{error()}</div>
      </Show>

      <div
        class={clsx(
          "rounded-sm ui-border overflow-hidden",
          props.mode === "side" && "border-secondary/25",
        )}
      >
        <div class={clsx("bg-foreground/53 px-2 py-1.5 flex items-center gap-1.5", props.mode === "dialog" && dialogBorderBottom)}>
          <Show
            when={props.mode === "dialog"}
            fallback={
              <>
                <button
                  class="w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center"
                  title="Upload files"
                  aria-label="Upload files"
                  onClick={() => uploadInputRef?.click()}
                >
                  <CloudUpload size={14} />
                </button>
                <button
                  class="w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center"
                  title={viewMode() === "list" ? "Switch to tree view" : "Switch to list view"}
                  aria-label={viewMode() === "list" ? "Switch to tree view" : "Switch to list view"}
                  onClick={toggleViewMode}
                >
                  <Show when={viewMode() === "list"} fallback={<FolderSymlink size={14} />}>
                    <ListTree size={14} />
                  </Show>
                </button>
                <button
                  class="w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center"
                  title="Refresh"
                  aria-label="Refresh"
                  onClick={() => void refresh()}
                >
                  <RotateCw size={14} />
                </button>
              </>
            }
          >
            <button class="px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1" onClick={() => uploadInputRef?.click()}><CloudUpload size={13} /> Upload</button>
            <button class="px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1" onClick={toggleViewMode} title={viewMode() === "list" ? "Switch to tree view" : "Switch to list view"}>
              <Show when={viewMode() === "list"} fallback={<><FolderSymlink size={13} /> List</>}>
                <><ListTree size={13} /> Tree</>
              </Show>
            </button>
            <button class="px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1" onClick={() => void refresh()}><RotateCw size={13} /> Refresh</button>
          </Show>
          <Show when={actionMessage()}>
            <div class="ml-auto text-[10px] text-secondary/70 truncate" title={actionMessage() || ""}>{actionMessage()}</div>
          </Show>
        </div>

        <div
          class={clsx(
            "bg-background/70 px-2 flex items-center gap-2 overflow-hidden transition-all duration-200 ease-out",
            viewMode() === "tree" ? "h-0 py-0 opacity-0 -translate-y-1 pointer-events-none" : "h-9 py-1.5 opacity-100 translate-y-0",
          )}
        >
          <div class="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
        </div>

        <div
          class={clsx(
            "px-2 py-1 text-[11px] uppercase text-secondary/60 bg-foreground/35 border-t border-secondary/40 grid gap-2",
            props.mode === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
            props.mode === "dialog" && dialogBorderTop,
          )}
        >
          <div>Name</div>
          <div class="text-right">Size</div>
          <Show when={props.mode === "dialog"}>
            <div class="text-right">Modified</div>
          </Show>
        </div>

        <div
          class={clsx(
            "bg-background/55",
            props.mode === "side" && "max-h-[58vh] overflow-y-auto",
            props.mode === "dialog" && "max-h-[48vh]",
          )}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (editingPath()) return;
            clearSelection();
          }}
        >
          <Show when={viewMode() === "list" && currentPath() !== WORKSPACE_ROOT}>
            <div
              data-testid={TESTID.filesPanelRow}
              data-entry-path={parentDirPath()}
              data-entry-name=".."
              data-entry-type="dir"
              class={clsx(
                "group grid gap-2 px-2 py-1 cursor-pointer",
                props.mode === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
                "bg-foreground/10 hover:bg-foreground/25",
                dragOverDirPath() === parentDirPath() && "ring-1 ring-accent/70 bg-foreground!",
              )}
              onClick={() => {
                panelRootRef?.focus({ preventScroll: true });
                void openDirectory(parentDirPath());
              }}
              onDblClick={() => {
                void openDirectory(parentDirPath());
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDirPath(parentDirPath());
              }}
              onDragLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                if (related && (e.currentTarget as HTMLDivElement).contains(related)) return;
                if (dragOverDirPath() === parentDirPath()) setDragOverDirPath(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverDirPath(null);
                const dt = e.dataTransfer;
                if (!dt) return;
                if (dt.files && dt.files.length > 0) {
                  void uploadFiles(dt.files, parentDirPath());
                  return;
                }
                const sourcePath = dt.getData("text/plain") || draggedPath();
                void moveDraggedEntryToDirectory(parentDirPath(), sourcePath);
              }}
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <FolderUp size={13} class="shrink-0 text-accent" />
                <span class="truncate">..</span>
              </div>
              <div class="text-secondary/60 text-right tabular-nums"></div>
              <Show when={props.mode === "dialog"}>
                <div class="text-secondary/60 text-right tabular-nums"></div>
              </Show>
            </div>
          </Show>

          <Show when={viewMode() === "list" && entries().length === 0 && currentPath() === WORKSPACE_ROOT}>
            <div
              class={clsx(
                "grid gap-2 px-2 py-1 italic text-secondary/55",
                props.mode === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
                "bg-background/55",
              )}
            >
              <div class="min-w-0 truncate">(empty)</div>
              <div></div>
              <Show when={props.mode === "dialog"}>
                <div></div>
              </Show>
            </div>
          </Show>

          <Show when={viewMode() === "tree" && visibleTreeRows().length === 0}>
            <div
              class={clsx(
                "grid gap-2 px-2 py-1 italic text-secondary/55",
                props.mode === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
                "bg-background/55",
              )}
            >
              <div class="min-w-0 truncate">(empty)</div>
              <div></div>
              <Show when={props.mode === "dialog"}>
                <div></div>
              </Show>
            </div>
          </Show>

          <For each={viewMode() === "tree" ? visibleTreeRows() : entries().map((entry, index) => ({ entry, depth: 0, index }))}>
            {(row, loopIndex) => (
              <div
                draggable={editingPath() !== row.entry.path}
                data-testid={TESTID.filesPanelRow}
                data-entry-path={row.entry.path}
                data-entry-name={row.entry.name}
                data-entry-type={row.entry.type}
                class={clsx(
                  "group grid gap-2 px-2 py-1 cursor-pointer",
                  props.mode === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
                  loopIndex() % 2 === 0 ? "bg-background/55" : "bg-foreground/15",
                  selectedPathSet().has(row.entry.path) && "bg-foreground/30",
                  dragOverDirPath() === row.entry.path && row.entry.type === "dir" && "ring-1 ring-accent/70 bg-foreground!",
                  "hover:bg-foreground/30",
                )}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  panelRootRef?.focus({ preventScroll: true });
                  if (editingPath() === row.entry.path) return;
                  const entryPath = row.entry.path;
                  const anchorPath = selectionAnchorPath() || selectedPath();
                  const shiftSelect = e.shiftKey;
                  const toggleSelect = e.metaKey || e.ctrlKey;

                  if (shiftSelect && anchorPath && indexByPath().has(anchorPath)) {
                    const start = indexByPath().get(anchorPath)!;
                    const end = indexByPath().get(entryPath)!;
                    const lo = Math.min(start, end);
                    const hi = Math.max(start, end);
                    const orderedEntries = viewMode() === "tree" ? visibleTreeRows().map((item) => item.entry) : entries();
                    const rangePaths = orderedEntries.slice(lo, hi + 1).map((item) => item.path);
                    if (toggleSelect) {
                      setSelectedPaths((prev) => Array.from(new Set([...prev, ...rangePaths])));
                    } else {
                      setSelectedPaths(rangePaths);
                    }
                    setSelectedPath(entryPath);
                    return;
                  }

                  if (toggleSelect) {
                    setSelectedPaths((prev) => {
                      const has = prev.includes(entryPath);
                      if (has) {
                        const next = prev.filter((path) => path !== entryPath);
                        if (selectedPath() === entryPath) setSelectedPath(next[next.length - 1] || null);
                        return next;
                      }
                      return [...prev, entryPath];
                    });
                    setSelectedPath(entryPath);
                    setSelectionAnchorPath(entryPath);
                    return;
                  }

                  setSelectedPath(entryPath);
                  setSelectedPaths([entryPath]);
                  setSelectionAnchorPath(entryPath);
                  if (row.entry.type === "file") void previewFile(row.entry.path);
                }}
                onDblClick={() => {
                  void openEntry(row.entry);
                }}
                onDragStart={(e) => handleEntryDragStart(row.entry, e, e.currentTarget)}
                onDragEnd={handleEntryDragEnd}
                onDragOver={(e) => {
                  if (row.entry.type !== "dir") return;
                  e.preventDefault();
                  setDragOverDirPath(row.entry.path);
                }}
                onDragLeave={(e) => {
                  const related = e.relatedTarget as Node | null;
                  if (related && (e.currentTarget as HTMLDivElement).contains(related)) return;
                  if (dragOverDirPath() === row.entry.path) setDragOverDirPath(null);
                }}
                onDrop={(e) => {
                  if (row.entry.type !== "dir") return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverDirPath(null);
                  const dt = e.dataTransfer;
                  if (!dt) return;
                  if (dt.files && dt.files.length > 0) {
                    void (async () => {
                      try {
                        const files = await Promise.all(
                          Array.from(dt.files).map(async (file) => ({
                            name: file.name,
                            data_base64: await toBase64(file),
                          })),
                        );
                        await kernel.filesystem({ op: "upload", path: row.entry.path, files });
                        await refresh();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to upload files");
                      }
                    })();
                    return;
                  }
                  const sourcePath = dt.getData("text/plain") || draggedPath();
                  void moveDraggedEntryToDirectory(row.entry.path, sourcePath);
                }}
              >
                <div class="flex items-center gap-1.5 min-w-0" style={viewMode() === "tree" ? { "padding-left": `${row.depth * 14}px` } : undefined}>
                  <Show when={props.mode === "dialog" && viewMode() === "tree" && row.entry.type === "dir"}>
                    <button
                      class="inline-flex h-5 w-5 items-center justify-center text-secondary/55 hover:text-secondary rounded-sm shrink-0"
                      title={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                      aria-label={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                      onClick={(e) => {
                        e.stopPropagation();
                        panelRootRef?.focus({ preventScroll: true });
                        void openDirectory(row.entry.path);
                      }}
                    >
                      <Show when={expandedDirPathSet().has(row.entry.path)} fallback={<ChevronRight size={13} />}>
                        <ChevronDown size={13} />
                      </Show>
                    </button>
                  </Show>
                  <Show
                    when={row.entry.type === "dir"}
                    fallback={(() => {
                      const Icon = getFileIcon(row.entry.name);
                      return <Icon size={13} class="shrink-0 text-secondary/60" />;
                    })()}
                  >
                    <Show
                      when={viewMode() === "tree"}
                      fallback={<FolderOpen size={13} class="shrink-0 text-accent" />}
                    >
                      <Show when={expandedDirPathSet().has(row.entry.path)} fallback={<Folder size={13} class="shrink-0 text-accent" />}>
                        <FolderOpen size={13} class="shrink-0 text-accent" />
                      </Show>
                    </Show>
                  </Show>
                  <Show
                    when={editingPath() === row.entry.path}
                    fallback={
                      <span
                        class="truncate"
                        title={row.entry.name}
                        onPointerDown={(e) => armHoldRename(row.entry, e)}
                        onPointerUp={clearHoldRename}
                        onPointerLeave={clearHoldRename}
                      >
                        {row.entry.name}
                      </span>
                    }
                  >
                    <input
                      ref={(el) => {
                        editingInputRef = el;
                      }}
                      value={editingName()}
                      class="min-w-0 w-full px-0 py-0 bg-foreground/40 outline-none border-0 rounded-none"
                      autofocus
                      onClick={(e) => e.stopPropagation()}
                      onInput={(e) => setEditingName(e.currentTarget.value)}
                      onBlur={() => {
                        void commitInlineRename(row.entry);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitInlineRename(row.entry);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelInlineRename();
                        }
                      }}
                    />
                  </Show>
                </div>
                <div class={clsx("text-secondary/60 text-right tabular-nums", props.mode === "dialog" && "text-[12px]")}>
                  <Show
                    when={row.entry.type === "file"}
                    fallback={
                      <Show when={props.mode === "side" && viewMode() === "tree" && row.entry.type === "dir"}>
                        <div class="flex w-full justify-end items-center">
                          <button
                            class="inline-flex h-5 w-5 items-center justify-end p-0 -mr-1 text-secondary/55 hover:text-secondary rounded-sm"
                            title={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                            aria-label={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                            onClick={(e) => {
                              e.stopPropagation();
                              panelRootRef?.focus({ preventScroll: true });
                              void openDirectory(row.entry.path);
                            }}
                          >
                            <Show when={expandedDirPathSet().has(row.entry.path)} fallback={<ArrowRight size={13} class="ml-auto" />}>
                              <ChevronDown size={13} class="ml-auto" />
                            </Show>
                          </button>
                        </div>
                      </Show>
                    }
                  >
                    {formatBytes(row.entry.size)}
                  </Show>
                </div>
                <Show when={props.mode === "dialog"}>
                  <div class="text-secondary/60 text-right tabular-nums text-[12px]">{formatDate(row.entry.mtime)}</div>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class={clsx("bg-foreground/53 px-2 py-1.5 flex items-center gap-1.5", props.mode === "dialog" ? dialogBorderTop : "border-t border-secondary/40")}>
          <Show
            when={props.mode === "dialog"}
            fallback={
              <>
                <button class="w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center" title="Create folder" aria-label="Create folder" onClick={() => void createFolder()}>
                  <Plus size={14} />
                </button>
                <Show when={viewMode() === "tree"}>
                  <button
                    class={clsx("w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center", !selectedFolderEntry() && "opacity-40 cursor-not-allowed")}
                    title={isSelectedFolderExpanded() ? "Collapse selected folder (10 levels)" : "Expand selected folder (10 levels)"}
                    aria-label={isSelectedFolderExpanded() ? "Collapse selected folder (10 levels)" : "Expand selected folder (10 levels)"}
                    disabled={!selectedFolderEntry()}
                    onClick={() => void toggleExpandCollapseSelectedFolder()}
                  >
                    <Show when={isSelectedFolderExpanded()} fallback={<ArrowDownFromLine size={14} />}>
                      <ListChevronsDownUp size={14} />
                    </Show>
                  </button>
                </Show>
                <button class={clsx("w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center", selectedEntries().length !== 1 && "opacity-40 cursor-not-allowed")} title="Rename selected" aria-label="Rename selected" disabled={selectedEntries().length !== 1} onClick={() => { const s = selectedEntry(); if (s) void renameEntry(s); }}>
                  <Pencil size={14} />
                </button>
                <button class={clsx("w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center", selectedEntries().length === 0 && "opacity-40 cursor-not-allowed")} title="Move selected" aria-label="Move selected" disabled={selectedEntries().length === 0} onClick={() => void moveSelectedEntries()}>
                  <ArrowRightLeft size={14} />
                </button>
                <button class={clsx("w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center", selectedEntries().length === 0 && "opacity-40 cursor-not-allowed")} title="Copy selected" aria-label="Copy selected" disabled={selectedEntries().length === 0} onClick={() => void copySelectedEntries()}>
                  <Copy size={14} />
                </button>
                <button class={clsx("w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center", (selectedEntries().length !== 1 || selectedEntry()?.type !== "file") && "opacity-40 cursor-not-allowed")} title="Download selected file" aria-label="Download selected file" disabled={selectedEntries().length !== 1 || selectedEntry()?.type !== "file"} onClick={() => { const s = selectedEntry(); if (s && s.type === "file") void downloadEntry(s); }}>
                  <Download size={14} />
                </button>
                <button class={clsx("w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center text-primary", selectedEntries().length === 0 && "opacity-40 cursor-not-allowed")} title={selectedEntries().length > 0 ? `Delete ${selectedEntries().length} selected` : "Select files or folders to delete"} aria-label="Delete selected" disabled={selectedEntries().length === 0} onClick={() => void deleteSelectedEntry()}>
                  <Trash2 size={14} />
                </button>
              </>
            }
          >
            <button class="px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1" onClick={() => void createFolder()}><Plus size={13} /> Folder</button>
            <Show when={viewMode() === "tree"}>
              <button
                class={clsx("px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1", !selectedFolderEntry() && "opacity-40 cursor-not-allowed")}
                disabled={!selectedFolderEntry()}
                onClick={() => void toggleExpandCollapseSelectedFolder()}
                title={isSelectedFolderExpanded() ? "Collapse selected folder (10 levels)" : "Expand selected folder (10 levels)"}
              >
                <Show when={isSelectedFolderExpanded()} fallback={<><ArrowDownFromLine size={13} /> Expand</>}>
                  <><ListChevronsDownUp size={13} /> Collapse</>
                </Show>
              </button>
            </Show>
            <button class={clsx("px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1", selectedEntries().length !== 1 && "opacity-40 cursor-not-allowed")} disabled={selectedEntries().length !== 1} onClick={() => { const s = selectedEntry(); if (s) void renameEntry(s); }}><Pencil size={13} /> Rename</button>
            <button class={clsx("px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1", selectedEntries().length === 0 && "opacity-40 cursor-not-allowed")} disabled={selectedEntries().length === 0} onClick={() => void moveSelectedEntries()}><ArrowRightLeft size={13} /> Move</button>
            <button class={clsx("px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1", selectedEntries().length === 0 && "opacity-40 cursor-not-allowed")} disabled={selectedEntries().length === 0} onClick={() => void copySelectedEntries()}><Copy size={13} /> Copy</button>
            <button class={clsx("px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1", (selectedEntries().length !== 1 || selectedEntry()?.type !== "file") && "opacity-40 cursor-not-allowed")} disabled={selectedEntries().length !== 1 || selectedEntry()?.type !== "file"} onClick={() => { const s = selectedEntry(); if (s && s.type === "file") void downloadEntry(s); }}><Download size={13} /> Download</button>
            <button class={clsx("px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1 text-primary", selectedEntries().length === 0 && "opacity-40 cursor-not-allowed")} disabled={selectedEntries().length === 0} onClick={() => void deleteSelectedEntry()} title={selectedEntries().length > 0 ? `Delete ${selectedEntries().length} selected` : "Select files or folders to delete"}><Trash2 size={13} /> Delete</button>
          </Show>
        </div>
      </div>

      <div class="min-h-4 text-[11px] text-secondary/60" aria-live="polite">
        <Show when={loading()}>
          <span>Loading filesystem...</span>
        </Show>
      </div>
    </div>
  );
};

export default FileWorkspacePanel;
