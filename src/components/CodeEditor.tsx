import { type Component, createEffect, onCleanup, onMount } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { python } from "@codemirror/lang-python";
import { duotoneDark } from "@uiw/codemirror-theme-duotone";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, historyField, indentWithTab, undoDepth, redoDepth, undo, redo } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import { EditorState, Compartment } from "@codemirror/state";
import { currentTheme } from "../lib/theme";
import { type CellData, actions } from "../lib/store";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  class?: string;
  readOnly?: boolean;
  cell: CellData; // Add cell prop to access stored state
}

const CodeEditor: Component<EditorProps> = (props) => {
  const { ref, createExtension, editorView } = createCodeMirror({
    onValueChange: props.onChange,
    value: props.value,
  });

  // Compartment for switching between "heavy" interactive extensions and "light" read-only ones
  // We define this stable reference to allow dynamic reconfiguration
  const interactionCompartment = new Compartment();

  // Extensions that are ONLY needed when editing
  // Removing these reduces event listeners and overhead when in read-only mode
  const interactiveExtensions = [
      keymap.of([
        { key: "Mod-Enter", run: () => false },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap
      ]),
      // Visual writing aids that require DOM scans or extra styling
      bracketMatching(),
      closeBrackets(),
  ];

  // Base extensions that are always required (syntax highlighting, theme, history tracking)
  const baseExtensions = [
    python(),
    duotoneDark,
    history(), // History MUST stay in base to persist the undo stack even when read-only
    drawSelection(), // Keep selection visible/persistent even in ReadOnly mode
    EditorView.lineWrapping
  ];

  // Full configuration for referencing
  const allExtensions = [
    ...baseExtensions,
    interactionCompartment.of(interactiveExtensions) // Default to interactive
  ];

  // Restore editor state when component mounts (entering edit mode)
  onMount(() => {
    const savedState = props.cell.editorState;
    const view = editorView();
    
    // Create a specific restore config that respects the INITIAL read-only state
    // This prevents a "flash" of interactive mode or missing undo stack on load
    const restoreExtensions = [
        ...baseExtensions,
        interactionCompartment.of(props.readOnly ? [] : interactiveExtensions)
    ];

    if (savedState && view) {
      try {
        // Restore state from JSON using CodeMirror's fromJSON
        // This restores the history that corresponds to the current content
        const restoredState = EditorState.fromJSON(
          savedState,
          {
            doc: props.value, // Always use current content from props
            extensions: restoreExtensions,
          }
        );
        
        // Update the view with restored state
        view.setState(restoredState);
      } catch (err) {
        console.warn("Failed to restore CodeMirror state:", err);
      }
    }
  });
  


  // Save editor state before cleanup
  onCleanup(() => {
    const view = editorView();
    if (view) {
      try {
        // Prepare state for saving
        const stateJSON = view.state.toJSON();
        
        // Optimization: Remove doc from saved state
        const { doc, ...stateWithoutDoc } = stateJSON;
        
        actions.updateCellEditorState(props.cell.id, stateWithoutDoc);

        // If we are unmounting while in edit mode (not readOnly), 
        // we must commit the session just like we do when toggling readOnly
        if (!props.readOnly) {
           const position = undoDepth(view.state);
           console.log(`[CodeEditor] Exiting edit mode (cleanup), exit position ${position} for cell ${props.cell.id}`);
           actions.commitCodeCellEditSession(props.cell.id, position);
        }

      } catch (err) {
        console.warn("Failed to save CodeMirror state:", err);
      }
    }
  });

  // Report history position ONLY when entering/exiting edit mode (readOnly transitions)
  createEffect((prevReadOnly) => {
    const view = editorView();
    const currentReadOnly = props.readOnly;
    
    if (!view) return prevReadOnly;

    if (prevReadOnly === undefined) {
        if (!currentReadOnly) {
            const position = undoDepth(view.state);
            console.log(`[CodeEditor] Entering edit mode (mount), entry position ${position} for cell ${props.cell.id}`);
            actions.setCodeCellEntryPosition(props.cell.id, position);
        }
    } else if (prevReadOnly !== currentReadOnly) {
      const position = undoDepth(view.state);
      
      if (currentReadOnly) {
        // Exiting edit mode (becoming read-only)
        console.log(`[CodeEditor] Exiting edit mode, exit position ${position} for cell ${props.cell.id}`);
        actions.commitCodeCellEditSession(props.cell.id, position);
      } else {
        // Entering edit mode (becoming editable)
        console.log(`[CodeEditor] Entering edit mode, entry position ${position} for cell ${props.cell.id}`);
        actions.setCodeCellEntryPosition(props.cell.id, position);
      }
    }
    
    return currentReadOnly;
  });

  // Navigate to target history position when set by global undo/redo
  createEffect(() => {
    const view = editorView();
    const targetPosition = props.cell.targetHistoryPosition;
    
    if (view && targetPosition !== undefined) {
      const currentPosition = undoDepth(view.state);
      const delta = targetPosition - currentPosition;
      
      if (delta !== 0) {
        console.log(`[CodeEditor] Navigating from position ${currentPosition} to ${targetPosition} (delta: ${delta}) for cell ${props.cell.id}`);
        
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
        
        const finalPosition = undoDepth(view.state);
        console.log(`[CodeEditor] Navigation complete, final position ${finalPosition} for cell ${props.cell.id}`);
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

  // Apply the extensions
  createExtension(allExtensions);

  // Dynamic switching of interactions based on readOnly
  createEffect(() => {
    const view = editorView();
    if (view) {
        // When readOnly, we empty the interaction compartment to remove listeners
        // When editing, we restore them
        view.dispatch({
            effects: interactionCompartment.reconfigure(
                props.readOnly ? [] : interactiveExtensions
            )
        });
    }
  });

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