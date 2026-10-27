import { type Component, Show } from "solid-js";
import type { WebAppOptions } from "../../lib/export/web-app-export";
import { CheckRow, Notice, Segmented } from "./controls";

// Settings of the web app export. Each choice says what it means for the
// page, so the panel reads as a description of what will be written.

const WebAppSettings: Component<{
  options: WebAppOptions;
  onChange: (next: WebAppOptions) => void;
}> = (props) => {
  const set = (patch: Partial<WebAppOptions>) => props.onChange({ ...props.options, ...patch });
  const staticHtml = () => props.options.mode === "readonly" && props.options.staticHtml;

  return (
    <div class="space-y-2">
      <Segmented
        label="Mode"
        value={props.options.mode}
        options={[{ value: "interactive", label: "Interactive" }, { value: "readonly", label: "Read-only" }]}
        onChange={(mode) => set({ mode })}
        hint={
          props.options.mode === "interactive"
            ? "Readers can edit and run cells and use widgets. Their changes stay in their browser; Options › Reset Notebook brings back the exported version."
            : "Rendered text and current outputs, in presentation mode. Nothing can be edited or run; charts stay explorable."
        }
      />

      <Show
        when={props.options.mode === "interactive"}
        fallback={
          <>
            <CheckRow
              label="Static (no JavaScript)"
              hint="Plain HTML and CSS. Nothing runs, and charts and widgets show their current state."
              checked={props.options.staticHtml}
              onChange={(v) => set({ staticHtml: v })}
            />
            <Notice tone="info">Outputs are shown as they are now. Run the cells you want to show first.</Notice>
          </>
        }
      >
        <CheckRow
          label="Open in presentation mode"
          hint="Readers can still leave it to edit and run cells."
          checked={props.options.startInPresentation}
          onChange={(v) => set({ startInPresentation: v })}
        />
        <Segmented
          label="Python"
          value={props.options.python}
          options={[{ value: "embedded", label: "Included (offline)" }, { value: "cdn", label: "From CDN" }]}
          onChange={(python) => set({ python })}
          hint={
            props.options.python === "embedded"
              ? "Runs offline. Adds about 10 MB plus the packages this notebook imports; any other package downloads when the reader is online."
              : "Downloaded from jsDelivr when the page opens, so readers need the internet."
          }
        />
      </Show>

      <Show when={!staticHtml()}>
        <Segmented
          label="Files"
          value={props.options.layout}
          options={[{ value: "single", label: "Single file" }, { value: "folder", label: "Folder" }]}
          onChange={(layout) => set({ layout })}
          hint={
            props.options.layout === "single"
              ? "One HTML file. Opens with a double click, from disk or any web host."
              : "index.html with its files next to it. Opens from disk, or copy the folder to any static web host."
          }
        />
      </Show>
    </div>
  );
};

export default WebAppSettings;
