import type { ComboBoxOption } from "../ui/ComboBox";

export const FONT_OPTIONS: ComboBoxOption[] = [
  { label: "JetBrains Mono",              value: '"JetBrains Mono Variable", monospace' },
  { label: "Roboto Mono",                 value: '"Roboto Mono Variable", monospace' },
  { label: "Atkinson Hyperlegible Mono",  value: '"Atkinson Hyperlegible Mono Variable", monospace' },
  { label: "Inconsolata",                 value: '"Inconsolata Variable", monospace' },
  { label: "IBM Plex Mono",               value: '"IBM Plex Mono", monospace' },
  { label: "Source Code Pro",             value: '"Source Code Pro Variable", monospace' },
  { label: "Google Sans Code",            value: '"Google Sans Code", monospace' },
];

// Collapsed/expanded state for the theme dialog sections.
// Defaults: everything expanded except the three Advanced sections.
export const SECTION_DEFAULTS: Record<string, boolean> = {
  presets: true,
  colors: true,
  mdTypography: true,
  codeTypography: true,
  syntaxHighlighting: true,
  spacing: true,
  borderRadius: true,
  advUiBorder: false,
  advUiTypography: false,
  advPynoteUi: false,
  advSyntaxColors: false,
  advBorders: false,
  advShadows: false,
  advCodeBlock: false,
  layout: true,
  markdown: true,
};

export const SECTIONS_STORAGE_KEY = "pynote-theme-sections";

export const loadSectionState = (): Record<string, boolean> => {
  try {
    const stored = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (stored) return { ...SECTION_DEFAULTS, ...JSON.parse(stored) };
  } catch (e) {
    console.warn("Failed to load theme section state:", e);
  }
  return { ...SECTION_DEFAULTS };
};
