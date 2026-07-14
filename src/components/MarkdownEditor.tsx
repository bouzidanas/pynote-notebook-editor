import { type Component, onMount, onCleanup, createEffect, createSignal } from "solid-js";
import { TextSelection, Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state"; // Standard state handling
import type { MarkType, Node as ProseNode } from "@milkdown/kit/prose/model";
import { actions, notebookStore, type CellData } from "../lib/store";

// Core Framework
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, schemaCtx } from "@milkdown/kit/core";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

// Theme (remains separate)
import { nord } from "@milkdown/theme-nord";

// Presets - Split between Commonmark (Foundation) and GFM (Extensions)
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  toggleLinkCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  toggleInlineCodeCommand,
  createCodeBlockCommand,
  insertImageCommand
} from "@milkdown/kit/preset/commonmark";

import {
  gfm,
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  deleteSelectedCellsCommand
} from "@milkdown/kit/preset/gfm";

// Plugins
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";

// Utilities & ProseMirror Bridge
import { callCommand, getMarkdown, replaceAll, $prose } from "@milkdown/kit/utils";
import { lift, wrapIn, setBlockType, toggleMark } from "@milkdown/kit/prose/commands"; // Re-exported from kit
import { undo as milkUndo, redo as milkRedo } from "@milkdown/kit/prose/history"; // Import standard history commands
import { undoDepth, redoDepth } from "prosemirror-history"; // Directly import form prosemirror-history (Milkdown uses this internally)

// UI Components
import { Bold, Italic, Quote, Heading, ChevronDown, Link2, List, ListOrdered, Code, SquareCode, Image, Table, MoreHorizontal, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash, Plus, Delete, CaptionsIcon, Video, SquareSplitHorizontal, /* TextAlignCenter, TextAlignEnd, */ TextAlignStart } from "lucide-solid";
import Dropdown, { DropdownItem, DropdownDivider, DropdownNested } from "./ui/Dropdown";
import { sectionScopePlugin } from "../lib/sectionScopePlugin";
import { codeBlockNavigationPlugin } from "../lib/codeBlockNavigationPlugin";
import { captionMark, toggleCaptionCommand } from "../lib/captionPlugin";
import { videoEmbed } from "../lib/videoEmbedPlugin";
import { computeSplit, isSplitShortcut } from "../lib/markdownSplit";
// import { textAlign } from "../lib/textAlignPlugin"; // disabled until alignment bug is fixed
import clsx from "clsx";


interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  cell: CellData;
  showToolbar?: () => boolean;
  initialClickCoords?: { left: number; top: number };
}

