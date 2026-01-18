import { type Component, For, Show } from "solid-js";
import { type CellData } from "../lib/store";

interface OutputProps {
  outputs: CellData["outputs"];
}

const Output: Component<OutputProps> = (props) => {
  const hasContent = () => {
    const o = props.outputs;
    return o && (
      (o.stdout && o.stdout.length > 0) ||
      (o.stderr && o.stderr.length > 0) ||
      o.error ||
      o.result
    );
  };

  return (
    <Show when={hasContent()}>
      <div class="flex flex-col gap-1 font-mono text-sm mt-2 p-2 rounded-b-[var(--radius-sm)] border-t border-foreground max-h-[500px] overflow-y-auto">
        <Show when={props.outputs}>
          <For each={props.outputs?.stdout}>
            {(line) => <div class="text-secondary whitespace-pre-wrap">{line}</div>}
          </For>
          <For each={props.outputs?.stderr}>
            {(line) => <div class="text-primary whitespace-pre-wrap bg-primary/10 p-1 rounded-sm">{line}</div>}
          </For>
          <Show when={props.outputs?.error}>
            <div class="text-primary whitespace-pre-wrap font-bold bg-primary/20 p-2 rounded-sm">
              {props.outputs?.error}
            </div>
          </Show>
          <Show when={props.outputs?.result}>
            <div class="flex">
              <div class="w-9.5 bg-background border-r border-foreground flex flex-col items-center pt-5.25 text-sm text-foreground font-extrabold select-none font-mono">Out:</div>
              <div class="text-secondary/80 whitespace-pre-wrap border-l-4 border-foreground pt-5 p-4">
                {props.outputs?.result}
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
};

export default Output;
