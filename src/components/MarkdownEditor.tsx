import { type Component, onMount, onCleanup, createEffect, createSignal } from "solid-js";
import { TextSelection } from "@milkdown/kit/prose/state"; // Standard state handling
import { actions, type CellData } from "../lib/store";

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
import { callCommand } from "@milkdown/kit/utils";
import { lift, wrapIn, setBlockType } from "@milkdown/kit/prose/commands"; // Re-exported from kit
import { undo as milkUndo, redo as milkRedo } from "@milkdown/kit/prose/history"; // Import standard history commands
import { undoDepth, redoDepth } from "prosemirror-history"; // Directly import form prosemirror-history (Milkdown uses this internally)

// UI Components
import { Bold, Italic, Quote, Heading, ChevronDown, Link2, List, ListOrdered, Code, SquareCode, Image, Table, MoreHorizontal, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash, Plus, Delete, CaptionsIcon, Video, TextAlignCenter, TextAlignEnd, TextAlignStart } from "lucide-solid";
import Dropdown, { DropdownItem, DropdownDivider, DropdownNested } from "./ui/Dropdown";
import { sectionScopePlugin } from "../lib/sectionScopePlugin";
import { codeBlockNavigationPlugin } from "../lib/codeBlockNavigationPlugin";
import { captionMark, toggleCaptionCommand } from "../lib/captionPlugin";
import { videoEmbed } from "../lib/videoEmbedPlugin";
import { textAlign } from "../lib/textAlignPlugin";
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
  const [currentAlign, setCurrentAlign] = createSignal<string | null>(null);

  /** Read the textAlign attr from the block node at the cursor. */
  const syncAlignState = (view: any) => {
    const { $from } = view.state.selection;
    const node = $from.parent;
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      setCurrentAlign(node.attrs.textAlign || null);
    } else {
      setCurrentAlign(null);
    }
  };

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
               if (view) syncAlignState(view);
            })
            .selectionUpdated((_ctx, selection) => {
               const node = selection.$from.parent;
               if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                 setCurrentAlign(node.attrs.textAlign || null);
               } else {
                 setCurrentAlign(null);
               }
            });
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
      .use(textAlign)
      .create()
      .then((editor) => {
        editorInstance = editor;
        
        // Focus the editor and initialize capabilities
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (view) {
              // Restore Selection State if available
              if (props.cell.editorState) {
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
              } else if (props.initialClickCoords) {
                  // Place cursor at the double-click position
                  try {
                      const pos = view.posAtCoords({ left: props.initialClickCoords.left, top: props.initialClickCoords.top });
                      if (pos) {
                          const sel = TextSelection.near(view.state.doc.resolve(pos.pos));
                          view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
                      }
                  } catch (e) {
                      // Fall through — cursor stays at default position
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
    editorInstance?.action(callCommand(command, payload));
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
    });
  };

  const cycleTextAlign = () => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const { $from } = state.selection;

      const node = $from.parent;
      if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;

      const currentAlign = node.attrs.textAlign || null;
      const CYCLE: (string | null)[] = [null, 'center', 'right'];
      const idx = CYCLE.indexOf(currentAlign);
      const nextAlign = CYCLE[(idx + 1) % CYCLE.length];

      const pos = $from.before($from.depth);
      dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: nextAlign }));
      setCurrentAlign(nextAlign);
    });
  };

  const deleteTable = () => {
    editorInstance?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const { $from } = state.selection;
      
      for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type.name === 'table') {
          const start = $from.start(i) - 1;
          const end = $from.end(i) + 1;
          dispatch(state.tr.delete(start, end));
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
      call(insertTableCommand.key, { row: 3, col: 3 });
  };

  const insertCodeBlock = (language?: string) => {
    if (language) {
      call(createCodeBlockCommand.key, language);
    } else {
      call(createCodeBlockCommand.key);
    }
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
        <button onClick={() => call(toggleStrongCommand.key)} class="btn-icon" title="Bold">
          <Bold size={16} />
        </button>
        {/* Italic */}
        <button onClick={() => call(toggleEmphasisCommand.key)} class="btn-icon" title="Italic">
          <Italic size={16} />
        </button>
        
        <div class="w-px h-4 bg-foreground/30 mx-1 hidden sm:block"></div>

        {/* Header Split Button */}
        <div class="flex items-center gap-0">
          <button 
            onClick={cycleHeader} 
            class="btn-icon rounded-r-none hover:z-10 -mr-px" 
            title="Cycle Header Level"
          >
            <Heading size={16} />
          </button>
          <Dropdown
            compact
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

        {/* Text Alignment */}
        <button onClick={cycleTextAlign} class="btn-icon" title="Cycle Text Alignment">
          <span class="flex transition-transform duration-150">
            {currentAlign() === 'center' ? <TextAlignCenter size={16} /> : currentAlign() === 'right' ? <TextAlignEnd size={16} /> : <TextAlignStart size={16} />}
          </span>
        </button>

        {/* Mobile "More" Menu (Visible on mobile only) */}
        <div class="flex sm:hidden items-center">
             <Dropdown
                compact
                usePortal={true}
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
                <DropdownItem onClick={() => call(wrapInBulletListCommand.key)}>
                    <div class="flex items-center gap-2"><List size={16} /> Bullet List</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(wrapInOrderedListCommand.key)}>
                    <div class="flex items-center gap-2"><ListOrdered size={16} /> Numbered List</div>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={toggleQuote}>
                    <div class="flex items-center gap-2"><Quote size={16} /> Quote</div>
                </DropdownItem>
                <DropdownItem onClick={() => call(toggleInlineCodeCommand.key)}>
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
            <button onClick={() => call(wrapInBulletListCommand.key)} class="btn-icon" title="Bullet List">
            <List size={16} />
            </button>
            {/* Numbered List */}
            <button onClick={() => call(wrapInOrderedListCommand.key)} class="btn-icon" title="Numbered List">
            <ListOrdered size={16} />
            </button>
            <div class="w-px h-4 bg-foreground/30 mx-1"></div>
            {/* Quote toggle */}
            <button onClick={toggleQuote} class="btn-icon" title="Quote">
            <Quote size={16} />
            </button>
            {/* Inline Code */}
            <button onClick={() => call(toggleInlineCodeCommand.key)} class="btn-icon" title="Inline Code">
            <Code size={16} />
            </button>
            {/* Code Block Dropdown */}
            <Dropdown
              compact
              align="right"
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
            {/* More Menu (Desktop) */}
            <Dropdown
              compact
              align="right"
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
