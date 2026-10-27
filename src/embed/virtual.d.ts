// Supplied by the package build (vite/component-build.ts): the kernel worker
// as one classic script, started from a Blob so no bundler has to handle it.
declare module "virtual:pynote-worker" {
  const source: string;
  export default source;
}

// Supplied by the package build: the @font-face rules of the installed KaTeX,
// with their font files on the CDN (katexFontFaces in cdn.ts).
declare module "virtual:pynote-katex-font-faces" {
  const faces: string;
  export default faces;
}

// The package version, defined by the package build.
declare const __PYNOTE_VERSION__: string | undefined;
