import { remarkStringifyOptionsCtx, type Editor } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { captionMark } from "./captionPlugin";
import { videoEmbed } from "./videoEmbedPlugin";

/**
 * The Markdown a markdown cell's editor reads and writes: CommonMark and GFM,
 * captions and video embeds. The editor and its tests both build on this, so
 * the tests read and write Markdown as the editor does.
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
    .use(commonmark) // Foundation (Paragraphs, Bold, etc.)
    .use(gfm) // Extensions (Tables, Task Lists)
    .use(captionMark)
    .use(videoEmbed);
