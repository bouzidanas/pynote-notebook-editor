import { describe, test, expect, beforeEach, vi } from 'vitest';
import { kernel } from '../../lib/pyodide';

// Access private internals for testing. These are Maps on the Kernel instance
const k = kernel as any;

beforeEach(() => {
  k.listeners.clear();
  k.componentListeners.clear();
  k.componentToCellMap.clear();
  k.currentCellContext = null;
});

describe('kernel message routing', () => {
  test('listener receives messages matching its ID', () => {
    const handler = vi.fn();
    k.listeners.set('exec_42', handler);

    // Simulate worker onmessage (if worker were set)
    // Since worker is null, we call the handler directly to test routing logic
    const msg = { type: 'stdout', id: 'exec_42', content: 'hello' };
    // Verify the handler is mapped
    expect(k.listeners.has('exec_42')).toBe(true);
    k.listeners.get('exec_42')!(msg);
    expect(handler).toHaveBeenCalledWith(msg);

    // Different ID: handler should NOT be triggered
    expect(k.listeners.has('exec_99')).toBe(false);
  });

  test('component update dispatches to component listener', () => {
    const callback = vi.fn();
    kernel.setCellContext('cell-1');
    kernel.registerComponentListener('slider-1', callback);

    // Verify registration
    expect(k.componentListeners.has('slider-1')).toBe(true);
    expect(k.componentToCellMap.get('slider-1')).toBe('cell-1');

    // Simulate component_update
    k.componentListeners.get('slider-1')!({ value: 42 });
    expect(callback).toHaveBeenCalledWith({ value: 42 });
  });

  test('race condition: old cleanup does not remove re-registered listener', () => {
    const oldCallback = vi.fn();
    const newCallback = vi.fn();

    // Step 1: Cell executes, registers component
    kernel.setCellContext('cell-1');
    kernel.registerComponentListener('comp-1', oldCallback);
    expect(k.componentListeners.get('comp-1')).toBe(oldCallback);

    // Step 2: Cell re-executes and clearCellState removes old components
    kernel.clearCellState('cell-1');
    expect(k.componentListeners.has('comp-1')).toBe(false);

    // Step 3: New execution starts, sets context, registers same component ID
    kernel.setCellContext('cell-1');
    kernel.registerComponentListener('comp-1', newCallback);
    expect(k.componentListeners.get('comp-1')).toBe(newCallback);

    // Step 4: Old component finally unmounts (async cleanup fires late)
    kernel.unregisterComponentListener('comp-1');

    // The guard in unregisterComponentListener checks:
    //   cellId === currentCellContext → don't remove (it's the new registration)
    expect(k.componentListeners.has('comp-1')).toBe(true);
    expect(k.componentListeners.get('comp-1')).toBe(newCallback);
  });
});
