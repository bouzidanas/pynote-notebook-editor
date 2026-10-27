// The build puts "use client" at the top of dist/react.js (a directive in the
// source would be dropped by the bundler), so Next.js keeps it on the client.
import { createElement, useEffect, useRef, type ReactElement } from "react";
import { allCellOptions, configure, mountWhenReady } from "./bridge";
import type { CellHandle, CellOptions } from "./types";

// <PyNoteCell> for React (Next.js, Vite, Remix...). On the server and before
// hydration it renders the code as plain text; in the browser the live cell
// takes over the same element (in its shadow root). The runtime loads on the
// first mount, never on the server. All cells on a page are one notebook.

export { configure };
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig } from "./types";

export function PyNoteCell(props: CellOptions): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<CellHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    let cancelled = false;
    void mountWhenReady(host.current!, allCellOptions(latest.current)).then((mounted) => {
      if (cancelled) {
        mounted.destroy();
        return;
      }
      handle.current = mounted;
      mounted.update(allCellOptions(latest.current)); // props that changed while the runtime loaded
    });
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.update(allCellOptions(props));
  });

  return createElement(
    "div",
    { ref: host, "data-pynote-cell": "" },
    createElement("pre", { "data-pynote-source": "" }, props.code),
  );
}
