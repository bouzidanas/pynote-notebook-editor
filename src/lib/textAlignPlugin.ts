/**
 * Text Alignment Plugin for Milkdown
 *
 * Adds text-align support (left/center/right) to paragraph and heading nodes.
 *
 * Markdown serialization uses HTML comment markers that precede the block:
 *
 *   <!-- align:center -->
 *   This paragraph is centered.
 *
 * This preserves inline markdown formatting inside aligned blocks (bold,
 * italic, code, links, etc.) because the paragraph content remains standard
 * markdown — only the comment annotation is added.
 *
 * The remark plugin detects these comments and annotates the following
 * paragraph/heading node with `data.textAlign`.  The extended schemas then
 * read that annotation when building ProseMirror nodes, and emit the
 * comment back when serialising to markdown.
 */

import { $remark } from "@milkdown/kit/utils";
import { paragraphSchema, headingSchema } from "@milkdown/kit/preset/commonmark";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";

// ─── Remark Plugin: Detect <!-- align:left|center|right --> markers ─────

const ALIGN_RE = /^<!--\s*align:(left|center|right)\s*-->$/;

/**
 * Recursively walk the mdast tree and convert alignment comment + block
 * pairs into annotated blocks (paragraph/heading with data.textAlign).
 */
function processAlignComments(node: any) {
    if (!node.children) return;

    // Recurse first so nested structures (blockquotes, list items) work
    for (const child of node.children) {
        processAlignComments(child);
    }

    const newChildren: any[] = [];
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];

        if (child.type === 'html' && typeof child.value === 'string') {
            const match = child.value.trim().match(ALIGN_RE);
            if (match && i + 1 < node.children.length) {
                const next = node.children[i + 1];
                if (next.type === 'paragraph' || next.type === 'heading') {
                    if (!next.data) next.data = {};
                    next.data.textAlign = match[1];
                    continue; // skip the comment node
                }
            }
        }

        newChildren.push(child);
    }

    node.children = newChildren;
}

export const remarkTextAlign = $remark(
    'remarkTextAlign',
    () => () => (tree: any) => {
        processAlignComments(tree);
    }
);

// ─── Extend Paragraph Schema ───────────────────────────────────────────

export const extendedParagraph = paragraphSchema.extendSchema((prev) => (ctx) => {
    const original = prev(ctx);
    return {
        ...original,

        attrs: {
            ...original.attrs,
            textAlign: { default: null },
        },

        toDOM: (node: any) => {
            const dom = original.toDOM!(node) as unknown as any[];
            if (node.attrs.textAlign) {
                dom[1] = { ...(dom[1] || {}), style: `text-align: ${node.attrs.textAlign}` };
            }
            return dom as any;
        },

        parseDOM: [
            // High-priority rule for pasted HTML with text-align style
            {
                tag: 'p[style*="text-align"]',
                getAttrs: (dom: HTMLElement) => ({
                    textAlign: dom.style?.textAlign || null,
                }),
                priority: 60,
            },
            ...(original.parseDOM || []),
        ],

        parseMarkdown: {
            match: (node: any) => node.type === 'paragraph',
            runner: (state: any, node: any, type: any) => {
                const textAlign = node.data?.textAlign || null;
                state.openNode(type, { textAlign });
                if (node.children) state.next(node.children);
                else state.addText((node.value || '') as string);
                state.closeNode();
            },
        },

        toMarkdown: {
            match: (node: any) => node.type.name === 'paragraph',
            runner: (state: any, node: any) => {
                if (node.attrs.textAlign) {
                    state.addNode('html', undefined, `<!-- align:${node.attrs.textAlign} -->`);
                }
                // Delegate to original runner to preserve all edge-case handling
                (original.toMarkdown as any).runner(state, node);
            },
        },
    };
});

// ─── Extend Heading Schema ─────────────────────────────────────────────

export const extendedHeading = headingSchema.extendSchema((prev) => (ctx) => {
    const original = prev(ctx);
    return {
        ...original,

        attrs: {
            ...original.attrs,
            textAlign: { default: null },
        },

        toDOM: (node: any) => {
            const dom = original.toDOM!(node) as unknown as any[];
            if (node.attrs.textAlign) {
                dom[1] = { ...(dom[1] || {}), style: `text-align: ${node.attrs.textAlign}` };
            }
            return dom as any;
        },

        parseDOM: [
            // High-priority rules for pasted HTML headings with text-align
            ...[1, 2, 3, 4, 5, 6].map(level => ({
                tag: `h${level}[style*="text-align"]`,
                getAttrs: (dom: HTMLElement) => ({
                    level,
                    id: dom.id || '',
                    textAlign: dom.style?.textAlign || null,
                }),
                priority: 60,
            })),
            ...(original.parseDOM || []),
        ],

        parseMarkdown: {
            match: (node: any) => node.type === 'heading',
            runner: (state: any, node: any, type: any) => {
                const depth = node.depth as number;
                const textAlign = node.data?.textAlign || null;
                state.openNode(type, { level: depth, textAlign });
                state.next(node.children);
                state.closeNode();
            },
        },

        toMarkdown: {
            match: (node: any) => node.type.name === 'heading',
            runner: (state: any, node: any) => {
                if (node.attrs.textAlign) {
                    state.addNode('html', undefined, `<!-- align:${node.attrs.textAlign} -->`);
                }
                // Delegate to original runner (preserves serializeText behaviour)
                (original.toMarkdown as any).runner(state, node);
            },
        },
    };
});

// ─── Plugin array for registration ──────────────────────────────────────

export const textAlign = [
    remarkTextAlign,
    extendedParagraph,
    extendedHeading,
].flat() as MilkdownPlugin[];
