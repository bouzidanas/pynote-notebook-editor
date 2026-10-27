import { type JSX, createEffect, getOwner, onCleanup, onMount, runWithOwner } from "solid-js";
import { allCellOptions, configure, mountWhenReady } from "./bridge";
import type { CellHandle, CellOptions } from "./types";

// <PyNoteCell> for Solid (SolidStart, Vite). Shipped as source under the
// "solid" export condition, so the app's own Solid compiles it for server and
// browser. On the server it renders the code as plain text; in the browser the
// live cell takes over the element. All cells on a page are one notebook.

export { configure };
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig } from "./types";

export function PyNoteCell(props: CellOptions): JSX.Element {
  let host!: HTMLDivElement;
  let handle: CellHandle | null = null;
  let disposed = false;
  const owner = getOwner();

  onMount(() => {
    void mountWhenReady(host, allCellOptions(props)).then((mounted) => {
      if (disposed) {
        mounted.destroy();
        return;
      }
      handle = mounted;
      // Back under the component's owner, so the effect goes with it.
      runWithOwner(owner, () => createEffect(() => handle?.update(allCellOptions(props))));
    });
  });
  onCleanup(() => {
    disposed = true;
    handle?.destroy();
    handle = null;
  });

  return (
    <div ref={host} data-pynote-cell="">
      <pre data-pynote-source="">{props.code}</pre>
    </div>
  );
}
