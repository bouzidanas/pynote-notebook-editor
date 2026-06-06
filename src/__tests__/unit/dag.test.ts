import { describe, test, expect } from 'vitest';
import { actions } from '../../lib/store';
import type { CellData } from '../../lib/store';

// Helper: load a set of code cells with known IDs and set their dependencies
function setupCells(
  defs: Array<{ id: string; definitions: string[]; references: string[] }>
) {
  const cells: CellData[] = defs.map(d => ({
    id: d.id,
    type: 'code' as const,
    content: '',
  }));
  actions.loadNotebook(cells, 'test.ipynb');
  for (const d of defs) {
    actions.setCellDependencies(d.id, d.definitions, d.references);
  }
}

describe('getDependencyGraph', () => {
  test('builds edges from defining cell to referencing cell', () => {
    setupCells([
      { id: 'A', definitions: ['x'], references: [] },
      { id: 'B', definitions: ['y'], references: ['x'] },
      { id: 'C', definitions: [], references: ['y'] },
    ]);

    const graph = actions.getDependencyGraph();
    expect(graph.get('A')!.has('B')).toBe(true);
    expect(graph.get('B')!.has('C')).toBe(true);
    expect(graph.get('C')!.size).toBe(0);
  });

  test('self-references are ignored', () => {
    setupCells([
      { id: 'A', definitions: ['x'], references: ['x'] },
    ]);
    const graph = actions.getDependencyGraph();
    expect(graph.get('A')!.size).toBe(0);
  });
});

describe('getDownstreamCells', () => {
  test('linear chain returns cells in topological order', () => {
    setupCells([
      { id: 'A', definitions: ['x'], references: [] },
      { id: 'B', definitions: ['y'], references: ['x'] },
      { id: 'C', definitions: [], references: ['y'] },
    ]);

    const downstream = actions.getDownstreamCells('A');
    expect(downstream).toEqual(['B', 'C']);
  });

  test('diamond dependency returns unique cells in valid topological order', () => {
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    setupCells([
      { id: 'A', definitions: ['x'], references: [] },
      { id: 'B', definitions: ['y'], references: ['x'] },
      { id: 'C', definitions: ['z'], references: ['x'] },
      { id: 'D', definitions: [], references: ['y', 'z'] },
    ]);

    const downstream = actions.getDownstreamCells('A');
    expect(downstream).toHaveLength(3);
    // D must come after both B and C
    expect(downstream.indexOf('D')).toBeGreaterThan(downstream.indexOf('B'));
    expect(downstream.indexOf('D')).toBeGreaterThan(downstream.indexOf('C'));
  });

  test('isolated cell has no downstream', () => {
    setupCells([
      { id: 'A', definitions: ['x'], references: [] },
      { id: 'B', definitions: ['y'], references: [] },
    ]);

    expect(actions.getDownstreamCells('A')).toEqual([]);
  });

  test('cycle falls back to BFS order without crashing', () => {
    setupCells([
      { id: 'A', definitions: ['x'], references: ['z'] },
      { id: 'B', definitions: ['y'], references: ['x'] },
      { id: 'C', definitions: ['z'], references: ['y'] },
    ]);

    // A→B→C→A forms a cycle. getDownstreamCells should not hang
    const downstream = actions.getDownstreamCells('A');
    expect(downstream).toContain('B');
    expect(downstream).toContain('C');
  });
});
