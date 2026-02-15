/**
 * Caption Mark Plugin for Milkdown
 * 
 * Provides a `<span class="caption">` inline mark that survives roundtrip editing.
 * Used for figure/table captions that visually hug adjacent block elements via CSS.
 * 
 * Markdown serialization: `<span class="caption">text</span>`
 * The remark plugin parses the HTML span into a custom 'caption' mdast node,
 * and a stringify handler converts it back to the raw HTML span.
 */

import { $markSchema, $markAttr, $command, $remark } from "@milkdown/kit/utils";
import { toggleMark } from "@milkdown/kit/prose/commands";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";

// ─── Remark Plugin: Parse <span class="caption">...</span> in mdast ────────

export const remarkCaptionPlugin = $remark(
    'remarkCaption',
    () => () => (tree: any) => {
        visitChildren(tree);
    }
);

/**
 * Recursively visit nodes with children and merge
 * <span class="caption">...</span> HTML sequences into caption nodes.
 */
function visitChildren(node: any) {
    if (!node.children) return;

    // First recurse into children
    for (const child of node.children) {
        visitChildren(child);
    }

    // Then process this node's children for caption patterns
    const children = node.children;
    const newChildren: any[] = [];
    let i = 0;

    while (i < children.length) {
        const child = children[i];

        // Look for opening <span class="caption">
        if (
            child.type === 'html' &&
            typeof child.value === 'string' &&
            /^<span\s+class\s*=\s*"caption"\s*>$/i.test(child.value.trim())
        ) {
            // Collect content until closing </span>
            const captionChildren: any[] = [];
            let j = i + 1;
            let found = false;

            while (j < children.length) {
                const next = children[j];
                if (
                    next.type === 'html' &&
                    typeof next.value === 'string' &&
                    /^<\/span>$/i.test(next.value.trim())
                ) {
                    found = true;
                    j++;
                    break;
                }
                captionChildren.push(next);
                j++;
            }

            if (found) {
                newChildren.push({
                    type: 'caption',
                    children: captionChildren,
                });
                i = j;
                continue;
            }
        }

        newChildren.push(child);
        i++;
    }

    node.children = newChildren;
}

// ─── Mark Attribute (for extensibility) ─────────────────────────────────────

export const captionAttr = $markAttr('caption');

// ─── Mark Schema ────────────────────────────────────────────────────────────

export const captionSchema = $markSchema('caption', (ctx) => ({
    // ProseMirror: render in editor
    toDOM: (mark) => [
        'span',
        { ...ctx.get(captionAttr.key)(mark), class: 'caption' },
        0, // content hole
    ],

    // ProseMirror: parse from pasted/dropped HTML
    parseDOM: [
        { tag: 'span.caption' },
    ],

    // Remark AST → ProseMirror (loading markdown)
    parseMarkdown: {
        match: (node: any) => node.type === 'caption',
        runner: (state: any, node: any, markType: any) => {
            state.openMark(markType);
            state.next(node.children);
            state.closeMark(markType);
        },
    },

    // ProseMirror → Remark AST (saving markdown)
    toMarkdown: {
        match: (mark: any) => mark.type.name === 'caption',
        runner: (state: any, mark: any) => {
            state.withMark(mark, 'caption');
        },
    },
}));

// ─── Toggle Command ─────────────────────────────────────────────────────────

export const toggleCaptionCommand = $command(
    'ToggleCaption',
    (ctx) => () => toggleMark(captionSchema.type(ctx))
);

// ─── Plugin array for registration ──────────────────────────────────────────

export const captionMark: MilkdownPlugin[] = [
    remarkCaptionPlugin,
    captionAttr,
    captionSchema,
    toggleCaptionCommand,
].flat();
