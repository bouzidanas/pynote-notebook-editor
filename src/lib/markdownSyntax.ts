import { remarkStringifyOptionsCtx, type Editor } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { RemarkPluginRaw } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";
import { captionMark } from "./captionPlugin";
import { math, mathRemark } from "./mathPlugin";
import type { MdNode } from "./mathSyntax";
import { videoEmbed } from "./videoEmbedPlugin";

// Milkdown puts an HTML block in a paragraph of its own (its schema has no
// node for one) in the document, a quote or a list item, but not in a
// footnote definition, where it then leaves out the whole definition
// ("[^a]: $$\n    x\n    $$\n    <a>"), and an edit writes the cell back
// without it. There it gets a paragraph of its own too.
function footnoteHtml(node: MdNode): void {
  node.children?.forEach(footnoteHtml);
  if (node.type === "footnoteDefinition") {
    node.children = node.children?.map((child) => (child.type === "html" ? { type: "paragraph", children: [child], position: child.position } : child));
  }
}
const footnoteHtmlRemark = $remark("remarkPynoteFootnoteHtml", () => (() => footnoteHtml) as unknown as RemarkPluginRaw<unknown>);

/**
 * The Markdown a markdown cell's editor reads and writes: CommonMark and GFM,
 * PyNote's math, captions and video embeds. The editor and its tests both
 * build on this, so the tests read and write Markdown as the editor does.
 */
export const markdownSyntax = (editor: Editor): Editor =>
  editor
    .config((ctx) => {
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
    })
    .use(mathRemark) // before commonmark (see mathRemark)
    .use(commonmark) // Foundation (Paragraphs, Bold, etc.)
    .use(gfm) // Extensions (Tables, Task Lists)
    .use(footnoteHtmlRemark) // after mathRemark, which can read the document again
    .use(math)
    .use(captionMark)
    .use(videoEmbed);
