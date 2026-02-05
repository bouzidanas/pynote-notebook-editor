import { type Component, createEffect, onCleanup, onMount, createMemo } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { python } from "@codemirror/lang-python";
import { duotoneDarkInit } from "@uiw/codemirror-theme-duotone";
import { EditorView, keymap, placeholder, lineNumbers, drawSelection, Decoration } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, historyField, indentWithTab, undoDepth, redoDepth, undo, redo, toggleComment } from "@codemirror/commands";
import { EditorState, StateField, Range, RangeSet, EditorSelection } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { bracketMatching } from "@codemirror/language";
import { closeBrackets, acceptCompletion, startCompletion, closeCompletion, moveCompletionSelection } from "@codemirror/autocomplete";
import { search, searchKeymap, SearchCursor, closeSearchPanel } from "@codemirror/search";
import { currentTheme } from "../lib/theme";
import { type CellData, actions, APP_QUICK_EDIT_MODE } from "../lib/store";
import { createPythonLinter, pythonIntellisense, pythonHover, tooltipTheme } from "../lib/codemirror-tooling";
import { codeVisibility } from "../lib/codeVisibility";

// Create custom duotoneDark theme with function color from theme
// Using duotoneDarkInit() with custom styles is the most efficient approach -
// single-pass highlighting with our color baked into the theme
const getCustomDuotoneDark = (functionColor: string) => duotoneDarkInit({
  styles: [
    { tag: tags.function(tags.variableName), color: functionColor },
  ]
});

// Note: Code Mirror has a built-in search command called 'selectNextOccurrence' 
// but does not have a version that selects previous occurrences. The following
// is very similar to the built-in command but the difference is that it searches

// Select previous occurrence - reverse direction of selectNextOccurrence
// Finds previous occurrence of selected text before the first selection
function selectPreviousOccurrence(view: EditorView): boolean {
  const { state } = view;
  const { ranges } = state.selection;
  
  // If any selection is empty, expand to word first (same as selectNextOccurrence)
  if (ranges.some(sel => sel.from === sel.to)) {
    // Expand to word
    let newRanges = ranges.map(range => {
      const word = state.wordAt(range.head);
      return word ? EditorSelection.range(word.from, word.to) : EditorSelection.cursor(range.head);
    });
    const newSel = EditorSelection.create(newRanges, state.selection.mainIndex);
    if (newSel.eq(state.selection)) return false;
    view.dispatch(state.update({ selection: newSel }));
    return true;
  }

  // Get the search text from first selection
  const searchedText = state.sliceDoc(ranges[0].from, ranges[0].to);
  
  // Verify all selections have the same text
  if (ranges.some(r => state.sliceDoc(r.from, r.to) !== searchedText)) {
    return false;
  }

  // This finds the earliest position among all selections
  // We need this to know where to start searching backward from
  const earliestFrom = Math.min(...ranges.map(r => r.from));
  
  // Search backward in chunks (mimicking prevMatchInRange from CodeMirror)
  let foundRange: { from: number; to: number } | null = null;
  const chunkSize = 10000;
  
  for (let pos = earliestFrom;;) {
    // Define chunk to search for matches
    const start = Math.max(0, pos - chunkSize - searchedText.length);
    const cursor = new SearchCursor(state.doc, searchedText, start, pos);
    let lastMatch: { from: number; to: number } | null = null;
    
    // Find the last match in this chunk
    // Logic: Loop through all matches and store them in the same variable overwriting the previous one stored
    //        After the loop, the variable will contain the last match found because it will be the last to overwrite
    while (!cursor.next().done) {
      lastMatch = cursor.value;
    }
    
    // If a match was found, store it in foundRange and exit the loop
    if (lastMatch) {
      foundRange = lastMatch;
      break;
    }
    
    if (start === 0) {
      // Wrap around to end of document
      const docEnd = state.doc.length;
      const wrapStart = Math.max(0, docEnd - chunkSize - searchedText.length);
      const wrapCursor = new SearchCursor(state.doc, searchedText, wrapStart, docEnd);
      let wrapMatch: { from: number; to: number } | null = null;
      
      while (!wrapCursor.next().done) {
        const match = wrapCursor.value;
        // Skip if this match overlaps with any existing selection
        if (!ranges.some(r => match.from < r.to && match.to > r.from)) {
          wrapMatch = match;
        }
      }
      
      foundRange = wrapMatch;
      break;
    }
    
    pos -= chunkSize;
  }

  if (!foundRange) return false;

  // Add foundRange to selections and scroll into view
  view.dispatch(state.update({
    selection: state.selection.addRange(
      EditorSelection.range(foundRange.from, foundRange.to),
      false
    ),
    effects: EditorView.scrollIntoView(foundRange.from)
  }));
  
  return true;
}

