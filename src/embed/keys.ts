// Keys typed in a cell stay in the cell. A key event leaves a shadow root
// retargeted to its host, so a page's check for "the reader is typing in a
// field" sees no field, and its shortcuts ("/" or "s" for search, arrows for
// slides) would take the keys a reader types into code or a widget. What goes
// on is what goes on from a text field: keys the cell leaves alone that are
// not typing (Escape and Tab, to close a dialog or move on; shortcuts with
// Ctrl or Cmd, such as Ctrl+K for a site's search).

/** The key events a cell's shadow root keeps from the page (keepTypingInCell). */
export const KEY_EVENTS = ["keydown", "keypress", "keyup"] as const;

const isField = (target: EventTarget | undefined): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));

/** Listens on a cell's shadow root, where a key event goes on to the page or stops. */
export function keepTypingInCell(event: Event): void {
  const e = event as KeyboardEvent;
  if (!isField(e.composedPath()[0])) return;
  const shortcut = (e.ctrlKey || e.metaKey) && !e.getModifierState("AltGraph");
  if (!e.defaultPrevented && (shortcut || e.key === "Escape" || e.key === "Tab")) return;
  e.stopPropagation();
}
