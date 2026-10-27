import { type Component, type JSX, Show, createMemo, createSignal } from "solid-js";
import { Check, Copy } from "lucide-solid";
import { TESTID } from "../../lib/testids";

// The Preview tab: exactly the text an export writes, with a copy button.
// Very long files show their first lines; the export has them all.

const PREVIEW_LINES = 2000;

export const copyText = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false; // clipboard access denied; the text stays selectable
  }
};

const PreviewPane: Component<{
  text: string;
  /** Controls above the text: which file, the setup command. */
  head?: JSX.Element;
}> = (props) => {
  const lines = createMemo(() => props.text.split("\n"));
  const shown = () => lines().slice(0, PREVIEW_LINES).join("\n");
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    if (!(await copyText(props.text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div class="flex flex-col flex-1 min-h-0">
      <Show when={props.head}>
        <div class="mb-2 space-y-2">{props.head}</div>
      </Show>
      <div class="relative flex-1 min-h-0 max-lg:flex-none max-lg:h-[60vh] ui-border rounded-sm bg-background">
        <button
          type="button"
          class="absolute top-2 right-2 z-10 p-1.5 rounded-sm bg-background/90 text-secondary/50 hover:text-accent"
          title={copied() ? "Copied" : "Copy"}
          aria-label="Copy preview"
          onClick={() => void copy()}
        >
          <Show when={copied()} fallback={<Copy size={14} />}>
            <Check size={14} />
          </Show>
        </button>
        <pre class="h-full overflow-auto p-3 font-mono text-xs leading-relaxed text-secondary whitespace-pre" data-testid={TESTID.exportPreview}>{shown()}</pre>
      </div>
      <Show when={lines().length > PREVIEW_LINES}>
        <p class="text-xs text-secondary/50 mt-1">
          Preview shows the first {PREVIEW_LINES.toLocaleString()} of {lines().length.toLocaleString()} lines; the export has them all.
        </p>
      </Show>
    </div>
  );
};

export default PreviewPane;