// Smart selection matching - handles multi-select properly
// when multiple selections exist, only match based on the main (first) selection.
// - This prevents trying to match concatenated text during Ctrl+D operations.
// - This allows both multi-select and match highlighting to work together smoothly.
// - This aims to replace the highlightSelectionMatches extension.
// - This extension highlights all other occurrences of the selected text,
//   but is designed to still work when the selection contains multiple 
//   occurrences of the same selected text. Instead of trying to find matches
//   for the whole concatenated selection, it only matches based on the main selection.
function smartSelectionMatches() {
  const decorationMark = Decoration.mark({ class: "cm-selectionMatch" });
  
  return StateField.define<RangeSet<Decoration>>({
    create() {
      return Decoration.none;
    },
    update(_decorations, tr) {
      const state = tr.state;
      const selection = state.selection;
      
      // Only proceed if there's a non-empty selection
      if (selection.main.empty) {
        return Decoration.none;
      }
      
      // Get text from main selection
      const mainText = state.sliceDoc(selection.main.from, selection.main.to);
      
      // Only match if selection is long enough (at least 1 char)
      if (mainText.length === 0) {
        return Decoration.none;
      }
      
      // When multiple ranges exist, check if they all contain the same text
      // If not, don't highlight matches (prevents matching "wordword" when you have two "word" selections)
      if (selection.ranges.length > 1) {
        const allSame = selection.ranges.every(range => {
          if (range.empty) return false;
          const text = state.sliceDoc(range.from, range.to);
          return text === mainText;
        });
        
        if (!allSame) {
          return Decoration.none;
        }
      }
      
      // Find all matches in the document
      const decorationRanges: Range<Decoration>[] = [];
      const cursor = new SearchCursor(state.doc, mainText);
      
      while (!cursor.next().done) {
        const { from, to } = cursor.value;
        
        // Skip if this match overlaps with any selection range
        const overlapsSelection = selection.ranges.some(range => 
          (from >= range.from && from < range.to) || (to > range.from && to <= range.to)
        );
        
        if (!overlapsSelection) {
          decorationRanges.push(decorationMark.range(from, to));
        }
      }
      
      return Decoration.set(decorationRanges, true);
    },
    provide: f => EditorView.decorations.from(f)
  });
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  class?: string;
  readOnly?: boolean;
  cell: CellData; // Add cell prop to access stored state
  placeholderText?: string;
  checkRedefinitions?: (definitions: any[]) => any[];
  onClick?: () => void;
  onBlur?: () => void;
  isActive?: boolean; // For respecting quick edit mode toggle
}

