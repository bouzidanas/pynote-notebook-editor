import { linter, type Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { type CompletionSource, autocompletion, type CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { hoverTooltip } from "@codemirror/view";
import { kernel } from "./pyodide";
import { EditorView } from "@codemirror/view";

// Unified theme for all tooltips (hover, lint diagnostics, autocomplete) to match dialog boxes
export const tooltipTheme = EditorView.theme({
    // Parent container for hover tooltips - apply background
    ".cm-tooltip-hover": {
        backgroundColor: "var(--background)"
    },
    // Hover tooltips (docstrings, help) - inherit base tooltip style with blue left border
    ".cm-tooltip-custom": {
        borderLeft: "5px solid #66d",
        maxHeight: "min(55vh, 520px)",
        maxWidth: "min(70vw, 720px)",
        overflow: "auto",
        overscrollBehavior: "contain",
        padding: "4px 8px",
        fontSize: "12px",
        backgroundColor: "color-mix(in srgb, var(--accent) 9%, transparent)"
    },
    ".cm-tooltip-header": {
        color: "#66d",
        fontWeight: "600",
        marginBottom: "6px",
        fontSize: "14px"
    },
    ".cm-tooltip-body": {
        color: "var(--color-secondary)",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap"
    },
    ".cm-tooltip-value": {
        borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 20%, transparent)",
        marginTop: "8px",
        paddingTop: "6px"
    },
    ".cm-tooltip-value-label": {
        color: "var(--color-secondary)",
        fontWeight: "600",
        marginBottom: "3px"
    },
    ".cm-tooltip-value-content": {
        color: "var(--color-secondary)",
        fontFamily: "var(--code-font-family)",
        lineHeight: "1.4",
        margin: "0",
        maxHeight: "240px",
        maxWidth: "min(70vw, 720px)",
        overflow: "auto",
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap"
    },

    // Lint/diagnostic tooltips (errors) - apply background
    ".cm-tooltip.cm-tooltip-lint": {
        backgroundColor: "var(--background)"
    },
    ".cm-diagnostic": {
        padding: "0",
        fontFamily: "var(--code-font-family)"
    },
    ".cm-diagnostic-error": {
        paddingLeft: "0",
        padding: "4px 8px",
        fontSize: "12px",
        backgroundColor: "color-mix(in srgb, var(--accent) 9%, transparent)"
    },

    // Autocomplete tooltips
    ".cm-tooltip-autocomplete": {
        backgroundColor: "var(--background)",
        border: "1px solid var(--color-foreground)",
        borderRadius: "8px",
        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.15), 0 4px 6px -4px rgb(0 0 0 / 0.15)",
        fontFamily: "var(--code-font-family)",
        zIndex: "9999"
    },
    ".cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--code-font-family) !important",
        fontSize: "0.90rem !important",
        padding: "0.3rem 0 !important",
    },
    ".cm-tooltip-autocomplete > ul > li": {
        padding: "0.2rem 0.5rem !important",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "color-mix(in srgb, var(--secondary) 25%, transparent)"
    },
    // Style completion section labels (function, property, variable)
    ".cm-tooltip.cm-tooltip-autocomplete > ul > completion-section": {
        fontFamily: "var(--code-font-family)",
        textTransform: "uppercase",
        fontSize: "0.77rem",
        color: "color-mix(in srgb, var(--color-secondary) 70%, transparent)",
        borderBottomColor: "var(--foreground)"
    },
    // Style completion icons
    ".cm-completionIcon": {
        color: "color-mix(in srgb, var(--color-secondary) 70%, transparent)"
    },
    // Colored completion items by type - synced with syntax highlighting theme
    ".cm-tooltip-autocomplete .completion-function .cm-completionLabel": {
        color: "var(--syntax-function) !important"
    },
    ".cm-tooltip-autocomplete .completion-callable .cm-completionLabel": {
        color: "var(--syntax-function) !important"
    },
    ".cm-tooltip-autocomplete .completion-class .cm-completionLabel": {
        color: "var(--syntax-property) !important"
    },
    ".cm-tooltip-autocomplete .completion-module .cm-completionLabel": {
        color: "var(--accent) !important"
    },
    ".cm-tooltip-autocomplete .completion-property .cm-completionLabel": {
        color: "var(--syntax-property) !important"
    },
    ".cm-tooltip-autocomplete .completion-variable .cm-completionLabel": {
        color: "var(--syntax-variable) !important"
    }
});

// Linter - always runs for syntax checking, optionally checks for duplicate variables in reactive mode
export const createPythonLinter = (checkRedefinitions?: (defs: any[]) => any[]) => linter(async (view) => {
    // Only lint if kernel is ready and not running
    if (kernel.status !== "ready") return [];

    try {
        // Always extract definitions for potential use (e.g., state sync or semantic checks)
        const result = await kernel.lint(view.state.doc.toString(), true);
        const docLineCount = view.state.doc.lines;

        const syntaxDiagnostics = result.diagnostics.map((d: any) => {
            // Ensure line is within bounds
            if (d.line > docLineCount) return null;

            const lineInfo = view.state.doc.line(d.line);
            const from = Math.min(lineInfo.from + d.col, lineInfo.to);
            const to = Math.min(from + 1, lineInfo.to); // Mark at least 1 char

            return {
                from,
                to,
                severity: "error",
                message: d.message
            } as Diagnostic;
        }).filter(Boolean) as Diagnostic[];

        const semanticDiagnostics: Diagnostic[] = [];
        // Check for duplicate variables in reactive mode (don't sync ownership - that happens on execution)
        if (syntaxDiagnostics.length === 0 && checkRedefinitions && result.definitions) {
            const conflicts = checkRedefinitions(result.definitions);
            conflicts.forEach(c => {
                if (c.line > docLineCount) return;
                const lineInfo = view.state.doc.line(c.line);
                const from = Math.min(lineInfo.from + c.col, lineInfo.to);
                const to = Math.min(from + c.name.length, lineInfo.to);

                semanticDiagnostics.push({
                    from,
                    to,
                    severity: "error",
                    message: `Variable '${c.name}' is already defined in another cell (Strict Reactive Mode)`
                });
            });
        }

        return [...syntaxDiagnostics, ...semanticDiagnostics];
    } catch (e) {
        return [];
    }
}, {
    delay: 500, // Debounce 500ms
    needsRefresh(update) {
        // Re-lint on any document change
        return update.docChanged;
    }
});

