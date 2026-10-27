// Cell ids follow the nbformat 4.5 rule: 1 to 64 characters from
// [a-zA-Z0-9-_]. PyNote keeps ids stable across save and open, because the
// undo history saved with a notebook refers to cells by id.

const CELL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export const isValidCellId = (id: unknown): id is string =>
  typeof id === "string" && CELL_ID_PATTERN.test(id);

// New ids are 8 lowercase hex characters (32 random bits), the same shape
// Jupyter generates, which keeps text formats that show ids (.pynote, the
// .py/.md pair) readable. The bits come from crypto.getRandomValues, which
// every page has: crypto.randomUUID exists only in secure contexts (HTTPS or
// localhost), and embedded cells also run on plain-HTTP sites (an intranet,
// a dev server opened from a phone on the LAN). `taken` guards against the
// (astronomically unlikely) collision within one notebook.
export const newCellId = (taken?: ReadonlySet<string>): string => {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (!taken || !taken.has(id)) return id;
  }
};

/**
 * Final ids for cells read from a text file: a valid id that appears once is
 * kept, every other cell (no id, or an id several cells share) gets a new
 * one. Kept ids are reserved first, so a new id never collides with a later
 * cell's. `line` locates each cell in the file for the warnings.
 */
export const assignCellIds = <T extends { id?: string; line: number }>(
  cells: T[],
  warnings: string[],
): Array<Omit<T, "id" | "line"> & { id: string }> => {
  const counts = new Map<string, number>();
  for (const c of cells) if (c.id) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const taken = new Set([...counts].filter(([, n]) => n === 1).map(([id]) => id));
  return cells.map(({ id, line, ...cell }) => {
    let final = id;
    if (!final || counts.get(final) !== 1) {
      if (final) warnings.push(`Line ${line}: cell id ${final} appears more than once; this cell got a new id.`);
      final = newCellId(taken);
      taken.add(final);
    }
    return { id: final, ...cell };
  });
};
