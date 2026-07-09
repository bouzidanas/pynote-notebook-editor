import { type Component, Show } from "solid-js";
import { ArrowDownFromLine, ArrowRightLeft, CloudUpload, Copy, Download, FolderSymlink, ListChevronsDownUp, ListTree, Pencil, Plus, RotateCw, Trash2 } from "lucide-solid";
import clsx from "clsx";
import { dialogBorderBottom, dialogBorderTop } from "./layout";
import { useFileWorkspace } from "./context";

export const TopToolbar: Component = () => {
  const { mode, viewMode, toggleViewMode, refresh, actionMessage, clickUpload } = useFileWorkspace();

  return (
    <div class={clsx("bg-foreground/53 px-2 py-1.5 flex items-center gap-1.5", mode() === "dialog" && dialogBorderBottom)}>
      <Show
        when={mode() === "dialog"}
        fallback={
          <>
            <button
              class="w-7 h-7 rounded-sm hover:bg-foreground flex items-center justify-center"
              title="Upload files"
              aria-label="Upload files"
              onClick={clickUpload}
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
        <button class="px-2 py-1 rounded-sm hover:bg-foreground flex items-center gap-1" onClick={clickUpload}><CloudUpload size={13} /> Upload</button>
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
  );
};

export const BottomToolbar: Component = () => {
  const {
    mode, viewMode, createFolder, selectedFolderEntry, isSelectedFolderExpanded,
    toggleExpandCollapseSelectedFolder, selectedEntries, selectedEntry, renameEntry,
    moveSelectedEntries, copySelectedEntries, downloadEntry, deleteSelectedEntry,
  } = useFileWorkspace();

  return (
    <div class={clsx("bg-foreground/53 px-2 py-1.5 flex items-center gap-1.5", mode() === "dialog" ? dialogBorderTop : "border-t border-secondary/40")}>
      <Show
        when={mode() === "dialog"}
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
  );
};
