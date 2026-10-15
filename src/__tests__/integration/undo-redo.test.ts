import { describe, test, expect, beforeEach } from 'vitest';
import { actions, notebookStore } from '../../lib/store';
import type { CellData } from '../../lib/store';

beforeEach(() => {
  // Start with a clean notebook
  actions.loadNotebook([], 'test.ipynb');
});

describe('global undo/redo roundtrip', () => {
  test('add cell → undo removes it → redo restores it', () => {
    actions.addCell('code');
    const addedId = notebookStore.cells[0].id;
    expect(notebookStore.cells).toHaveLength(1);

    actions.undo();
    expect(notebookStore.cells).toHaveLength(0);

    actions.redo();
    expect(notebookStore.cells).toHaveLength(1);
    // The restored cell has the same ID
    expect(notebookStore.cells[0].id).toBe(addedId);
  });

  test('delete cell → undo restores with original content', () => {
    // Seed a cell with content via loadNotebook
    const seed: CellData = { id: 'md-1', type: 'markdown', content: 'Hello **world**' };
    actions.loadNotebook([seed], 'test.ipynb');
    expect(notebookStore.cells).toHaveLength(1);

    actions.deleteCell('md-1');
    expect(notebookStore.cells).toHaveLength(0);

    actions.undo();
    expect(notebookStore.cells).toHaveLength(1);
    expect(notebookStore.cells[0].content).toBe('Hello **world**');
    expect(notebookStore.cells[0].id).toBe('md-1');
  });

  test('delete cell → undo restores its metadata too (view and run settings)', () => {
    const seed: CellData = {
      id: 'code-1',
      type: 'code',
      content: 'a = "x | y" \\ 2',
      metadata: { pynote: { codeview: { showCode: false }, autorun: false, placeholder: 'Setup | hidden \\ here' } },
    };
    actions.loadNotebook([seed], 'test.ipynb');

    actions.deleteCell('code-1');
    actions.undo();
    expect(notebookStore.cells[0]).toMatchObject({ id: 'code-1', type: 'code', content: seed.content, metadata: seed.metadata });

    // Redo deletes it again, and a second undo brings back the same cell.
    actions.redo();
    expect(notebookStore.cells).toHaveLength(0);
    actions.undo();
    expect(notebookStore.cells[0].content).toBe(seed.content);
    expect(notebookStore.cells[0].metadata).toEqual(seed.metadata);
  });

  test('delete all → one undo restores every cell with its metadata', () => {
    const seeds: CellData[] = [
      { id: 'a', type: 'markdown', content: '# A' },
      { id: 'b', type: 'code', content: 'b = 1', metadata: { pynote: { autorun: true } } },
      { id: 'c', type: 'code', content: 'c = 2', metadata: { pynote: { codeview: { showStdout: false } } } },
    ];
    actions.loadNotebook(seeds, 'test.ipynb');
    actions.deleteAllCells();
    expect(notebookStore.cells).toHaveLength(0);
    actions.undo();
    expect(notebookStore.cells.map((c) => [c.id, c.content, c.metadata])).toEqual(seeds.map((c) => [c.id, c.content, c.metadata]));
  });

  test('delete entries saved by an older PyNote, without metadata, still undo', () => {
    actions.loadNotebook([], 'test.ipynb', ['d|0|markdown|old-1|a \\| b'], 0);
    actions.undo();
    expect(notebookStore.cells[0]).toMatchObject({ id: 'old-1', type: 'markdown', content: 'a | b' });
    expect(notebookStore.cells[0].metadata).toBeUndefined();
  });

  test('batch undo: multiple adds become a single undo unit', () => {
    actions.beginBatch();
    actions.addCell('code');
    actions.addCell('markdown');
    actions.addCell('code');
    actions.endBatch();

    expect(notebookStore.cells).toHaveLength(3);

    // One undo reverts all three adds
    actions.undo();
    expect(notebookStore.cells).toHaveLength(0);

    // One redo restores all three
    actions.redo();
    expect(notebookStore.cells).toHaveLength(3);
  });

  test('redo at end of history is a no-op', () => {
    actions.addCell('code');
    const count = notebookStore.cells.length;
    const idx = notebookStore.historyIndex;

    actions.redo(); // Already at the tip
    expect(notebookStore.cells).toHaveLength(count);
    expect(notebookStore.historyIndex).toBe(idx);
  });
});
