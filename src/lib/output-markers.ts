// Control-character markers that pynote_ui and the matplotlib hook print to
// stdout around structured output, so it streams to the right cell and
// interleaves with prints. Self-closing pattern: \x02TYPE\x02content\x02/TYPE\x02.
// The Python side defines the same strings (src/lib/python-runtime/).
export const MARKER_UI_START = "\x02PYNOTE_UI\x02";
export const MARKER_UI_END = "\x02/PYNOTE_UI\x02";
export const MARKER_MD_STYLED_START = "\x02PYNOTE_MD_STYLED\x02";
export const MARKER_MD_STYLED_END = "\x02/PYNOTE_MD_STYLED\x02";
export const MARKER_MD_PLAIN_START = "\x02PYNOTE_MD_PLAIN\x02";
export const MARKER_MD_PLAIN_END = "\x02/PYNOTE_MD_PLAIN\x02";
export const MARKER_IMG_START = "\x02PYNOTE_IMG\x02";
export const MARKER_IMG_END = "\x02/PYNOTE_IMG\x02";

// The mimebundle key a cell's result uses for a pynote_ui component.
export const UI_MIME = "application/vnd.pynote.ui+json";
