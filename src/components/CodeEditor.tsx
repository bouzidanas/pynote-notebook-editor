import { type Component, createEffect, onCleanup, onMount, createMemo } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { python } from "@codemirror/lang-python";
import { duotoneDarkInit } from "@uiw/codemirror-theme-duotone";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, historyField, indentWithTab, undoDepth, redoDepth, undo, redo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { currentTheme } from "../lib/theme";
import { type CellData, actions } from "../lib/store";
import { createPythonLinter, pythonIntellisense, pythonHover, tooltipTheme } from "../lib/codemirror-tooling";

// Create custom duotoneDark theme with green function calls
// Using duotoneDarkInit() with custom styles is the most efficient approach -
// single-pass highlighting with our color baked into the theme
const customDuotoneDark = duotoneDarkInit({
  styles: [
    { tag: tags.function(tags.variableName), color: "#a6e3a1" },
  ]
});

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
}

const CodeEditor: Component<EditorProps> = (props) => {
  const { ref, createExtension, editorView } = createCodeMirror({
    onValueChange: props.onChange,
    value: props.value,
  });

  // Handle clicks on readonly editor
  createEffect(() => {
    const view = editorView();
    if (view && props.onClick) {
      const handler = () => {
        if (props.readOnly) {
          props.onClick?.();
        }
      };
      view.dom.addEventListener('click', handler);
      onCleanup(() => view.dom.removeEventListener('click', handler));
    }
  });

  // Handle blur to exit edit mode
  createEffect(() => {
    const view = editorView();
    if (view && props.onBlur) {
      const handler = () => {
        if (!props.readOnly) {
          props.onBlur?.();
        }
      };
      view.contentDOM.addEventListener('blur', handler);
      onCleanup(() => view.contentDOM.removeEventListener('blur', handler));
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
        // Exiting edit mode (becoming read-only)
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

  // Dynamic Theme
  createExtension(() => EditorView.theme({
    "&": {
      backgroundColor: "transparent !important",
      height: "auto",
      minHeight: "1.5rem",
      maxHeight: currentTheme.editor.maxCodeHeight,
      fontSize: "1rem",
      fontFamily: "var(--font-mono)",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "1rem"
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
      display: "none" 
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
    python(),
    pythonIntellisense,
    pythonHover,
    // Linter is added separately to be reactive
    tooltipTheme,
    customDuotoneDark,
    history(),
    keymap.of([
      { key: "Mod-Enter", run: () => false },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap
    ]),
    EditorView.lineWrapping
  ];
  createExtension(extensionsConfig);
  
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