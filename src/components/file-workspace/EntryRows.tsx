import { type Component, For, Show } from "solid-js";
import { ArrowRight, ChevronDown, ChevronRight, Folder, FolderOpen, FolderUp } from "lucide-solid";
import clsx from "clsx";
import { TESTID } from "../../lib/testids";
import { WORKSPACE_ROOT, formatBytes, formatDate, parentPath, getFileIcon } from "./utils";
import { panelColumnTemplate, dialogColumnTemplate } from "./layout";
import { useFileWorkspace } from "./context";

const EntryRows: Component = () => {
  const {
    mode, viewMode, currentPath, entries, visibleTreeRows, selectedPathSet, selectedPath,
    setSelectedPath, setSelectedPaths, selectionAnchorPath, setSelectionAnchorPath,
    parentDirPath, expandedDirPathSet, indexByPath, dragOverDirPath, setDragOverDirPath,
    draggedPath, editingPath, editingName, setEditingName, openDirectory, openEntry, previewFile,
    uploadFiles, moveDraggedEntryToDirectory, armHoldRename, clearHoldRename, clearSelection,
    commitInlineRename, cancelInlineRename, handleEntryDragStart, handleEntryDragEnd,
    focusPanel, setEditingInputRef,
  } = useFileWorkspace();

  return (
    <div
      class={clsx(
        "bg-background/55",
        mode() === "side" && "max-h-[58vh] overflow-y-auto",
        mode() === "dialog" && "max-h-[48vh]",
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
            mode() === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
            "bg-foreground/10 hover:bg-foreground/25",
            dragOverDirPath() === parentDirPath() && "ring-1 ring-accent/70 bg-foreground!",
          )}
          onClick={() => {
            focusPanel();
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
          <Show when={mode() === "dialog"}>
            <div class="text-secondary/60 text-right tabular-nums"></div>
          </Show>
        </div>
      </Show>

      <Show when={viewMode() === "list" && entries().length === 0 && currentPath() === WORKSPACE_ROOT}>
        <div
          class={clsx(
            "grid gap-2 px-2 py-1 italic text-secondary/55",
            mode() === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
            "bg-background/55",
          )}
        >
          <div class="min-w-0 truncate">(empty)</div>
          <div></div>
          <Show when={mode() === "dialog"}>
            <div></div>
          </Show>
        </div>
      </Show>

      <Show when={viewMode() === "tree" && visibleTreeRows().length === 0}>
        <div
          class={clsx(
            "grid gap-2 px-2 py-1 italic text-secondary/55",
            mode() === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
            "bg-background/55",
          )}
        >
          <div class="min-w-0 truncate">(empty)</div>
          <div></div>
          <Show when={mode() === "dialog"}>
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
              mode() === "dialog" ? dialogColumnTemplate : panelColumnTemplate,
              loopIndex() % 2 === 0 ? "bg-background/55" : "bg-foreground/15",
              selectedPathSet().has(row.entry.path) && "bg-foreground/30",
              dragOverDirPath() === row.entry.path && row.entry.type === "dir" && "ring-1 ring-accent/70 bg-foreground!",
              "hover:bg-foreground/30",
            )}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              focusPanel();
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
              e.preventDefault();
              if (row.entry.type === "dir") {
                setDragOverDirPath(row.entry.path);
              }
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (related && (e.currentTarget as HTMLDivElement).contains(related)) return;
              if (dragOverDirPath() === row.entry.path) setDragOverDirPath(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverDirPath(null);
              const dt = e.dataTransfer;
              if (!dt) return;

              const destinationDir = row.entry.type === "dir" ? row.entry.path : parentPath(row.entry.path);
              if (dt.files && dt.files.length > 0) {
                void uploadFiles(dt.files, destinationDir);
                return;
              }

              const sourcePath = dt.getData("text/plain") || draggedPath();
              if (!sourcePath || sourcePath === row.entry.path) return;
              void moveDraggedEntryToDirectory(destinationDir, sourcePath);
            }}
          >
            <div class="flex items-center gap-1.5 min-w-0" style={viewMode() === "tree" ? { "padding-left": `${row.depth * 14}px` } : undefined}>
              <Show when={mode() === "dialog" && viewMode() === "tree"}>
                <Show
                  when={row.entry.type === "dir"}
                  fallback={<span class="inline-flex h-5 w-5 shrink-0" aria-hidden="true" />}
                >
                  <button
                    class="inline-flex h-5 w-5 items-center justify-center text-secondary/55 hover:text-secondary rounded-sm shrink-0"
                    title={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                    aria-label={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                    onClick={(e) => {
                      e.stopPropagation();
                      focusPanel();
                      void openDirectory(row.entry.path);
                    }}
                  >
                    <Show when={expandedDirPathSet().has(row.entry.path)} fallback={<ChevronRight size={13} />}>
                      <ChevronDown size={13} />
                    </Show>
                  </button>
                </Show>
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
                    setEditingInputRef(el);
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
            <div class={clsx("text-secondary/60 text-right tabular-nums", mode() === "dialog" && "text-[12px]")}>
              <Show
                when={row.entry.type === "file"}
                fallback={
                  <Show when={mode() === "side" && viewMode() === "tree" && row.entry.type === "dir"}>
                    <div class="flex w-full justify-end items-center">
                      <button
                        class="inline-flex h-5 w-5 items-center justify-end p-0 -mr-1 text-secondary/55 hover:text-secondary rounded-sm"
                        title={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                        aria-label={expandedDirPathSet().has(row.entry.path) ? "Collapse folder" : "Expand folder"}
                        onClick={(e) => {
                          e.stopPropagation();
                          focusPanel();
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
            <Show when={mode() === "dialog"}>
              <div class="text-secondary/60 text-right tabular-nums text-[12px]">{formatDate(row.entry.mtime)}</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
};

export default EntryRows;
