// Files an embedded page loads from jsDelivr: the stylesheets of the font
// families PyNote bundles in the app (the same fontsource files), and KaTeX's
// fonts for math. Font faces only work at page level, and loading them from
// the CDN keeps the package small; a browser downloads only the faces a page
// uses. Versions match the installed packages (checked by cdn.test.ts).

const CDN = "https://cdn.jsdelivr.net/npm/";

const FONT_PACKAGES: Record<string, string> = {
  "JetBrains Mono Variable": "@fontsource-variable/jetbrains-mono@5.2.8",
  "Roboto Mono Variable": "@fontsource-variable/roboto-mono@5.2.8",
  "Atkinson Hyperlegible Mono Variable": "@fontsource-variable/atkinson-hyperlegible-mono@5.2.5",
  "Inconsolata Variable": "@fontsource-variable/inconsolata@5.2.8",
  "IBM Plex Mono": "@fontsource/ibm-plex-mono@5.2.7",
  "Source Code Pro Variable": "@fontsource-variable/source-code-pro@5.2.7",
  "Google Sans Code": "@fontsource/google-sans-code@5.2.4",
  "DM Sans Variable": "@fontsource-variable/dm-sans@5.2.8",
};

export const KATEX_PACKAGE = "katex@0.16.45";

export const FONT_PACKAGE_SPECS: Readonly<Record<string, string>> = FONT_PACKAGES;

export const fontStylesheet = (family: string): string | null => (FONT_PACKAGES[family] ? `${CDN}${FONT_PACKAGES[family]}/index.css` : null);

/** The folder of KaTeX's font files. */
export const KATEX_FONTS = `${CDN}${KATEX_PACKAGE}/dist/fonts/`;

/** The @font-face rules of KaTeX's stylesheet (katex.min.css), with their font files on the CDN. */
export const katexFontFaces = (stylesheet: string): string =>
  (stylesheet.match(/@font-face\s*\{[^}]*\}/g) ?? []).join("\n").replace(/url\((["']?)fonts\//g, `url($1${KATEX_FONTS}`);