const CodeEditor: Component<EditorProps> = (props) => {
  const { ref, createExtension, editorView } = createCodeMirror({
    onValueChange: props.onChange,
    value: props.value,
  });

  // Handle clicks on readonly editor - only when quick edit mode is ON
  // This works around bracket matching intercepting clicks and preventing edit mode
  // When quick edit is OFF, the original two-click behavior works fine without this
  createEffect(() => {
    const view = editorView();
    // Only add listener when quick edit is enabled
    if (view && props.onClick && APP_QUICK_EDIT_MODE) {
      const handler = () => {
        if (props.readOnly) {
          // Quick edit ON: activate + enter edit mode in one click
          actions.setActiveCell(props.cell.id);
          props.onClick?.();
          // Explicitly focus the editor to ensure edit mode fully activates
          // This works around bracket matching intercepting the click
          setTimeout(() => {
            view.focus();
          }, 0);
        }
      };
      // Use mousedown in capture phase to run before bracket matching
      view.dom.addEventListener('mousedown', handler, true);
      onCleanup(() => view.dom.removeEventListener('mousedown', handler, true));
    }
  });

  // Exit edit mode when clicking outside the editor
  // Uses document mousedown listener (only when cell is in edit mode) to detect clicks
  // outside the editor boundaries. This reliably exits edit mode and closes the search panel
  // when clicking cell background, output, or other cells.
  // Note: The search panel is the only panel in this editor that needs explicit closing.
  // Other UI elements (autocomplete, tooltips, lint diagnostics) automatically dismiss on outside clicks.
  // Only ONE document listener exists at any time (from whichever cell is actively editing).
  // The listener is automatically removed when the cell exits edit mode via onCleanup.
  createEffect(() => {
    const view = editorView();
    // Only attach listener when in edit mode (not readonly)
    if (view && props.onBlur && !props.readOnly) {
      const mousedownHandler = (e: MouseEvent) => {
        const target = e.target as Node;
        const isInsideEditor = view.dom.contains(target);
        
        // If clicked outside the editor, close search panel and exit edit mode
        if (!isInsideEditor) {
          closeSearchPanel(view);
          props.onBlur?.();
        }
      };
      
      // Attach to document but only when this cell is in edit mode
      document.addEventListener('mousedown', mousedownHandler, true);
      
      onCleanup(() => {
        document.removeEventListener('mousedown', mousedownHandler, true);
      });
    }
  });

  // Conditionally add placeholder only when readOnly (not editing)
  createExtension(createMemo(() => {
    if (props.readOnly && props.placeholderText) {
      return [
        placeholder(props.placeholderText),
        EditorView.theme({
          "& .cm-placeholder": {
            color: "var(--color-foreground)"
          }
        })
      ];
    }
    return [];
  }));

  // Synchronize external content changes (e.g. from store updates not initiated by user typing)
  // This is a bug fix for "One-way binding". It ensures features like Find/Replace, Formatting, 
  // or stress tests can update the editor programmatically.
  createEffect(() => {
    const view = editorView();
    // We strictly track props.value to catch programmatic updates
    const currentValue = props.value; 
    
    if (view) {
      const doc = view.state.doc;
      // Optimization: Check length first (O(1)) to avoid expensive toString() (O(N)) on every keystroke.
      // Note: External updates that change content but NOT length (e.g. uppercasing) will still incur 
      // the O(N) cost of toString() checking.
      if (doc.length !== currentValue.length || doc.toString() !== currentValue) {
        view.dispatch({
          changes: { from: 0, to: doc.length, insert: currentValue }
        });
      }
    }
  });

  // Store extensions configuration for state restoration
  let extensionsConfig: any[] = [];

  // Restore editor state when component mounts (entering edit mode)
  onMount(() => {
    const savedState = props.cell.editorState;
    const view = editorView();
    
    if (savedState && view && extensionsConfig.length > 0) {
      try {
        // Restore state from JSON using CodeMirror's fromJSON
        // This restores the history that corresponds to the current content
        const restoredState = EditorState.fromJSON(
          savedState,
          {
            doc: props.value, // Always use current content from props
            extensions: extensionsConfig,
          }
        );
        
        // Update the view with restored state
        view.setState(restoredState);
      } catch (err) {
        console.warn("Failed to restore CodeMirror state:", err);
      }
    }
  });
  
  // Track if we've reported the initial entry position (to avoid duplicate reports)
  let initialPositionReported = false;

  // Report initial entry position when view becomes available AND we're in edit mode
  // This handles new cells that start in edit mode (editorView is null in onMount)
  createEffect(() => {
    const view = editorView();
    const isReadOnly = props.readOnly;
    
    if (view && !isReadOnly && !initialPositionReported) {
      const position = undoDepth(view.state);
      actions.setCodeCellEntryPosition(props.cell.id, position);
      initialPositionReported = true;
    }
  });


  // Save editor state before cleanup
  onCleanup(() => {
    const view = editorView();
    if (view) {
      try {
        // Serialize the editor state to JSON
        const stateJSON = view.state.toJSON();
        
        // Optimization: Remove doc from saved state since it's already in cell.content
        // This reduces memory usage by ~30-70% (doc is typically the largest part)
        // We'll inject the doc from props.value when restoring
        const { doc, ...stateWithoutDoc } = stateJSON;
        
        actions.updateCellEditorState(props.cell.id, stateWithoutDoc);
      } catch (err) {
        console.warn("Failed to save CodeMirror state:", err);
      }
    }
  });

  // Report history position ONLY when entering/exiting edit mode (readOnly transitions)
  createEffect((prevReadOnly) => {
    const view = editorView();
    const currentReadOnly = props.readOnly;
    
    if (view && prevReadOnly !== undefined && prevReadOnly !== currentReadOnly) {
      const position = undoDepth(view.state);
      
      if (currentReadOnly) {
        // Exiting edit mode (becoming read-only) - close search panel and commit history
        closeSearchPanel(view);
        actions.commitCodeCellEditSession(props.cell.id, position);
      } else {
        // Entering edit mode (becoming editable)
        actions.setCodeCellEntryPosition(props.cell.id, position);
      }
    }
    
    return currentReadOnly;
  }, props.readOnly);

  // Navigate to target history position when set by global undo/redo
  createEffect(() => {
    const view = editorView();
    const targetPosition = props.cell.targetHistoryPosition;
    
    if (view && targetPosition !== undefined) {
      const currentPosition = undoDepth(view.state);
      const delta = targetPosition - currentPosition;
      
      if (delta !== 0) {
        // Navigate by dispatching history transactions directly
        // We need to get the updated state after each dispatch
        for (let i = 0; i < Math.abs(delta); i++) {
          // Get fresh state and history state for each iteration
          const currentState = view.state;
          const histState = currentState.field(historyField, false);
          
          if (histState) {
            // Use done (BranchName.Done = 0) for undo, undone (BranchName.Undone = 1) for redo
            const side = delta < 0 ? 0 : 1; // 0 = Done (undo), 1 = Undone (redo)
            // Use 'any' cast to bypass strict typing of internal CodeMirror State
            const tr = (histState as any).pop(side, currentState, false);
            if (tr) {
              view.dispatch(tr);
            }
          }
        }
      }
      
      // Clear the target position so it can be set again later (even if delta was 0)
      actions.setCodeCellTargetPosition(props.cell.id, undefined);
    }
  });

  createEffect(() => {
    if (!props.readOnly && editorView()) {
      editorView().focus();
    }
  });

  // Dynamic Theme - Must use EditorView.theme() API, not global CSS
  // CodeMirror 6 requires styles for internal classes (.cm-*) to be registered as extensions
  // for proper scoping, lifecycle management, and access to dynamic JS values.
  // See: explanations/codemirror-theming.md for detailed rationale
  createExtension(() => EditorView.theme({
    "&": {
      backgroundColor: "transparent !important",
      height: "auto",
      minHeight: "1.5rem",
      maxHeight: "var(--editor-max-code-height)",
      fontSize: "var(--code-editor-font-size)",
      fontFamily: "var(--code-font-family)",
      fontWeight: "var(--code-font-weight)",
    },
    ".cm-content": {
      caretColor: "var(--accent) !important",
      padding: "1rem"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent) !important"
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.6",
      overflow: "auto"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--color-secondary)",
      opacity: "0.3"
    },
    ".cm-selectionLayer .cm-selectionBackground": {
      background: "color-mix(in srgb, var(--color-secondary) 25%, transparent) !important"
    },
    ".cm-content ::selection": {
      background: "color-mix(in srgb, var(--color-secondary) 25%, transparent) !important"
    }
  }, { dark: true }));

  // Prevent default CodeMirror newline behavior for run shortcuts
  // execution handling is done at the window level in Notebook.tsx
  createExtension(() => EditorView.domEventHandlers({
    keydown: (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.shiftKey || event.altKey)) {
        return true; // Stop CodeMirror from handling this (no newline), but let it bubble
      }
      return false;
    }
  }));

  // Base extensions
  extensionsConfig = [
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    python(),
    pythonIntellisense,
    pythonHover,
    // Linter is added separately to be reactive
    tooltipTheme,
    history(),
    // Auto-close brackets and quotes
    closeBrackets(),
    // Bracket matching highlight
    bracketMatching({
      afterCursor: true,
      brackets: "()[]{}",  // Explicitly list brackets to match
    }),
    // Smart selection matching - aware of multi-select
    smartSelectionMatches(),
    // Search panel with custom theme
    // Theme must be embedded in search extension config to style dynamically created panel elements
    // See: explanations/codemirror-theming.md
    search({
      top: true,
    }),
    // Disable autocomplete in search panel inputs using update listener (efficient, one-time setup)
    EditorView.updateListener.of((update) => {
      if (update.view.dom.querySelector('.cm-panel.cm-search input:not([autocomplete])')) {
        const inputs = update.view.dom.querySelectorAll('.cm-panel.cm-search input');
        inputs.forEach(input => {
          input.setAttribute('autocomplete', 'off');
          input.setAttribute('autocorrect', 'off');
          input.setAttribute('autocapitalize', 'off');
          input.setAttribute('spellcheck', 'false');
        });
      }
    }),
    EditorView.theme({
      ".cm-searchMatch": {
        backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)",
        outline: "1px solid var(--accent)",
      },
      ".cm-searchMatch-selected": {
        backgroundColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
      },
      ".cm-selectionMatch": {
        backgroundColor: "transparent !important",
        outline: "1px solid color-mix(in srgb, var(--color-secondary) 50%, transparent) !important",
      },
      "&.cm-focused .cm-matchingBracket": {
        backgroundColor: "transparent !important",
        filter: "brightness(1.8)",
      },
      ".cm-panel.cm-search": {
        backgroundColor: "var(--color-background)",
        border: "1px solid var(--color-foreground)",
        borderRadius: "0.125rem",
        padding: "0.5rem",
      },
      ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search select": {
        backgroundColor: "var(--color-background) !important",
        backgroundImage: "none !important",
        color: "var(--color-secondary)",
        border: "1px solid var(--color-foreground)",
        borderRadius: "0.125rem",
        padding: "0.25rem 0.5rem",
        fontSize: "var(--code-base-font-size)",
        fontFamily: "var(--code-font-family)",
        fontWeight: "var(--code-font-weight)",
      },
      ".cm-panel.cm-search input": {
        "&::placeholder": {
          color: "var(--color-foreground)",
          opacity: "0.5",
        },
      },
      ".cm-panel.cm-search input:focus": {
        outline: "none",
        borderColor: "var(--accent)",
      },
      ".cm-panel.cm-search button:hover": {
        borderColor: "var(--accent)",
        backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
      },
      ".cm-panel.cm-search button[name='close']": {
        backgroundColor: "transparent",
        border: "none",
        color: "var(--color-secondary)",
      },
      ".cm-panel.cm-search label": {
        color: "var(--color-secondary)",
        fontSize: "0.75rem",
      },
      ".cm-panel.cm-search input[type='checkbox']": {
        appearance: "none",
        WebkitAppearance: "none",
        width: "0.875rem !important",
        height: "0.875rem !important",
        minWidth: "0.875rem",
        maxWidth: "0.875rem",
        minHeight: "0.875rem",
        maxHeight: "0.875rem",
        border: "2px solid var(--color-foreground)",
        borderRadius: "0.125rem",
        backgroundColor: "transparent",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.2s",
        verticalAlign: "middle",
        marginTop: "0rem",
        marginRight: "0.375rem",
        flexShrink: "0",
        boxSizing: "border-box",
        padding: "0",
      },
      ".cm-panel.cm-search input[type='checkbox']:hover": {
        borderColor: "color-mix(in srgb, var(--color-secondary) 50%, transparent)",
      },
      ".cm-panel.cm-search input[type='checkbox']:checked": {
        backgroundColor: "var(--accent) !important",
        borderColor: "var(--accent)",
      },
      ".cm-panel.cm-search input[type='checkbox']:checked::before": {
        content: '""',
        position: "absolute",
        left: "0.1875rem",
        top: "0rem",
        width: "0.25rem",
        height: "0.5rem",
        border: "solid var(--color-background)",
        borderWidth: "0 2px 2px 0",
        transform: "rotate(45deg)",
        display: "block",
      },
    }),
    keymap.of([
      // Custom completion keymap (replaces default since we disabled it)
      { key: "Ctrl-Space", run: acceptCompletion },
      { key: "Escape", run: closeCompletion },
      { key: "ArrowDown", run: moveCompletionSelection(true) },
      { key: "ArrowUp", run: moveCompletionSelection(false) },
      { key: "Ctrl-Shift-Space", run: startCompletion },
      // Other custom bindings
      { key: "Mod-Enter", run: () => false },
      { key: "Mod-/", run: toggleComment },
      { key: "Mod-Shift-d", run: selectPreviousOccurrence, preventDefault: true },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap
    ]),
  ];
  createExtension(extensionsConfig);
  
  // Reactive duotone theme (updates when syntax colors change)
  createExtension(() => getCustomDuotoneDark(currentTheme.syntax.function));
  
  // Reactive line numbers (toggleable via settings)
  createExtension(createMemo(() => {
    return codeVisibility.showLineNumbers ? lineNumbers() : [];
  }));
  
  // Reactive line wrapping (toggleable via settings)
  createExtension(createMemo(() => {
    return codeVisibility.lineWrap ? EditorView.lineWrapping : [];
  }));
  
  // Reactive Linter
  createExtension(() => createPythonLinter(props.checkRedefinitions));

  // Read-only state
  createExtension(() => EditorState.readOnly.of(!!props.readOnly));

  // Report capabilities to store for UI buttons
  createEffect(() => {
      const view = editorView();
      // Listen to updates that might change history
      if (view && !props.readOnly) {
          const updateHandler = EditorView.updateListener.of((update) => {
              if (update.docChanged || update.selectionSet) {
                  const canUndo = undoDepth(view.state) > 0;
                  const canRedo = redoDepth(view.state) > 0;
                  // Only update if changed to avoid unnecessary renders
                  if (props.cell.canUndo !== canUndo || props.cell.canRedo !== canRedo) {
                       actions.updateEditorCapabilities(props.cell.id, canUndo, canRedo);
                  }
              }
          });
          return updateHandler;
      }
  });
  // Also register initial extension
  createExtension(() => {
      return EditorView.updateListener.of((update) => {
          // Check history depth on every update if editable
          if (!props.readOnly) {
              const state = update.state;
              const canUndo = undoDepth(state) > 0;
              const canRedo = redoDepth(state) > 0;
              if (props.cell.canUndo !== canUndo || props.cell.canRedo !== canRedo) {
                    actions.updateEditorCapabilities(props.cell.id, canUndo, canRedo);
              }
          }
      });
  });

  // Handle external editor actions (undo/redo via signal)
  createEffect(() => {
     const action = props.cell.editorAction;
     if (action) {
         const view = editorView();
         if (view) {
             if (action === "undo") {
                 undo(view);
             } else if (action === "redo") {
                 redo(view);
             }
             // Clear signal immediately
             actions.clearEditorAction(props.cell.id);
             view.focus();
         }
     }
  });

  return (
    <div ref={ref} class={`relative w-full ${props.class || ""}`} />
  );
};

export default CodeEditor;