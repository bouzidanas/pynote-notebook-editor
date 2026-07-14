import { type Component, For } from "solid-js";
import clsx from "clsx";
import { currentTheme } from "../../lib/theme";
import { highlightPython } from "../../lib/syntax-highlighter";
import { useThemeDialog } from "./context";

// Right panel: live preview of the themed markdown cell.
const PreviewPane: Component = () => {
  const { previewCellState, setPreviewCellState, previewBorder, previewShadow } = useThemeDialog();

  return (
    <>
          {/* Right Panel - Preview */}
          <div class="flex-1 max-lg:h-[24%] shrink-2 min-h-0 p-4 overflow-y-auto space-y-4" style={{
            "font-family": currentTheme.font,
            "background-color": currentTheme.colors.background,
            "color": currentTheme.colors.secondary,
            "--preview-primary": currentTheme.colors.primary,
            "--preview-secondary": currentTheme.colors.secondary,
            "--preview-accent": currentTheme.colors.accent,
            "--preview-background": currentTheme.colors.background,
            "--preview-foreground": currentTheme.colors.foreground,
          }}>
            <h3 class="text-xs font-bold uppercase mb-2" style={{ color: currentTheme.colors.accent }}>Preview</h3>

            {/* Cell state selector. Previews each border/shadow state */}
            <div class="flex items-center gap-1">
              <For each={["default", "hover", "select", "edit"] as const}>
                {(state) => (
                  <button
                    type="button"
                    onClick={() => setPreviewCellState(state)}
                    class={clsx(
                      "px-2 py-1 text-[10px] font-bold uppercase rounded-sm border-[length:var(--ui-border-width,1px)] transition-colors",
                      previewCellState() === state
                        ? "bg-accent text-background border-accent"
                        : "text-secondary/70 ui-border-color hover:border-secondary/50"
                    )}
                  >
                    {state}
                  </button>
                )}
              </For>
            </div>

            {/* Markdown Cell Preview */}
            <div
              class="p-3 space-y-3"
              style={{
                border: previewBorder(),
                "box-shadow": previewShadow(),
                "border-radius": currentTheme.cellBorder.radius || currentTheme.radii.sm,
                "line-height": currentTheme.spacing.line,
              }}
            >
              <h1 style={{
                color: currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 3 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 1
              </h1>
              <h2 style={{
                color: currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 2 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 2
              </h2>
              <p style={{
                color: currentTheme.colors.secondary,
                "font-size": currentTheme.typography.fontSize,
                "margin-bottom": currentTheme.spacing.block,
              }}>
                This is a <strong style={{ color: currentTheme.sectionScoping ? (currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary) : currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary }}>markdown</strong> paragraph with <em>styled text</em> and a <span style={{
                  color: currentTheme.sectionScoping ? (currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary) : currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary,
                  "text-decoration": "underline",
                  "text-underline-offset": "3px"
                }}>link</span>.
              </p>
              <h3 style={{
                color: currentTheme.typography.headerColors?.[2] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 1 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 3
              </h3>
              <h4 style={{
                color: currentTheme.typography.headerColors?.[3] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 0 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 4
              </h4>
              <pre
                style={{
                  "background-color": currentTheme.colors.foreground,
                  padding: "0.75rem",
                  "border-radius": currentTheme.radii.sm,
                  "font-size": "0.875rem",
                }}
              >
                <code innerHTML={highlightPython('print("Hello!")')} />
              </pre>
            </div>
          </div>
    </>
  );
};

export default PreviewPane;
