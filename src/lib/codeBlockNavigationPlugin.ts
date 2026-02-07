import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorState, Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Selection } from '@milkdown/kit/prose/state';

const codeBlockNavigationKey = new PluginKey('codeBlockNavigation');

// Check if cursor is at the end of a code block
function isAtEndOfCodeBlock(state: EditorState): boolean {
    const { $from } = state.selection;

    // Check if we're in a code block
    let inCodeBlock = false;
    let codeBlockDepth = -1;

    for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type.name === 'code_block') {
            inCodeBlock = true;
            codeBlockDepth = i;
            break;
        }
    }

    if (!inCodeBlock) return false;

    // Check if cursor is at the end of the code block content
    const endOfCodeBlock = $from.end(codeBlockDepth);
    const cursorPos = $from.pos;

    return cursorPos === endOfCodeBlock;
}

// Check if cursor is at the start of an empty paragraph that follows a code block
function isEmptyParaAfterCodeBlock(state: EditorState): { isValid: boolean; codeBlockEnd?: number } {
    const { $from } = state.selection;

    // Check if we're at the start of selection
    if ($from.pos !== state.selection.$to.pos) return { isValid: false };

    // Check if parent is a paragraph
    if ($from.parent.type.name !== 'paragraph') return { isValid: false };

    // Check if paragraph is empty
    if ($from.parent.content.size !== 0) return { isValid: false };

    // Check if we're at the start of the paragraph
    const paraStart = $from.start($from.depth);
    if ($from.pos !== paraStart) return { isValid: false };

    // Check if previous sibling is a code block
    const indexInParent = $from.index($from.depth - 1);
    if (indexInParent === 0) return { isValid: false };

    const prevNode = $from.node($from.depth - 1).child(indexInParent - 1);
    if (prevNode.type.name !== 'code_block') return { isValid: false };

    // Calculate the end position of the code block
    const codeBlockEnd = $from.before($from.depth) - 1;

    return { isValid: true, codeBlockEnd };
}

// Handle ArrowRight or ArrowDown at end of code block
function handleArrowOutOfCodeBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
    if (!isAtEndOfCodeBlock(state)) return false;

    const { $from } = state.selection;
    let codeBlockDepth = -1;

    for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type.name === 'code_block') {
            codeBlockDepth = i;
            break;
        }
    }

    // Get position after code block
    const afterCodeBlock = $from.after(codeBlockDepth);

    // Check if there's already content after the code block
    const doc = state.doc;
    if (afterCodeBlock < doc.content.size) {
        // There's content after, just move cursor there
        if (dispatch) {
            const tr = state.tr.setSelection(Selection.near(doc.resolve(afterCodeBlock)));
            dispatch(tr);
        }
        return true;
    }

    // No content after code block, insert a paragraph
    if (dispatch) {
        const paragraph = state.schema.nodes.paragraph.create();
        const tr = state.tr.insert(afterCodeBlock, paragraph);
        // Move cursor to the new paragraph
        const newPos = afterCodeBlock + 1;
        tr.setSelection(Selection.near(tr.doc.resolve(newPos)));
        dispatch(tr);
    }

    return true;
}

// Handle Backspace at start of empty paragraph after code block
function handleBackspaceAfterCodeBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
    const result = isEmptyParaAfterCodeBlock(state);
    if (!result.isValid || result.codeBlockEnd === undefined) return false;

    const { $from } = state.selection;
    const paraStart = $from.before($from.depth);
    const paraEnd = $from.after($from.depth);

    if (dispatch) {
        // Delete the empty paragraph
        const tr = state.tr.delete(paraStart, paraEnd);
        // Move cursor to end of code block
        tr.setSelection(Selection.near(tr.doc.resolve(result.codeBlockEnd)));
        dispatch(tr);
    }

    return true;
}

export const codeBlockNavigationPlugin = $prose(() => {
    return new Plugin({
        key: codeBlockNavigationKey,
        props: {
            handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
                const { state, dispatch } = view;

                // Handle ArrowRight and ArrowDown at end of code block
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    return handleArrowOutOfCodeBlock(state, dispatch);
                }

                // Handle Backspace at start of empty paragraph after code block
                if (event.key === 'Backspace') {
                    return handleBackspaceAfterCodeBlock(state, dispatch);
                }

                return false;
            },
        },
    });
});
