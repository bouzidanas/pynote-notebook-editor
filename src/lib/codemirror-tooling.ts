import { linter, type Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { type CompletionSource, autocompletion } from "@codemirror/autocomplete";
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
        lineHeight: "1.5",
        whiteSpace: "pre-wrap"
    },

    // Lint/diagnostic tooltips (errors) - apply background
    ".cm-tooltip.cm-tooltip-lint": {
        backgroundColor: "var(--background)"
    },
    ".cm-diagnostic": {
        padding: "0",
        fontFamily: "var(--font-mono)"
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
        fontFamily: "var(--font-mono)",
        zIndex: "250"
    },
    ".cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--font-mono)"
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--background)"
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
const pythonCompletionSource: CompletionSource = async (context) => {
    // Match word or dot sequence before cursor
    const word = context.matchBefore(/[\w.]*/);

    if (!word || (word.from === word.to && !context.explicit)) return null;

    if (kernel.status !== "ready") return null;

    try {
        const options = await kernel.complete(context.state.doc.toString(), context.pos);
        if (!options || options.length === 0) return null;

        return {
            from: word.from,
            options: options.map((o: any) => ({
                label: o.label,
                type: o.type,
                apply: o.label
            }))
        };
    } catch (e) {
        return null;
    }
};

export const pythonIntellisense = autocompletion({ override: [pythonCompletionSource] });

// Hover tooltip for documentation/help - don't show if there's an error at this position
export const pythonHover = hoverTooltip(async (view, pos, _side) => {
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
                header.textContent = result.type;

                const body = document.createElement("div");
                body.className = "cm-tooltip-body";
                body.textContent = result.doc || "(No documentation)";

                dom.appendChild(header);
                dom.appendChild(body);

                return { dom };
            }
        };
    } catch (e) {
        return null;
    }
});
