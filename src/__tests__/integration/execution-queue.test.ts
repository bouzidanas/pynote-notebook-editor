import { describe, test, expect, beforeEach, vi } from 'vitest';

// Hoist mock so it's available for vi.mock
const mockKernel = vi.hoisted(() => ({
  _status: 'ready' as string,
  get status() { return this._status; },
  clearCellState: vi.fn(),
  setCellContext: vi.fn(),
}));

vi.mock('../../lib/pyodide', () => ({
  kernel: mockKernel,
}));

// Import store AFTER mock is in place
import { actions, notebookStore } from '../../lib/store';
import type { CellData } from '../../lib/store';

function loadTwoCells(): [string, string] {
  const cells: CellData[] = [
    { id: 'cell-A', type: 'code', content: 'x = 1' },
    { id: 'cell-B', type: 'code', content: 'print(x)' },
  ];
  actions.loadNotebook(cells, 'test.ipynb');
  return ['cell-A', 'cell-B'];
}

beforeEach(() => {
  mockKernel._status = 'ready';
  mockKernel.clearCellState.mockClear();
  mockKernel.setCellContext.mockClear();
  // Start fresh — loadNotebook resets cells/history but not executionQueue
  actions.loadNotebook([], 'test.ipynb');
  actions.resetExecutionState();
});

describe('execution queue logic', () => {
  test('queue_all: queues when another cell is running', () => {
    const [a, b] = loadTwoCells();
    actions.setExecutionMode('queue_all');

    // Simulate cell A already running
    actions.setCellRunning(a, true);

    const mockRun = vi.fn().mockResolvedValue(undefined);
    actions.runCell(b, mockRun);

    // Cell B should be queued
    expect(notebookStore.executionQueue).toContain(b);
    // runKernel should NOT have been called for cell B
    expect(mockRun).not.toHaveBeenCalled();
  });

  test('hybrid: queues only when the previous cell is running or queued', () => {
    const [a, b] = loadTwoCells();
    actions.setExecutionMode('hybrid');

    // Previous cell (A) is running → B should queue
    actions.setCellRunning(a, true);

    const mockRun = vi.fn().mockResolvedValue(undefined);
    actions.runCell(b, mockRun);

    expect(notebookStore.executionQueue).toContain(b);
  });

  test('direct: never queues regardless of running state', () => {
    const [a, b] = loadTwoCells();
    actions.setExecutionMode('direct');

    // Another cell is running
    actions.setCellRunning(a, true);

    const mockRun = vi.fn().mockResolvedValue(undefined);
    actions.runCell(b, mockRun);

    // Direct mode: cell B starts immediately (not queued)
    expect(notebookStore.executionQueue).not.toContain(b);
    // The cell should now be running (executeCell sets isRunning synchronously)
    const cellB = notebookStore.cells.find(c => c.id === b);
    expect(cellB?.isRunning).toBe(true);
  });
});
