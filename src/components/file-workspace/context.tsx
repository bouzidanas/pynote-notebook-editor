import { createContext, useContext, createEffect, createMemo, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import type { FileEntry, FileListViewMode, ListResult, ReadTextResult, DownloadResult, MoveConflictChoice, ClipboardEntry, TreeVisibleRow, FileWorkspacePanelProps } from "./types";
import { WORKSPACE_ROOT, toBase64, parentPath, basename, splitBreadcrumbs } from "./utils";

// All panel state and actions live here. The factory runs once per mounted
// panel (called from FileWorkspacePanel's body), so state is still created on
// mount and discarded on unmount, same as when it was inline.
export const createFileWorkspaceState = (props: FileWorkspacePanelProps) => {
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
  const mode = () => props.mode;
  const viewMode = () => props.viewMode;

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
    // Keep the ghost attached and paintable, but place it well outside viewport.
    // Some engines can skip rendering drag images positioned via large transforms.
    ghost.style.position = "absolute";
    ghost.style.top = "-10000px";
    ghost.style.left = "-10000px";
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

  return {
    mode,
    viewMode,
    currentPath,
    entries,
    selectedPath,
    setSelectedPath,
    selectedPaths,
    setSelectedPaths,
    selectionAnchorPath,
    setSelectionAnchorPath,
    persistenceEnabled,
    loading,
    error,
    draggedPath,
    dragOverDirPath,
    setDragOverDirPath,
    dragOverBreadcrumbPath,
    setDragOverBreadcrumbPath,
    editingPath,
    editingName,
    setEditingName,
    clipboardEntries,
    actionMessage,
    selectedPathSet,
    selectedEntries,
    selectedEntry,
    selectedFolderEntry,
    breadcrumbs,
    parentDirPath,
    expandedDirPathSet,
    isSelectedFolderExpanded,
    visibleTreeRows,
    indexByPath,
    refresh,
    openDirectory,
    openEntry,
    previewFile,
    createFolder,
    toggleExpandCollapseSelectedFolder,
    uploadFiles,
    renameEntry,
    downloadEntry,
    deleteSelectedEntry,
    armHoldRename,
    clearHoldRename,
    clearSelection,
    commitInlineRename,
    cancelInlineRename,
    copySelectedToClipboard,
    pasteClipboardToCurrentDirectory,
    moveSelectedEntries,
    copySelectedEntries,
    handleEntryDragStart,
    handleEntryDragEnd,
    moveDraggedEntryToDirectory,
    handlePanelDrop,
    toggleViewMode,
    // Element refs stay private to this closure; children use these helpers.
    setPanelRootRef: (el: HTMLDivElement) => { panelRootRef = el; },
    setUploadInputRef: (el: HTMLInputElement) => { uploadInputRef = el; },
    setEditingInputRef: (el: HTMLInputElement) => { editingInputRef = el; },
    focusPanel: () => panelRootRef?.focus({ preventScroll: true }),
    clickUpload: () => uploadInputRef?.click(),
  };
};

export type FileWorkspaceContextValue = ReturnType<typeof createFileWorkspaceState>;

export const FileWorkspaceContext = createContext<FileWorkspaceContextValue>();

export const useFileWorkspace = (): FileWorkspaceContextValue => {
  const ctx = useContext(FileWorkspaceContext);
  if (!ctx) throw new Error("useFileWorkspace must be used inside FileWorkspacePanel");
  return ctx;
};
