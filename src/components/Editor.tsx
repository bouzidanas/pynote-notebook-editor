import { type Component, createEffect, on } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { python } from "@codemirror/lang-python";
import { nord } from "@uiw/codemirror-theme-nord";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { currentTheme } from "../lib/theme";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  class?: string;
  readOnly?: boolean;
}

const Editor: Component<EditorProps> = (props) => {
  const { ref, createExtension } = createCodeMirror({
    onValueChange: props.onChange,
    value: props.value,
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

  // Base extensions
  createExtension([
    python(),
    nord,
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping
  ]);

  // Read-only state
  createExtension(() => EditorState.readOnly.of(!!props.readOnly));

  return (
    <div ref={ref} class={`relative w-full ${props.class || ""}`} />
  );
};

export default Editor;