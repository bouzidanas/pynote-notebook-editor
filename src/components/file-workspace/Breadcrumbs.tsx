import { type Component, For, Show } from "solid-js";
import clsx from "clsx";
import { TESTID } from "../../lib/testids";
import { useFileWorkspace } from "./context";

const Breadcrumbs: Component = () => {
  const {
    breadcrumbs, dragOverBreadcrumbPath, setDragOverBreadcrumbPath, setDragOverDirPath,
    openDirectory, uploadFiles, draggedPath, moveDraggedEntryToDirectory,
  } = useFileWorkspace();

  return (
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
};

export default Breadcrumbs;
