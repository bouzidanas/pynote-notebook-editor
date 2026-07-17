// Runtime Google Fonts loader for theme font families.
//
// The theme dialog's font inputs accept any CSS font-family string. The
// dropdown fonts ship with the build (fontsource imports in index.css); any
// other family is fetched from Google Fonts at runtime so themed notebooks
// render the same on machines that don't have the font installed. Callers
// that apply a whole theme at once (file open, session restore) await
// loadThemeFonts() before applying it, so the font lands in the same paint
// as the rest of the styling instead of swapping in late.

import { FONT_OPTIONS } from "../components/theme-dialog/constants";

// First family in a font-family stack, unquoted. Null for empty stacks.
export function primaryFamily(stack: string): string | null {
  const first = (stack || "").split(",")[0].trim().replace(/^["']|["']$/g, "").trim();
  return first || null;
}

const GENERIC_FAMILIES = new Set([
  "monospace", "sans-serif", "serif", "system-ui", "cursive", "fantasy",
  "math", "emoji", "fangsong", "ui-monospace", "ui-sans-serif", "ui-serif",
  "ui-rounded", "inherit", "initial", "unset", "revert",
]);

// Families bundled with the app. Derived from the theme dialog's dropdown
// options so the two stay in sync.
const BUNDLED_FAMILIES = new Set(
  FONT_OPTIONS.map((o) => primaryFamily(o.value)).filter(Boolean) as string[]
);

// One attempt per family per page load. Failures are cached too, since the
// request 400s for families Google doesn't have (system fonts, typos) and
// retrying won't change that.
const attempted = new Map<string, Promise<void>>();

interface ThemeFontFields {
  font?: string;
  codeTypography?: { fontFamily?: string };
  uiTypography?: { fontFamily?: string };
}

// Non-bundled, non-generic families a theme references.
const collectFamilies = (theme: ThemeFontFields): Set<string> => {
  const families = new Set<string>();
  for (const stack of [theme.font, theme.codeTypography?.fontFamily, theme.uiTypography?.fontFamily]) {
    const family = primaryFamily(stack || "");
    if (!family || GENERIC_FAMILIES.has(family.toLowerCase()) || BUNDLED_FAMILIES.has(family)) continue;
    families.add(family);
  }
  return families;
};

// Session-scoped cache of fetched @font-face CSS, so reloads in the same tab
// (refresh, the no-handle file-open path) skip the network round-trip
// entirely. A "!" entry means Google definitively doesn't have the family
// (HTTP error, not a network failure), so don't ask again this session.
const CACHE_PREFIX = "pynote-gfont-";
const NOT_AVAILABLE = "!";
const readCssCache = (family: string): string | null => {
  try { return sessionStorage.getItem(CACHE_PREFIX + family); } catch { return null; }
};
const writeCssCache = (family: string, css: string) => {
  try { sessionStorage.setItem(CACHE_PREFIX + family, css); } catch { /* quota; skip */ }
};

const injectAndLoad = async (family: string, css: string): Promise<void> => {
  const style = document.createElement("style");
  style.setAttribute("data-google-font", family);
  style.textContent = css;
  document.head.appendChild(style);
  // Registering the font faces doesn't download anything by itself, so
  // kick the fetches now and resolve once the family is usable. The font
  // binaries themselves come from the browser HTTP cache on repeat loads
  // (gstatic serves them with year-long max-age).
  await Promise.allSettled([
    document.fonts.load(`400 1em "${family}"`),
    document.fonts.load(`700 1em "${family}"`),
    document.fonts.load(`italic 400 1em "${family}"`),
  ]);
};

// Boot fast path. When every family the theme needs is already in the session
// cache, inject the CSS synchronously (so the faces are registered before
// first paint) and let the binaries activate from the browser cache in
// parallel instead of holding up render. font-display: block covers the frame
// or two of disk-cache activation with invisible text rather than a visible
// fallback-font swap. Returns false when some family needs a network fetch,
// in which case the caller should use loadThemeFonts and wait.
export const injectCachedThemeFonts = (theme: ThemeFontFields): boolean => {
  if (typeof document === "undefined" || !document.fonts) return true;
  for (const family of collectFamilies(theme)) {
    if (attempted.has(family)) continue;
    const cached = readCssCache(family);
    if (cached === null) return false;
    if (cached === NOT_AVAILABLE) {
      attempted.set(family, Promise.resolve());
      continue;
    }
    // Registration only, no explicit document.fonts.load: the first layout
    // that uses the family kicks off the (browser-cached) fetch by itself,
    // and font-display: block hides activation. Keeps pre-render work minimal.
    const style = document.createElement("style");
    style.setAttribute("data-google-font", family);
    style.textContent = cached.replace(/font-display:\s*swap/g, "font-display: block");
    document.head.appendChild(style);
    attempted.set(family, Promise.resolve());
  }
  return true;
};

const fetchAndRegister = async (family: string): Promise<void> => {
  const cached = readCssCache(family);
  if (cached === NOT_AVAILABLE) return;
  if (cached) return injectAndLoad(family, cached);

  const name = encodeURIComponent(family).replace(/%20/g, "+");
  // Variable fonts first (full weight range), then common static weights,
  // then regular only. Google rejects axis ranges a family doesn't support.
  const candidates = [
    `family=${name}:ital,wght@0,100..900;1,100..900`,
    `family=${name}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700`,
    `family=${name}`,
  ];
  let sawResponse = false;
  for (const query of candidates) {
    try {
      const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`);
      sawResponse = true;
      if (!res.ok) continue;
      const css = await res.text();
      writeCssCache(family, css);
      return injectAndLoad(family, css);
    } catch {
      // Network error. Try the next candidate, then give up silently and let
      // the font stack's fallback keep rendering as before.
    }
  }
  // Every candidate got an HTTP error: the family isn't on Google Fonts.
  // Network errors don't count; those should retry on the next page load.
  if (sawResponse) writeCssCache(family, NOT_AVAILABLE);
};

const loadFamily = (family: string): Promise<void> => {
  let pending = attempted.get(family);
  if (!pending) {
    pending = fetchAndRegister(family);
    attempted.set(family, pending);
  }
  return pending;
};

// Load every non-bundled font family a theme references. Resolves when the
// fonts are ready, or after timeoutMs so a dead network can't hold the theme
// hostage (a late font still swaps in via font-display: swap).
export const loadThemeFonts = (theme: ThemeFontFields, timeoutMs = 2500): Promise<void> => {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const families = collectFamilies(theme);
  if (families.size === 0) return Promise.resolve();
  const all = Promise.all([...families].map(loadFamily)).then(() => undefined);
  // Offline: kick the attempts off (they fail fast and get retried on the
  // next page load) but don't make callers wait on a network we don't have.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
  const cap = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([all, cap]);
};

// Debounced catch-all for live theme edits. The dialog's font inputs fire on
// every keystroke, so wait for the name to settle before hitting Google.
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
export const scheduleThemeFontLoad = (theme: ThemeFontFields) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void loadThemeFonts(theme), 600);
};
