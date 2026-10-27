import { type Component, Match, Show, Switch } from "solid-js";
import type { TextFormat, TextOptions } from "../../lib/export/text-exports";
import { CheckRow, Notice } from "./controls";

// Settings of the text formats: .pynote, .ipynb, .py, .md and the pair.

const TextSettings: Component<{
  format: TextFormat;
  options: TextOptions;
  onChange: (next: TextOptions) => void;
}> = (props) => {
  const set = (patch: Partial<TextOptions>) => props.onChange({ ...props.options, ...patch });

  return (
    <Switch>
      <Match when={props.format === "pynote"}>
        <Notice tone="info">Nothing to set: the file keeps the whole notebook, PyNote's settings included.</Notice>
      </Match>

      <Match when={props.format === "ipynb"}>
        <CheckRow
          label="Clean copy"
          hint="Leave out PyNote's settings (theme, view and history). The cells and other tools' metadata stay."
          checked={props.options.ipynbClean}
          onChange={(v) => set({ ipynbClean: v })}
        />
      </Match>

      <Match when={props.format === "python"}>
        <CheckRow
          label="Include markdown as comments"
          hint="Markdown and raw cells become comment blocks in their place."
          checked={props.options.pythonMarkdown}
          onChange={(v) => set({ pythonMarkdown: v })}
        />
        <Show when={!props.options.pythonMarkdown}>
          <Notice tone="warning">The script will have only the code. The notebook's text cannot be recovered from it.</Notice>
        </Show>
      </Match>

      <Match when={props.format === "markdown"}>
        <CheckRow
          label="Include code"
          hint="Code cells become fenced Python code blocks."
          checked={props.options.markdownCode}
          onChange={(v) => set({ markdownCode: v })}
        />
        <Show when={!props.options.markdownCode}>
          <Notice tone="warning">The document will have only the text. The notebook's code cannot be recovered from it.</Notice>
        </Show>
      </Match>

      <Match when={props.format === "pair"}>
        <Notice tone="info">Both files keep each cell's id, and the document marks where each code cell goes. PyNote settings (theme, view) are not included.</Notice>
      </Match>
    </Switch>
  );
};

export default TextSettings;