const MarkdownEditor: Component<MarkdownEditorProps> = (props) => {
  let editorRef: HTMLDivElement | undefined;
  let editorInstance: Editor | null = null;
  const isUpdatingFromProps = false;

  // Active state of the togglable formatting buttons, derived from the
  // current selection / stored marks so the toolbar reflects what typing
  // (or clicking again) will do.
  const [activeFormats, setActiveFormats] = createSignal({
    strong: false,
    emphasis: false,
    inlineCode: false,
    blockquote: false,
    heading: false,
    bulletList: false,
    orderedList: false,
  });

  const isMarkActive = (state: EditorState, type: MarkType | undefined) => {
    if (!type) return false;
    const { empty, from, to, $from } = state.selection;
    // Collapsed cursor: check stored marks (set by a toggle before typing)
    // falling back to the marks at the cursor position.
    if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
    return state.doc.rangeHasMark(from, to, type);
  };

  const updateActiveFormats = (state: EditorState) => {
    const { marks } = state.schema;
    const { $from } = state.selection;
    let blockquote = false;
    let heading = false;
    // Innermost list wins (walk is depth -> root, so first hit is innermost).
    let listName: string | null = null;
    for (let i = $from.depth; i > 0; i--) {
      const name = $from.node(i).type.name;
      if (name === "blockquote") blockquote = true;
      else if (name === "heading") heading = true;
      else if (!listName && (name === "bullet_list" || name === "ordered_list")) listName = name;
    }
    setActiveFormats({
      strong: isMarkActive(state, marks.strong),
      emphasis: isMarkActive(state, marks.emphasis),
      inlineCode: isMarkActive(state, marks.inlineCode),
      blockquote,
      heading,
      bulletList: listName === "bullet_list",
      orderedList: listName === "ordered_list",
    });
  };

  // Tiny prose plugin so we see EVERY state update, including storedMarks-only
  // transactions (e.g. clicking Bold at a collapsed cursor before typing) that
  // the milkdown listener plugin does not report.
  const formatStatePlugin = $prose(() => new Plugin({
    key: new PluginKey("toolbarFormatState"),
    view: (editorView) => {
      updateActiveFormats(editorView.state);
      return {
        update: (view) => updateActiveFormats(view.state),
      };
    },
  }));
  // --- Text alignment disabled until bug is fixed ---
  // const [currentAlign, setCurrentAlign] = createSignal<string | null>(null);
  // const syncAlignState = (view: any) => {
  //   const { $from } = view.state.selection;
  //   const node = $from.parent;
  //   if (node.type.name === 'paragraph' || node.type.name === 'heading') {
  //     setCurrentAlign(node.attrs.textAlign || null);
  //   } else {
  //     setCurrentAlign(null);
  //   }
  // };

  onMount(() => {
    if (!editorRef) return;

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorRef);
        ctx.set(defaultValueCtx, props.value);

        // Register remark-stringify handler for caption nodes
        ctx.update(remarkStringifyOptionsCtx, (options: any) => ({
          ...options,
          handlers: {
            ...options.handlers,
            caption: (node: any, _: any, state: any, info: any) => {
              const value = state.containerPhrasing(node, { before: info.before, after: info.after });
              return `<span class="caption">${value}</span>`;
            },
          },
        }));

        // Use the listener to sync changes back to props
        ctx.get(listenerCtx)
            .markdownUpdated((_ctx, markdown) => {
              // In Solid, avoid destructuring props to maintain reactivity
              if (!isUpdatingFromProps) {
                props.onChange(markdown);
              }
            })
            // Listen for any state updates (transactions) to track history depth
            .updated((ctx, _doc, _prevDoc) => {
               const view = ctx.get(editorViewCtx);
               if (view && !props.readOnly) {
                   const state = view.state;
                   const canUndo = undoDepth(state) > 0;
                   const canRedo = redoDepth(state) > 0;
                   if (props.cell.canUndo !== canUndo || props.cell.canRedo !== canRedo) {
                       actions.updateEditorCapabilities(props.cell.id, canUndo, canRedo);
                   }
               }
               // if (view) syncAlignState(view); // disabled until alignment bug is fixed
            })
            // .selectionUpdated((_ctx, selection) => {
            //    const node = selection.$from.parent;
            //    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
            //      setCurrentAlign(node.attrs.textAlign || null);
            //    } else {
            //      setCurrentAlign(null);
            //    }
            // })
            ;
      })
      .config(nord) // Theme config
      .use(commonmark) // Foundation (Paragraphs, Bold, etc.)
      .use(gfm)        // Extensions (Tables, Task Lists)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(sectionScopePlugin)
      .use(codeBlockNavigationPlugin)
      .use(captionMark)
      .use(videoEmbed)
      .use(formatStatePlugin)
      // .use(textAlign) // disabled until alignment bug (Enter→code_block) is fixed
      .create()
      .then((editor) => {
        editorInstance = editor;
        
        // Focus the editor and initialize capabilities
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (view) {
              // Place cursor at double-click position (takes priority since it reflects current intent)
              if (props.initialClickCoords) {
                  try {
                      const pos = view.posAtCoords({ left: props.initialClickCoords.left, top: props.initialClickCoords.top });
                      if (pos) {
                          const sel = TextSelection.near(view.state.doc.resolve(pos.pos));
                          view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
                      }
                  } catch (e) {
                      // Fall through to saved state or default
                  }
              } else if (props.cell.editorState) {
                  // Fallback: restore saved selection (e.g. programmatic edit entry)
                  try {
                       const savedSelection = props.cell.editorState.selection;
                       if (savedSelection) {
                            const sel = TextSelection.fromJSON(view.state.doc, savedSelection);
                            const tr = view.state.tr.setSelection(sel);
                            view.dispatch(tr);
                            view.dispatch(view.state.tr.scrollIntoView());
                       }
                  } catch (e) {
                      console.warn("Failed to restore markdown cursor:", e);
                  }
              }

              view.focus();
              const state = view.state;
              const canUndo = undoDepth(state) > 0;
              const canRedo = redoDepth(state) > 0;
              actions.updateEditorCapabilities(props.cell.id, canUndo, canRedo);
          }
        });
      })
      .catch((e) => console.error("Milkdown init error", e));

    // Mod+Shift+Enter splits the cell at the cursor. Not used by the app or
    // any major browser, and only fires when this editor's view has DOM focus.
    const handleSplitShortcut = (e: KeyboardEvent) => {
      if (props.readOnly) return;
      if (!isSplitShortcut(e)) return;
      if (!editorInstance) return;
      let hasFocus = false;
      try {
        editorInstance.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          hasFocus = !!view && view.hasFocus();
        });
      } catch {
        return;
      }
      if (!hasFocus) return;
      e.preventDefault();
      e.stopPropagation();
      splitCell();
    };
    // Capture phase so we run before global handlers in Notebook.tsx.
    window.addEventListener("keydown", handleSplitShortcut, true);
    onCleanup(() => window.removeEventListener("keydown", handleSplitShortcut, true));
  });

  onCleanup(() => {
    // Save Selection State before destroying
    if (editorInstance) {
        editorInstance.action((ctx) => {
             const view = ctx.get(editorViewCtx);
             if (view) {
                 const state = view.state;
                 // We only save the selection, not the full state or history (as they are not serializable)
                 const selectionJSON = state.selection.toJSON();
                 actions.updateCellEditorState(props.cell.id, { selection: selectionJSON });
             }
        });
      editorInstance.destroy();
    }
  });

  const call = (command: any, payload?: any) => {
    editorInstance?.action((ctx) => {
      callCommand(command, payload)(ctx);
      // Refocus: if focus drifted to other UI, ProseMirror skips the DOM
      // selection sync after the doc change and the visible caret is lost.
      ctx.get(editorViewCtx)?.focus();
    });
  };

  // Milkdown's toggleInlineCodeCommand bails out on empty selections, so at
  // a collapsed cursor toggle the stored mark ourselves (same as Bold/Italic).
  const toggleInlineCode = () => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const schema = ctx.get(schemaCtx);
      const { state, dispatch } = view;
      if (state.selection.empty) {
        toggleMark(schema.marks.inlineCode)(state, dispatch);
      } else {
        callCommand(toggleInlineCodeCommand.key)(ctx);
      }
      view.focus();
    });
  };

  // Three-way toggle: wrap (no list), unwrap (same list type), or convert
  // (other type). Converting must also rewrite each item's listType/label
  // attrs or milkdown's syncListOrderPlugin converts the node right back.
  const toggleList = (targetName: "bullet_list" | "ordered_list") => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const schema = ctx.get(schemaCtx);
      const { state, dispatch } = view;
      const { $from } = state.selection;

      // Find the innermost containing list
      let listNode: ProseNode | null = null;
      let listPos = -1;
      for (let i = $from.depth; i > 0; i--) {
        const node = $from.node(i);
        const name = node.type.name;
        if (name === "bullet_list" || name === "ordered_list") {
          listNode = node;
          listPos = $from.before(i);
          break;
        }
      }

      if (!listNode) {
        const command = targetName === "bullet_list" ? wrapInBulletListCommand : wrapInOrderedListCommand;
        callCommand(command.key)(ctx);
        view.focus();
        return;
      }

      if (listNode.type.name === targetName) {
        // Unwrap into the items' blocks. Selection-mapping through a full
        // replace collapses to the boundary, so map anchor/head into the
        // flattened output ourselves to keep highlights intact.
        const { anchor, head } = state.selection;
        const blocks: ProseNode[] = [];
        let newAnchor: number | null = null;
        let newHead: number | null = null;
        let insertPos = listPos; // start of the next flattened block
        listNode.forEach((item, itemOffset) => {
          const itemPos = listPos + 1 + itemOffset;
          item.forEach((block, blockOffset) => {
            const blockPos = itemPos + 1 + blockOffset;
            if (anchor >= blockPos && anchor <= blockPos + block.nodeSize) {
              newAnchor = insertPos + (anchor - blockPos);
            }
            if (head >= blockPos && head <= blockPos + block.nodeSize) {
              newHead = insertPos + (head - blockPos);
            }
            blocks.push(block);
            insertPos += block.nodeSize;
          });
        });
        const tr = state.tr.replaceWith(listPos, listPos + listNode.nodeSize, blocks);
        if (newAnchor !== null || newHead !== null) {
          const a = tr.doc.resolve(newAnchor ?? newHead!);
          const h = tr.doc.resolve(newHead ?? newAnchor!);
          tr.setSelection(TextSelection.between(a, h));
        }
        dispatch(tr.scrollIntoView());
        view.focus();
        return;
      }

      // Other type: convert in place (list node + every item's attrs).
      const ordered = targetName === "ordered_list";
      let tr = state.tr.setNodeMarkup(listPos, schema.nodes[targetName]);
      let index = 0;
      listNode.forEach((item, offset) => {
        if (item.type.name === "list_item") {
          tr = tr.setNodeMarkup(listPos + 1 + offset, undefined, {
            ...item.attrs,
            listType: ordered ? "ordered" : "bullet",
            label: ordered ? `${index + 1}.` : "\u2022",
          });
          index++;
        }
      });
      dispatch(tr.scrollIntoView());
      view.focus();
    });
  };

  const toggleQuote = () => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const schema = ctx.get(schemaCtx);
      const { state, dispatch } = view;
      const { blockquote } = schema.nodes;
      const { $from } = state.selection;

      let isBlockquote = false;
      for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type === blockquote) {
          isBlockquote = true;
          break;
        }
      }

      if (isBlockquote) {
        lift(state, dispatch);
      } else {
        wrapIn(blockquote)(state, dispatch);
      }
      view.focus();
    });
  };
  
  const cycleHeader = () => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const schema = ctx.get(schemaCtx);
      const { state, dispatch } = view;
      const { heading, paragraph } = schema.nodes;
      const { $from } = state.selection;

      // Find if we are currently in a heading and what level
      let currentLevel = 0;
      for (let i = $from.depth; i > 0; i--) {
        const node = $from.node(i);
        if (node.type === heading) {
          currentLevel = node.attrs.level;
          break;
        }
      }

      // Cycle: 0 (Para) -> 1 -> 2 -> 3 -> 4 -> 0
      const nextLevel = currentLevel >= 4 ? 0 : currentLevel + 1;

      if (nextLevel === 0) {
        setBlockType(paragraph)(state, dispatch);
      } else {
        setBlockType(heading, { level: nextLevel })(state, dispatch);
      }
      view.focus();
    });
  };

  // const cycleTextAlign = () => {
  //   editorInstance?.action((ctx) => {
  //     const view = ctx.get(editorViewCtx);
  //     const { state, dispatch } = view;
  //     const { $from } = state.selection;
  //     const node = $from.parent;
  //     if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;
  //     const currentAlign = node.attrs.textAlign || null;
  //     const CYCLE: (string | null)[] = [null, 'center', 'right'];
  //     const idx = CYCLE.indexOf(currentAlign);
  //     const nextAlign = CYCLE[(idx + 1) % CYCLE.length];
  //     const pos = $from.before($from.depth);
  //     dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: nextAlign }));
  //     setCurrentAlign(nextAlign);
  //   });
  // };

  const deleteTable = () => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const { $from } = state.selection;
      
      for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type.name === 'table') {
          const start = $from.start(i) - 1;
          const end = $from.end(i) + 1;
          // After deleting, place the cursor at the nearest text position
          // where the table was (start of the following block, or end of the
          // preceding one) instead of leaving it to selection mapping.
          const tr = state.tr.delete(start, end);
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(start, tr.doc.content.size))));
          dispatch(tr.scrollIntoView());
          view.focus();
          return;
        }
      }
    });
  };

  const insertLink = () => {
    const url = window.prompt("Enter URL");
    if (url) {
      call(toggleLinkCommand.key, { href: url });
    }
  };

  const insertImage = () => {
    const url = window.prompt("Enter Image URL");
    if (url) {
      call(insertImageCommand.key, { src: url });
    }
  };

  const insertVideo = () => {
    const url = window.prompt("Enter Video URL (YouTube, Vimeo, or direct link)");
    if (url) {
      editorInstance?.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const schema = ctx.get(schemaCtx);
        const { state, dispatch } = view;
        const videoType = schema.nodes.video_embed;
        if (videoType) {
          let embedHtml = "";
          // YouTube
          const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
          // Vimeo
          const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
          if (ytMatch) {
            embedHtml = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen class="video-embed"></iframe>`;
          } else if (vimeoMatch) {
            embedHtml = `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0" allowfullscreen class="video-embed"></iframe>`;
          } else {
            embedHtml = `<video src="${url}" controls></video>`;
          }
          const node = videoType.create({ value: embedHtml });
          dispatch(state.tr.replaceSelectionWith(node));
        }
      });
    }
  };

  const insertTable = () => {
      editorInstance?.action((ctx) => {
        callCommand(insertTableCommand.key, { row: 3, col: 3 })(ctx);
        // Milkdown's own findFrom stops at the split paragraph and never
        // reaches the table, so move the cursor to the first header cell.
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const selPos = state.selection.from;
        let tablePos: number | null = null;
        state.doc.descendants((node, pos) => {
          if (node.type.name === "table") {
            if (tablePos === null || Math.abs(pos - selPos) < Math.abs(tablePos - selPos)) {
              tablePos = pos;
            }
            return false;
          }
          return true;
        });
        if (tablePos !== null) {
          const sel = TextSelection.near(state.doc.resolve(tablePos + 1), 1);
          view.dispatch(state.tr.setSelection(sel).scrollIntoView());
        }
        view.focus();
      });
  };

  const insertCodeBlock = (language?: string) => {
    if (language) {
      call(createCodeBlockCommand.key, language);
    } else {
      call(createCodeBlockCommand.key);
    }
  };

  const splitShortcutHint =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘⇧↵"
      : "Ctrl+Shift+Enter";

  // Split the current markdown cell in two at the cursor. The original editor
  // keeps focus and is trimmed in place; the other half goes into a new
  // sibling cell. Whichever side has the closest non-whitespace content keeps
  // the cursor (ties go to the first cell). See computeSplit and its tests.
  const splitCell = () => {
    if (props.readOnly || !editorInstance) return;

    editorInstance.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (!view) return;
      const { state } = view;
      const cursorPos = state.selection.from;
      const docSize = state.doc.content.size;

      let beforeMd = "";
      let afterMd = "";
      try {
        beforeMd = cursorPos > 0 ? getMarkdown({ from: 0, to: cursorPos })(ctx) : "";
        afterMd = cursorPos < docSize ? getMarkdown({ from: cursorPos, to: docSize })(ctx) : "";
      } catch (e) {
        console.warn("Markdown split: failed to serialize halves", e);
        return;
      }

      const { beforeContent, afterContent, focusFirst } = computeSplit(beforeMd, afterMd);

      const idx = notebookStore.cells.findIndex((c) => c.id === props.cell.id);
      if (idx === -1) return;

      // Insert the sibling first (so it lands at the right index either way),
      // then replace the live editor's content with the kept half. That write
      // goes through markdownUpdated, so the in-flight edit session captures
      // it for normal undo/redo on exit.
      if (focusFirst) {
        actions.insertMarkdownCell(idx + 1, afterContent);
      } else {
        actions.insertMarkdownCell(idx, beforeContent);
      }

      const keepContent = focusFirst ? beforeContent : afterContent;
      try {
        replaceAll(keepContent)(ctx);
        const v = ctx.get(editorViewCtx);
        const sel = focusFirst
          ? TextSelection.atEnd(v.state.doc)
          : TextSelection.atStart(v.state.doc);
        v.dispatch(v.state.tr.setSelection(sel).scrollIntoView());
      } catch (e) {
        console.warn("Markdown split: failed to update kept half", e);
      }
    });
  };

