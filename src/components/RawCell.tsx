import { type Component, Show, createEffect, createMemo } from "solid-js";
import { type CellData, actions, notebookStore } from "../lib/store";
import CellWrapper from "./CellWrapper";

// A raw cell holds text that is neither run nor rendered, typically LaTeX,
// reStructuredText or Quarto front matter meant for nbconvert. PyNote shows it
// verbatim and keeps it raw when saving, so notebooks from other tools
// round-trip unchanged.

interface RawCellProps {
  cell: CellData;
  isActive: boolean;
  index: number;
  prevCellId: string | null;
}

const RawCell: Component<RawCellProps> = (props) => {
  let textarea: HTMLTextAreaElement | undefined;

  const isEmpty = createMemo(() => !props.cell.content.trim());
  const shouldHideInPresentation = createMemo(() => notebookStore.presentationMode && isEmpty());

  // nbformat stores the target format of a raw cell in metadata.format
  // (older notebooks: raw_mimetype), e.g. "text/latex".
  const format = createMemo(() => {
    const meta = props.cell.metadata;
    const value = meta?.format ?? meta?.raw_mimetype;
    return typeof value === "string" && value ? value : null;
  });

  const fitHeight = () => {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  createEffect(() => {
    if (props.cell.isEditing && textarea) {
      fitHeight();
      textarea.focus();
    }
  });

  const toggleEdit = () => actions.setEditing(props.cell.id, !props.cell.isEditing);

  return (
    <div style={{ display: shouldHideInPresentation() ? "none" : "block" }}>
      <CellWrapper
        id={props.cell.id}
        isActive={props.isActive}
        isEditing={props.cell.isEditing}
        onActivate={() => actions.setActiveCell(props.cell.id)}
        onDelete={() => actions.deleteCell(props.cell.id)}
        onMoveUp={() => actions.moveCell(props.index, props.index - 1)}
        onMoveDown={() => actions.moveCell(props.index, props.index + 1)}
        type="raw"
        onActionClick={toggleEdit}
        prevCellId={props.prevCellId}
        cellIndex={props.index}
      >
        <div
          class="relative min-h-12.5 w-full p-3.5 py-[calc(var(--spacing)*3.5_+_var(--cell-pad-adjust,0px))] max-xs:p-2.5"
          onDblClick={() => actions.setEditing(props.cell.id, true)}
        >
          <span class="absolute top-1.5 right-2.5 text-[10px] uppercase tracking-wider font-bold text-secondary/30 select-none pointer-events-none">
            raw{format() ? ` · ${format()}` : ""}
          </span>
          <Show
            when={props.cell.isEditing}
            fallback={
              <pre
                class="m-0 whitespace-pre-wrap break-words text-secondary/80"
                style={{ "font-family": "var(--code-font-family)", "font-size": "var(--code-base-font-size)" }}
              >
                <Show when={!isEmpty()} fallback={<span class="italic text-secondary/40">Raw cell, not run or rendered. Double click to edit...</span>}>
                  {props.cell.content}
                </Show>
              </pre>
            }
          >
            <textarea
              ref={textarea}
              value={props.cell.content}
              rows={1}
              spellcheck={false}
              aria-label="Raw cell text"
              class="block w-full resize-none overflow-hidden bg-transparent text-secondary outline-none"
              style={{ "font-family": "var(--code-font-family)", "font-size": "var(--code-base-font-size)" }}
              onInput={(e) => {
                actions.updateCell(props.cell.id, e.currentTarget.value);
                fitHeight();
              }}
            />
          </Show>
        </div>
      </CellWrapper>
    </div>
  );
};

export default RawCell;