// Backward compatibility or default instance
export const pythonLinter = createPythonLinter();

// Autocomplete
const NO_COMPLETION_NODES = new Set(["Comment", "String", "FormatString", "Escape", "FormatSpec"]);

const pythonCompletionSource: CompletionSource = async (context) => {
    // No completions inside comments or string text. F-string text resolves to
    // FormatString, but code inside {} resolves to its own expression nodes,
    // so completions still work there.
    const nodeBefore = syntaxTree(context.state).resolveInner(context.pos, -1);
    if (NO_COMPLETION_NODES.has(nodeBefore.name)) return null;

    // Match word or dot sequence before cursor
    // This regex matches variable names and dotted paths like "np.array"
    const word = context.matchBefore(/[\w.]+/);

    // Don't show completions if no match found
    if (!word) return null;

    // Show completions if:
    // 1. Explicitly requested (Ctrl+Space) 
    // 2. Text was typed (word.from !== word.to)
    if (word.from === word.to && !context.explicit) return null;

    if (kernel.status !== "ready") return null;

    try {
        const options = await kernel.complete(context.state.doc.toString(), context.pos);
        if (!options || options.length === 0) return null;

        // Calculate the correct 'from' position
        // If we have "np.arr", we want to replace from after the dot (just "arr")
        // If we have "numpy", we want to replace the whole word
        let from = word.from;
        const lastDotIndex = word.text.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            // Member access: replace only the part after the dot
            from = word.from + lastDotIndex + 1;
        }

        return {
            from,
            options: options.map((o: any) => {
                const itemType = o.type || "variable";
                return {
                    label: o.label,
                    type: itemType,
                    apply: o.label,
                    // Add custom CSS class to the completion item's label
                    boost: 0,
                    section: itemType
                };
            })
        } as CompletionResult;
    } catch (e) {
        return null;
    }
};

export const pythonIntellisense = autocompletion({
    override: [pythonCompletionSource],
    activateOnTyping: true,
    closeOnBlur: true,
    defaultKeymap: false,  // Disable default keymap so we can customize
    // Custom option renderer to apply colors
    optionClass: (completion) => {
        return `completion-${completion.type || 'variable'}`;
    }
});

// Hover tooltip for documentation/help - don't show if there's an error at this position
export const pythonHover = hoverTooltip(async (view, pos, _side) => {
    const nodeAtPosition = syntaxTree(view.state).resolveInner(pos, -1);
    if (NO_COMPLETION_NODES.has(nodeAtPosition.name)) return null;

    // Check for "Kernel Busy" first
    if (kernel.status === "running") {
        return {
            pos,
            create() {
                const dom = document.createElement("div");
                dom.textContent = "Kernel is busy...";
                dom.className = "cm-tooltip-custom cm-tooltip-busy";
                return { dom };
            }
        };
    }

    if (kernel.status !== "ready") return null;

    // Don't show hover tooltip if there's a lint error at this specific position
    // This prevents overlap - error tooltips take precedence at positions with errors
    let hasErrorAtPos = false;
    forEachDiagnostic(view.state, (_d, from, to) => {
        if (pos >= from && pos <= to) {
            hasErrorAtPos = true;
        }
    });
    if (hasErrorAtPos) {
        return null;
    }

    try {
        const result = await kernel.inspect(view.state.doc.toString(), pos);

        if (!result || !result.found) return null;

        return {
            pos,
            create() {
                const dom = document.createElement("div");
                dom.className = "cm-tooltip-custom";

                const header = document.createElement("div");
                header.className = "cm-tooltip-header";
                header.textContent = result.name ? `${result.type} ${result.name}` : result.type;

                const body = document.createElement("div");
                body.className = "cm-tooltip-body";
                body.textContent = result.doc || "(No documentation)";

                dom.appendChild(header);
                dom.appendChild(body);

                if (result.value !== undefined) {
                    const valueSection = document.createElement("div");
                    valueSection.className = "cm-tooltip-value";

                    const valueLabel = document.createElement("div");
                    valueLabel.className = "cm-tooltip-value-label";
                    valueLabel.textContent = "Runtime value";

                    const valueContent = document.createElement("pre");
                    valueContent.className = "cm-tooltip-value-content";
                    valueContent.textContent = result.value;

                    valueSection.appendChild(valueLabel);
                    valueSection.appendChild(valueContent);
                    dom.appendChild(valueSection);
                }

                return { dom };
            }
        };
    } catch (e) {
        return null;
    }
});
