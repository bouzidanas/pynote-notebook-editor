import { type Component, For, Show } from "solid-js";
import { type CellData } from "../lib/store";
import UIOutputRenderer from "./ui-renderer/UIOutputRenderer";

interface OutputProps {
  outputs: CellData["outputs"];
}

export const OutputStdoutUI: Component<OutputProps> = (props) => {
  const hasContent = () => {
    const o = props.outputs;
    return o && (
      (o.stdout && o.stdout.length > 0) ||
      (o.mimebundle && o.mimebundle['application/vnd.pynote.ui+json'])
    );
  };

  return (
    <Show when={hasContent()}>
      <div class="first:pb-4 flex flex-col gap-5 font-mono text-sm p-2 pl-1.25 border-foreground max-h-125 overflow-y-auto">
          <Show when={props.outputs?.stdout && props.outputs.stdout.length > 0}>
            <div class="text-secondary whitespace-pre-wrap">{props.outputs?.stdout.join("")}</div>
          </Show>
          <Show when={props.outputs?.mimebundle && props.outputs.mimebundle['application/vnd.pynote.ui+json']}>
            <div class="flex w-full">
               <div class="w-full">
                 <UIOutputRenderer data={props.outputs?.mimebundle['application/vnd.pynote.ui+json']} />
               </div>
            </div>
          </Show>
      </div>
    </Show>
  );
};

export const OutputStderr: Component<OutputProps> = (props) => {
  return (
    <Show when={props.outputs?.stderr && props.outputs.stderr.length > 0}>
      <div class="flex flex-col gap-0 font-mono text-sm px-2 pb-2 pt-0 pl-1 border-foreground max-h-60 overflow-y-auto">
          <For each={props.outputs?.stderr}>
            {(line) => <div class="text-primary whitespace-pre-wrap bg-primary/10 p-1 rounded-sm">{line}</div>}
          </For>
      </div>
    </Show>
  );
};

export const OutputError: Component<OutputProps> = (props) => {
  return (
    <Show when={props.outputs?.error}>
      <div class="flex flex-col gap-1 font-mono text-sm p-2 pl-1 border-foreground">
            <div class="text-primary whitespace-pre-wrap font-bold bg-primary/20 p-2 rounded-sm">
              {props.outputs?.error}
            </div>
      </div>
    </Show>
  );
};

export const OutputResult: Component<OutputProps> = (props) => {
  return (
    <Show when={props.outputs?.result}>
      <div class="flex flex-col gap-1 font-mono text-sm p-2 pl-1 border-foreground">
            <div class="flex w-full">
              <div class="w-10 bg-background border-r border-foreground flex flex-col items-center pt-5.25 text-sm text-foreground font-extrabold select-none font-mono">Out:</div>
              <div class="flex-1 text-secondary/80 whitespace-pre-wrap border-l-4 border-foreground bg-accent/5 pt-5 p-4">
                {props.outputs?.result}
              </div>
            </div>
      </div>
    </Show>
  );
};
