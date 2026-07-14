import { describe, test, expect, beforeEach } from 'vitest';
import {
  getEffectiveVisibility,
  setCellShowAll,
  setVisibilitySettings,
  resetUserOverride,
  clearAllOverrides,
  codeVisibility,
} from '../../lib/codeVisibility';
import type { CellCodeVisibility } from '../../lib/store';

beforeEach(() => {
  clearAllOverrides();
  resetUserOverride();
  setVisibilitySettings({
    showCode: true,
    showStdout: true,
    showStderr: true,
    showResult: true,
    showError: true,
    showStatusDot: true,
  }, false);
});

describe('getEffectiveVisibility – 4-level priority cascade', () => {
  test('Priority 1: cell showAll overrides cell metadata', () => {
    // Set showAll (no other state changes, avoids SolidJS store proxy interactions)
    setCellShowAll('cell-1', true);

    // Even though metadata says hide code and stdout, showAll returns all-true defaults
    const vis = getEffectiveVisibility('cell-1', { showCode: false, showStdout: false });
    expect(vis.showCode).toBe(true);
    expect(vis.showStdout).toBe(true);
  });

  test('Priority 2: user override ignores cell metadata', () => {
    setVisibilitySettings({ showStdout: false }, true);
    const metadata: CellCodeVisibility = { showStdout: true };

    const vis = getEffectiveVisibility('cell-2', metadata);
    expect(vis.showStdout).toBe(false);
  });

  test('Priority 3: cell metadata merges with global when no user override', () => {
    const metadata: CellCodeVisibility = { showCode: false };

    const vis = getEffectiveVisibility('cell-3', metadata);
    expect(vis.showCode).toBe(false);
    expect(vis.showStdout).toBe(true);
    expect(vis.showLineNumbers).toBe(codeVisibility.showLineNumbers);
  });

  test('Priority 4: no metadata, no overrides, returns global settings', () => {
    setVisibilitySettings({ showResult: false, showError: false }, false);

    const vis = getEffectiveVisibility('cell-4');
    expect(vis.showResult).toBe(false);
    expect(vis.showError).toBe(false);
    expect(vis.showCode).toBe(true);
  });
});
