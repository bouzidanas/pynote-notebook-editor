import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadPyodide, type PyodideAPI } from 'pyodide';
import type { PyCallable } from 'pyodide/ffi';

const evaluatedModules = import.meta.glob<Record<string, unknown>>(['./init-code.ts', './pynote-ui/*.ts'], { eager: true });
const rawModules = import.meta.glob<string>(['./init-code.ts', './pynote-ui/*.ts'], {
  eager: true,
  import: 'default',
  query: '?raw',
});

const pythonTemplates = Object.entries(evaluatedModules).flatMap(([path, moduleExports]) => {
  const rawSource = rawModules[path];
  if (!rawSource) throw new Error(`Missing raw source for ${path}`);

  return Object.entries(moduleExports)
    .filter(([name, value]) => (name === 'INIT_CODE' || name.endsWith('_PY')) && typeof value === 'string')
    .map(([name, pythonSource]) => {
      const filename = path
        .replace(/^\.\//, '')
        .replace('pynote-ui/', 'pynote_ui/')
        .replace(/\.ts$/, '.py');
      return [name, filename, pythonSource as string, rawSource] as const;
    });
}).sort(([left], [right]) => left.localeCompare(right));

function templateBody(rawSource: string): string {
  return rawSource.slice(rawSource.indexOf('`') + 1, rawSource.lastIndexOf('`'));
}

function oddBackslashRuns(rawSource: string): string[] {
  const failures: string[] = [];
  for (const [lineIndex, line] of templateBody(rawSource).split('\n').entries()) {
    for (const match of line.matchAll(/\\+/g)) {
      if (match[0].length % 2 !== 0) {
        failures.push(`${lineIndex + 1}:${(match.index ?? 0) + 1} ${line.trim()}`);
      }
    }
  }
  return failures;
}

describe('embedded Python templates', () => {
  test('escape guard detects a single TypeScript-layer backslash', () => {
    const unsafeTemplate = "export const TEST_PY = `pattern = r'\\s'`;";
    expect(oddBackslashRuns(unsafeTemplate)).toEqual(["1:13 pattern = r'\\s'"]);
  });

  test.each(pythonTemplates)('%s escapes backslashes before JavaScript evaluation', (_name, _filename, _python, rawSource) => {
    expect(oddBackslashRuns(rawSource)).toEqual([]);
    expect(templateBody(rawSource)).not.toContain('${');
  });

  describe('evaluated Python syntax', () => {
    let pyodide: PyodideAPI;
    let compilePython: PyCallable;

    beforeAll(async () => {
      pyodide = await loadPyodide();
      compilePython = pyodide.globals.get('compile');
    }, 15_000);

    afterAll(() => {
      compilePython.destroy();
    });

    test.each(pythonTemplates)('%s compiles after JavaScript evaluation', (_name, filename, pythonSource) => {
      const code = compilePython(pythonSource, filename, 'exec');
      code.destroy();
    });

    test('escaped marker literals retain their Python runtime values', () => {
      const coreSource = pythonTemplates.find(([name]) => name === 'PYNOTE_UI_CORE_PY')?.[2];
      expect(coreSource).toBeDefined();
      pyodide.runPython(coreSource!);

      expect(pyodide.globals.get('MARKER_UI_START')).toBe('\x02PYNOTE_UI\x02');
      expect(pyodide.globals.get('MARKER_MD_STYLED_START')).toBe('\x02PYNOTE_MD_STYLED\x02');
    });
  });
});