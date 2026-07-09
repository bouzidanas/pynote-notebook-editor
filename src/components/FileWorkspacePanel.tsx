import { type Component, Show } from "solid-js";
import clsx from "clsx";
import { TESTID } from "../lib/testids";
import type { FileWorkspacePanelProps } from "./file-workspace/types";
import { panelColumnTemplate, dialogColumnTemplate, dialogBorderTop } from "./file-workspace/layout";
import { FileWorkspaceContext, createFileWorkspaceState } from "./file-workspace/context";
import Breadcrumbs from "./file-workspace/Breadcrumbs";
import EntryRows from "./file-workspace/EntryRows";
import { TopToolbar, BottomToolbar } from "./file-workspace/Toolbars";

const FileWorkspacePanel: Component<FileWorkspacePanelProps> = (props) => {
  const state = createFileWorkspaceState(props);
  const {
    viewMode, error, loading, persistenceEnabled, editingPath, selectedEntries,
    clipboardEntries, copySelectedToClipboard, pasteClipboardToCurrentDirectory,
    uploadFiles, handlePanelDrop, setPanelRootRef, setUploadInputRef,
  } = state;

  return (
    <FileWorkspaceContext.Provider value={state}>
      <div
        ref={setPanelRootRef}
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
          ref={setUploadInputRef}
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
          <TopToolbar />

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

          <EntryRows />

          <BottomToolbar />
        </div>

        <div class="min-h-4 text-[11px] text-secondary/60" aria-live="polite">
          <Show when={loading()}>
            <span>Loading filesystem...</span>
          </Show>
        </div>
      </div>
    </FileWorkspaceContext.Provider>
  );
};

export default FileWorkspacePanel;
