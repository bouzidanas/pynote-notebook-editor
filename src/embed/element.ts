import { configure, mountWhenReady } from "./bridge";
import type { CellHandle, CellOptions, PyNoteConfig } from "./types";

// <pynote-cell>: a cell for any page (Astro, MDX, plain HTML). The code comes
// from the `code` attribute, or from a child <script type="text/x-python"> or
// <pre data-pynote-source> (HTML that is not parsed as markup, unlike plain
// text in the element). Page-wide settings come from configure() or a
// <script type="application/json" data-pynote-config> element.
//
// Importing this module defines the element and nothing else; the runtime
// loads when the first cell connects.

export { configure };
export type { CellOptions, PyNoteConfig };

/** Remove the indentation and blank edge lines code picks up inside HTML. */
export function dedent(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim() !== "").map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(common)).join("\n");
}

/**
 * Each option the element takes as an attribute (besides `code` and
 * `cell-id`): the option's name in kebab case. <PyNoteCell> for Astro writes
 * its props as these.
 */
export const BOOLEAN_ATTRIBUTES = {
  editable: "editable",
  menu: "menu",
  autorun: "autorun",
  "show-code": "showCode",
  "show-stdout": "showStdout",
  "show-stderr": "showStderr",
  "show-result": "showResult",
  "show-error": "showError",
  "show-status-dot": "showStatusDot",
  "visibility-toggle": "visibilityToggle",
} as const;

// A present attribute is true unless it says "false".
const flag = (element: Element, name: string): boolean | undefined => {
  const value = element.getAttribute(name);
  return value === null ? undefined : value !== "false";
};

/** The cell's options, every one named: an attribute that is not there reads as undefined (the default). */
export function cellOptions(element: Element): CellOptions {
  const source = element.querySelector(':scope > script[type="text/x-python"], :scope > pre[data-pynote-source]');
  const attribute = element.getAttribute("code");
  const options: CellOptions = {
    code: attribute ?? dedent(source?.textContent ?? ""),
    id: element.getAttribute("cell-id") || undefined,
  };
  for (const [name, key] of Object.entries(BOOLEAN_ATTRIBUTES)) options[key] = flag(element, name);
  return options;
}

/** Apply every <script type="application/json" data-pynote-config> on the page. */
export function readPageConfig(root: ParentNode = document): void {
  for (const script of root.querySelectorAll('script[type="application/json"][data-pynote-config]')) {
    try {
      configure(JSON.parse(script.textContent ?? "{}") as PyNoteConfig);
    } catch (error) {
      console.error("pynote: invalid data-pynote-config", error);
    }
  }
}

if (typeof window !== "undefined" && typeof customElements !== "undefined" && !customElements.get("pynote-cell")) {
  class PyNoteCellElement extends HTMLElement {
    static observedAttributes = ["code", ...Object.keys(BOOLEAN_ATTRIBUTES)];
    private handle: CellHandle | null = null;
    private mounting = false;

    connectedCallback() {
      // Moved on the page: the cell stays (code, outputs, Python state) and
      // takes its new place in the notebook.
      if (this.handle) {
        this.handle.update(cellOptions(this));
        return;
      }
      if (this.mounting) return;
      this.mounting = true;
      void mountWhenReady(this, cellOptions(this)).then(
        (handle) => {
          this.mounting = false;
          if (!this.isConnected) {
            handle.destroy();
            return;
          }
          this.handle = handle;
          // Attributes set while the runtime loaded (an element added, then given its code).
          handle.update(cellOptions(this));
        },
        (error) => {
          this.mounting = false;
          console.error("pynote: could not start the cell", error);
        },
      );
    }

    disconnectedCallback() {
      // A move disconnects the element and connects it again at once: the
      // cell goes only if the element is still out of the page after that.
      queueMicrotask(() => {
        if (this.isConnected) return;
        this.handle?.destroy();
        this.handle = null;
      });
    }

    attributeChangedCallback() {
      this.handle?.update(cellOptions(this));
    }
  }
  readPageConfig();
  customElements.define("pynote-cell", PyNoteCellElement);
}
