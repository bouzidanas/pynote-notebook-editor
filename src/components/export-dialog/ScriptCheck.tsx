import { type Component, Match, Show, Switch } from "solid-js";
import type { ScriptCheckResult } from "../../lib/export/script-check";
import type { ScriptInfo } from "../../lib/export/text-exports";
import { TESTID } from "../../lib/testids";
import { Notice, SectionTitle } from "./controls";

// The script check of the Python and Python + Markdown exports: does the
// exported script run top to bottom, and which cells did it move to get there?

export type CheckState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running" }
  | { status: "unavailable"; message: string }
  | { status: "done"; result: ScriptCheckResult };

/** "2", "2 and 3", "2, 3 and 5". */
export const listText = (items: readonly (string | number)[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// " in 40 ms", " in 1.2 s"; nothing for an instant check.
const durationText = (ms: number) => (ms < 10 ? "" : ms < 1000 ? ` in ${ms} ms` : ` in ${(ms / 1000).toFixed(1)} s`);

const ScriptCheck: Component<{
  check: CheckState;
  /** The script being checked, once the cell order is known. */
  script: ScriptInfo | undefined;
  codeCellCount: number;
  /** A cell's number in the notebook (1-based), for messages. */
  cellNumber: (id: string) => number;
}> = (props) => {
  const result = () => (props.check.status === "done" ? props.check.result : null);
  const moved = () => props.script?.result.moved.map(props.cellNumber).sort((a, b) => a - b) ?? [];

  return (
    <div class="mt-5" data-testid={TESTID.exportScriptCheck} data-status={result()?.status ?? props.check.status}>
      <SectionTitle class="px-2">Script check</SectionTitle>
      <Show when={props.codeCellCount === 0}>
        <Notice tone="info">The notebook has no code cells.</Notice>
      </Show>
      <Switch>
        <Match when={props.check.status === "starting"}>
          <Notice tone="progress">Starting Python to check the script…</Notice>
        </Match>
        <Match when={props.check.status === "running"}>
          <Notice tone="progress">Checking that the script runs top to bottom…</Notice>
        </Match>
        <Match when={props.check.status === "unavailable" && props.check}>
          {(state) => <Notice tone="warning">Could not check the script: {state().message}</Notice>}
        </Match>
        <Match when={result()}>
          {(result) => (
            <Switch>
              <Match when={result().status === "passed"}>
                <Notice tone="success">Runs top to bottom without errors{durationText(result().durationMs)}.</Notice>
              </Match>
              <Match when={result().status === "failed"}>
                <Notice tone="error">
                  <span>
                    Stops with an error{result().cellId ? ` in cell ${props.cellNumber(result().cellId!)}` : ""}:{" "}
                    <span class="font-mono">{result().message?.trim().split("\n").pop()}</span>
                  </span>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-secondary/60">Traceback</summary>
                    <pre class="mt-1 font-mono text-[11px] whitespace-pre-wrap text-secondary/70">{result().message}</pre>
                  </details>
                </Notice>
              </Match>
              <Match when={result().status === "timeout" || result().status === "error"}>
                <Notice tone="warning">{result().message}</Notice>
              </Match>
            </Switch>
          )}
        </Match>
      </Switch>
      <Show when={result() && result()!.pynoteOnlyImports.length > 0}>
        <Notice tone="warning">
          Imports {result()!.pynoteOnlyImports.join(", ")}, which only exist inside PyNote. The script runs here, but not with a regular Python.
        </Notice>
      </Show>
      <Show when={moved().length > 0}>
        <Notice tone="info">
          The script runs {moved().length === 1 ? `cell ${moved()[0]}` : `cells ${listText(moved())}`} in a different order than the notebook, so every name is defined before it is used (as reactive mode runs them).
        </Notice>
      </Show>
      <Show when={props.script?.result.orderNote}>
        {(note) => (
          <Notice tone="warning">
            {note() === "cycle"
              ? "Some cells depend on each other in a cycle, so the script keeps the notebook's order."
              : `Some names are defined in more than one cell (${props.script!.result.duplicateDefinitions.map((d) => `${d.name} in cells ${listText(d.cellIds.map(props.cellNumber))}`).join("; ")}), so the script keeps the notebook's order.`}
          </Notice>
        )}
      </Show>
    </div>
  );
};

export default ScriptCheck;
