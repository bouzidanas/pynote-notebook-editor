import katex, { type KatexOptions } from "katex";
import { mathExtensions } from "./markdown-math";

// PyNote's markdown math (see markdown-math.ts) rendered with KaTeX, for the
// markdown cell and output renderers. Inline and block math pass `trust` (as
// marked-katex-extension did); the displayMath form never did.
export const katexMathExtensions = (extra: KatexOptions = {}) =>
  mathExtensions((token) =>
    katex.renderToString(token.text, {
      throwOnError: false,
      output: "html",
      displayMode: token.displayMode,
      ...(token.type === "displayMath" ? {} : { trust: true }),
      ...extra,
    }),
  );
