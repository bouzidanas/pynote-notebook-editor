import { type Component, createEffect } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { python } from "@codemirror/lang-python";
import { duotoneDark } from "@uiw/codemirror-theme-duotone";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { currentTheme } from "../lib/theme";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  class?: string;
  readOnly?: boolean;
}

const CodeEditor: Component<EditorProps> = (props) => {
  const { ref, createExtension, editorView } = createCodeMirror({
    onValueChange: props.onChange,
    value: props.value,
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
  createExtension([
    python(),
    duotoneDark,
    history(),
    keymap.of([
      { key: "Mod-Enter", run: () => false },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap
    ]),
    EditorView.lineWrapping
  ]);

  // Read-only state
  createExtension(() => EditorState.readOnly.of(!!props.readOnly));

  return (
    <div ref={ref} class={`relative w-full ${props.class || ""}`} />
  );
};

export default CodeEditor;