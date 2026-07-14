// Pure helpers backing the "split markdown cell at cursor" feature.
//
// These are intentionally framework-free so they can be unit-tested without
// booting Milkdown / ProseMirror / SolidJS. The MarkdownEditor component is
// the sole consumer.

export interface SplitResult {
  /** Markdown for the first cell: exactly the text before the cursor, untouched. */
  beforeContent: string;
  /** Markdown for the second cell: exactly the text after the cursor, untouched. */
  afterContent: string;
  /**
   * Where the user's cursor should land after the split.
   * `true`  → end of the first (original) cell.
   * `false` → start of the second (new) cell.
   *
   * Decision rule: whichever side has the closest non-whitespace character
   * to the cursor wins. Whitespace (spaces, newlines, tabs) is treated as
   * separator, not content. Ties go to the first cell, which matches the
   * "Enter creates a break, cursor stays where you were" mental model.
   */
  focusFirst: boolean;
}

/**
 * Compute the two halves of a split and where the cursor should land.
 *
 * @param beforeMd Markdown serialized from doc-start up to the cursor.
 * @param afterMd  Markdown serialized from the cursor to doc-end.
 */
export function computeSplit(beforeMd: string, afterMd: string): SplitResult {
  // Distance from the cursor to the nearest non-whitespace character on
  // each side. We measure this on the un-trimmed input so the decision
  // reflects the user's actual cursor neighborhood.
  const leftDist = beforeMd.length - beforeMd.replace(/\s+$/, "").length;
  const rightDist = afterMd.length - afterMd.replace(/^\s+/, "").length;
  const focusFirst = leftDist <= rightDist;

  // Content is split verbatim at the cursor, no trimming. The user has
  // explicitly asked that surrounding whitespace be preserved so that
  // round-tripping through a split is content-preserving.
  return {
    beforeContent: beforeMd,
    afterContent: afterMd,
    focusFirst,
  };
}

/**
 * Predicate identifying the split-cell keyboard shortcut.
 *
 * Shortcut: `Mod+Shift+Enter` (Cmd on macOS, Ctrl elsewhere).
 *
 * Chosen because:
 *   - Not bound by Chrome / Firefox / Safari.
 *   - Not used elsewhere in the app.
 *   - Naturally extends the "Enter = break" convention.
 */
export function isSplitShortcut(e: KeyboardEvent): boolean {
  if (e.key !== "Enter") return false;
  if (!e.shiftKey) return false;
  if (e.altKey) return false;
  return e.metaKey || e.ctrlKey;
}