// --- External Signal Handling ---
  createEffect(() => {
    const action = props.cell.editorAction;
    if (action && editorInstance) {
        editorInstance.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            if (view) {
                if (action === "undo") {
                    milkUndo(view.state, view.dispatch);
                } else if (action === "redo") {
                    milkRedo(view.state, view.dispatch);
                }
                actions.clearEditorAction(props.cell.id);
                view.focus();
            }
        });
    }
  });

  return (
    <div class="flex flex-col gap-2">
      {/* Toolbar */}
      <div
        class={clsx(
          "transition-[max-height,opacity,margin] duration-250 ease-out",
          (props.showToolbar?.() ?? true)
            ? "max-h-12 opacity-100"
            : "max-h-0 opacity-0 -mb-2 overflow-hidden"
        )}
      >
      <div class="flex items-center gap-1 pb-1 -mt-2 max-xs:-mt-0.5 border-b border-foreground/30" onMouseDown={e => e.preventDefault()}>
        {/* Bold */}
        <button onClick={() => call(toggleStrongCommand.key)} class={clsx("btn-icon", activeFormats().strong && "bg-foreground")} aria-pressed={activeFormats().strong} title="Bold">
          <Bold size={16} />
        </button>
        {/* Italic */}
        <button onClick={() => call(toggleEmphasisCommand.key)} class={clsx("btn-icon", activeFormats().emphasis && "bg-foreground")} aria-pressed={activeFormats().emphasis} title="Italic">
          <Italic size={16} />
        </button>
        
        <div class="w-px h-4 bg-foreground/30 mx-1 hidden sm:block"></div>

        {/* Header Split Button */}
        <div class="flex items-center gap-0">
          <button 
            onClick={cycleHeader} 
            class={clsx("btn-icon rounded-r-none hover:z-10 -mr-px", activeFormats().heading && "bg-foreground")}
            aria-pressed={activeFormats().heading}
            title="Cycle Header Level"
          >
            <Heading size={16} />
          </button>
          <Dropdown
            compact
            preserveFocus
            trigger={
              <button class="btn-icon rounded-l-none px-1" title="Heading Options">
                 <ChevronDown size={12} />
              </button>
            }
          >
            <DropdownItem onClick={() => call(wrapInHeadingCommand.key, 1)}>
              <span class="text-xl font-bold">Heading 1</span>
            </DropdownItem>
            <DropdownItem onClick={() => call(wrapInHeadingCommand.key, 2)}>
              <span class="text-lg font-bold">Heading 2</span>
            </DropdownItem>
            <DropdownItem onClick={() => call(wrapInHeadingCommand.key, 3)}>
              <span class="text-base font-bold">Heading 3</span>
            </DropdownItem>
            <DropdownItem onClick={() => call(wrapInHeadingCommand.key, 4)}>
              <span class="text-sm font-bold">Heading 4</span>
            </DropdownItem>
          </Dropdown>
        </div>

        {/* Text Alignment (disabled until alignment bug is fixed) */}
        <button disabled class="btn-icon opacity-40 cursor-not-allowed" title="Text Alignment (coming soon)">
          <span class="flex transition-transform duration-150">
            <TextAlignStart size={16} />
          </span>
        </button>

        {/* Mobile "More" Menu (Visible on mobile only) */}
        <div class="flex sm:hidden items-center">
             <Dropdown
                compact
                preserveFocus
                trigger={
                    <button class="btn-icon" title="More Formatting">
                        <MoreHorizontal size={16} />
                    </button>
                }
             >
                <DropdownItem onClick={insertLink}>
                    <div class="flex items-center gap-2"><Link2 size={16} /> Link</div>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => toggleList("bullet_list")}>
                    <div class="flex items-center gap-2"><List size={16} /> Bullet List</div>
                </DropdownItem>
                <DropdownItem onClick={() => toggleList("ordered_list")}>
                    <div class="flex items-center gap-2"><ListOrdered size={16} /> Numbered List</div>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={toggleQuote}>
                    <div class="flex items-center gap-2"><Quote size={16} /> Quote</div>
                </DropdownItem>
                <DropdownItem onClick={toggleInlineCode}>
                    <div class="flex items-center gap-2"><Code size={16} /> Inline Code</div>
                </DropdownItem>
                <DropdownNested compact label={<div class="flex items-center gap-2"><SquareCode size={16} /> Code Block</div>}>
                    <DropdownItem onClick={() => insertCodeBlock()}>
                        <div class="flex items-center gap-2">Plain</div>
                    </DropdownItem>
                    <DropdownItem onClick={() => insertCodeBlock('py')}>
                        <div class="flex items-center gap-2">Python</div>
                    </DropdownItem>
                    <DropdownItem onClick={() => insertCodeBlock('js')}>
                        <div class="flex items-center gap-2">JavaScript</div>
                    </DropdownItem>
                    <DropdownItem onClick={() => insertCodeBlock('diff')}>
                        <div class="flex items-center gap-2">Diff</div>
                    </DropdownItem>
                </DropdownNested>
                <DropdownItem onClick={insertImage}>
                    <div class="flex items-center gap-2"><Image size={16} /> Image</div>
                </DropdownItem>
                <DropdownItem onClick={insertVideo}>
                    <div class="flex items-center gap-2"><Video size={16} /> Video</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(toggleCaptionCommand.key)}>
                    <div class="flex items-center gap-2"><CaptionsIcon size={16} /> Caption</div>
                </DropdownItem>
                <DropdownNested compact label={<div class="flex items-center gap-2"><Table size={16} /> Table</div>}>
                    <DropdownItem onClick={insertTable}>
                        <div class="flex items-center gap-2"><Plus size={16} /> Insert Table</div>
                    </DropdownItem>
                    <DropdownDivider />
                    <DropdownItem onClick={() => call(addRowBeforeCommand.key)}>
                        <div class="flex items-center gap-2"><ArrowUp size={16} /> Row Above</div>
                    </DropdownItem>
                    <DropdownItem onClick={() => call(addRowAfterCommand.key)}>
                        <div class="flex items-center gap-2"><ArrowDown size={16} /> Row Below</div>
                    </DropdownItem>
                    <DropdownItem onClick={() => call(addColBeforeCommand.key)}>
                        <div class="flex items-center gap-2"><ArrowLeft size={16} /> Col Left</div>
                    </DropdownItem>
                    <DropdownItem onClick={() => call(addColAfterCommand.key)}>
                        <div class="flex items-center gap-2"><ArrowRight size={16} /> Col Right</div>
                    </DropdownItem>
                    <DropdownDivider />
                    <DropdownItem onClick={() => call(deleteSelectedCellsCommand.key)}>
                        <div class="flex items-center gap-2 text-primary"><Delete size={16} /> Delete Selected</div>
                    </DropdownItem>
                    <DropdownItem onClick={deleteTable}>
                        <div class="flex items-center gap-2 text-primary"><Trash size={16} /> Delete Table</div>
                    </DropdownItem>
                </DropdownNested>
                <DropdownItem onClick={splitCell}>
                    <div class="flex items-center gap-2"><SquareSplitHorizontal size={16} /> Split Cell</div>
                </DropdownItem>
             </Dropdown>
        </div>

        {/* Desktop Tools (Hidden on mobile) */}
        <div class="hidden sm:flex items-center gap-1">
            <div class="w-px h-4 bg-foreground/30 mx-1"></div>
            {/* Link */}
            <button onClick={insertLink} class="btn-icon" title="Link">
            <Link2 size={16} />
            </button>
            {/* Bullet List */}
            <button onClick={() => toggleList("bullet_list")} class={clsx("btn-icon", activeFormats().bulletList && "bg-foreground")} aria-pressed={activeFormats().bulletList} title="Bullet List">
            <List size={16} />
            </button>
            {/* Numbered List */}
            <button onClick={() => toggleList("ordered_list")} class={clsx("btn-icon", activeFormats().orderedList && "bg-foreground")} aria-pressed={activeFormats().orderedList} title="Numbered List">
            <ListOrdered size={16} />
            </button>
            <div class="w-px h-4 bg-foreground/30 mx-1"></div>
            {/* Quote toggle */}
            <button onClick={toggleQuote} class={clsx("btn-icon", activeFormats().blockquote && "bg-foreground")} aria-pressed={activeFormats().blockquote} title="Quote">
            <Quote size={16} />
            </button>
            {/* Inline Code */}
            <button onClick={toggleInlineCode} class={clsx("btn-icon", activeFormats().inlineCode && "bg-foreground")} aria-pressed={activeFormats().inlineCode} title="Inline Code">
            <Code size={16} />
            </button>
            {/* Code Block Dropdown */}
            <Dropdown
              compact
              align="right"
              preserveFocus
              trigger={
                <button class="btn-icon" title="Code Block">
                  <SquareCode size={16} />
                </button>
              }
            >
                <DropdownItem onClick={() => insertCodeBlock()}>
                    <div class="flex items-center gap-2">Plain</div>
                </DropdownItem>
                <DropdownItem onClick={() => insertCodeBlock('py')}>
                    <div class="flex items-center gap-2">Python</div>
                </DropdownItem>
                <DropdownItem onClick={() => insertCodeBlock('js')}>
                    <div class="flex items-center gap-2">JavaScript</div>
                </DropdownItem>
                <DropdownItem onClick={() => insertCodeBlock('diff')}>
                    <div class="flex items-center gap-2">Diff</div>
                </DropdownItem>
            </Dropdown>
            {/* Image */}
            <button onClick={insertImage} class="btn-icon" title="Image">
            <Image size={16} />
            </button>
            {/* Table Dropdown (Desktop) */}
            <Dropdown
              compact
              align="right"
              preserveFocus
              trigger={
                <button class="btn-icon" title="Table Options">
                  <Table size={16} />
                </button>
              }
            >
                <DropdownItem onClick={insertTable}>
                    <div class="flex items-center gap-2"><Plus size={16} /> Insert Table</div>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => call(addRowBeforeCommand.key)}>
                    <div class="flex items-center gap-2"><ArrowUp size={16} /> Row Above</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(addRowAfterCommand.key)}>
                    <div class="flex items-center gap-2"><ArrowDown size={16} /> Row Below</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(addColBeforeCommand.key)}>
                    <div class="flex items-center gap-2"><ArrowLeft size={16} /> Col Left</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(addColAfterCommand.key)}>
                    <div class="flex items-center gap-2"><ArrowRight size={16} /> Col Right</div>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => call(deleteSelectedCellsCommand.key)}>
                    <div class="flex items-center gap-2 text-primary"><Delete size={16} /> Delete Selected</div>
                </DropdownItem>
                <DropdownItem onClick={deleteTable}>
                    <div class="flex items-center gap-2 text-primary"><Trash size={16} /> Delete Table</div>
                </DropdownItem>
            </Dropdown>
            {/* Split Cell at Cursor */}
            <button onClick={splitCell} class="btn-icon" title={`Split Cell at Cursor (${splitShortcutHint})`}>
              <SquareSplitHorizontal size={16} />
            </button>
            {/* More Menu (Desktop) */}
            <Dropdown
              compact
              align="right"
              preserveFocus
              trigger={
                <button class="btn-icon" title="More Formatting">
                  <MoreHorizontal size={16} />
                </button>
              }
            >
                <DropdownItem onClick={insertVideo}>
                    <div class="flex items-center gap-2"><Video size={16} /> Video</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(toggleCaptionCommand.key)}>
                    <div class="flex items-center gap-2"><CaptionsIcon size={16} /> Caption</div>
                </DropdownItem>
            </Dropdown>
        </div>
      </div>
      </div>

      <div class="milkdown-editor-wrapper" ref={editorRef} />
    </div>
  );
};


export default MarkdownEditor;
