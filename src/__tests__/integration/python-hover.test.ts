import { beforeAll, describe, expect, test } from 'vitest';
import { loadPyodide, type PyodideAPI } from 'pyodide';
import { INIT_CODE } from '../../lib/python-runtime/init-code';

interface HoverResult {
  found: boolean;
  type?: string;
  name?: string;
  doc?: string;
  value?: string;
}

let pyodide: PyodideAPI;

beforeAll(async () => {
  pyodide = await loadPyodide();
  await pyodide.runPythonAsync(INIT_CODE);
  pyodide.runPython(`
value = 5
limit = 10
large_list = list(range(100))
cycle = []
cycle.append(cycle)

def documented_function(required, value=1, min=0, optional=None):
    """Return a value.

    Args:
        required: Required input value
        value: Value to return
        min: Minimum accepted value
        optional: Optional input value
    """
    return value

class Holder:
    def method(self):
        """Run the method."""

holder = Holder()
holder.value = 7

class CallableObject:
    def __call__(self):
        return 1

callable_object = CallableObject()

class BrokenRepr:
  def __repr__(self):
    raise RuntimeError("cannot format")

broken_repr = BrokenRepr()
`);
}, 15_000);

function inspectHover(code: string, word: string): HoverResult {
  const getHoverHelp = pyodide.globals.get('get_hover_help');
  try {
    const result = getHoverHelp(code, code.indexOf(word) + 1);
    try {
      return result.toJs({ dict_converter: Object.fromEntries }) as HoverResult;
    } finally {
      result.destroy();
    }
  } finally {
    getHoverHelp.destroy();
  }
}

describe('Python hover inspection', () => {
  test('resolves variables at declaration sites', () => {
    expect(inspectHover('value = 5', 'value')).toMatchObject({
      found: true,
      type: 'int',
      value: '5',
    });
    expect(inspectHover('holder.value = 7', 'holder.value')).toMatchObject({
      found: true,
      type: 'int',
      value: '7',
    });
  });

  test('reads the current runtime value after the namespace changes', () => {
    expect(inspectHover('value = 5', 'value').value).toBe('5');
    pyodide.runPython('value = 42');
    expect(inspectHover('value = 5', 'value').value).toBe('42');
  });

  test('bounds large and cyclic container previews', () => {
    const largePreview = inspectHover('large_list', 'large_list').value;
    expect(largePreview).toContain('0');
    expect(largePreview).toContain('...');
    expect(largePreview!.length).toBeLessThanOrEqual(1200);

    const cyclePreview = inspectHover('cycle', 'cycle').value;
    expect(cyclePreview).toContain('...');
    expect(cyclePreview!.length).toBeLessThanOrEqual(1200);
  });

  test('contains errors raised by custom repr implementations', () => {
    expect(inspectHover('broken_repr', 'broken_repr')).toMatchObject({
      found: true,
      type: 'BrokenRepr',
      value: '<runtime value unavailable>',
    });
  });

  test('resolves keyword names through the enclosing function', () => {
    expect(inspectHover('documented_function(required=0, value=2)', 'value')).toMatchObject({
      found: true,
      type: 'parameter',
      name: 'value',
      doc: '(default) value = 1\nValue to return',
    });
    expect(inspectHover('documented_function(required=0, min=2)', 'min')).toMatchObject({
      found: true,
      type: 'parameter',
      name: 'min',
      doc: '(default) min = 0\nMinimum accepted value',
    });
    expect(inspectHover('documented_function(required=0, optional=None)', 'optional')).toMatchObject({
      found: true,
      type: 'parameter',
      name: 'optional',
      doc: '(default) optional = None\nOptional input value',
    });
    expect(inspectHover('documented_function(required=0)', 'required')).toMatchObject({
      found: true,
      type: 'parameter',
      name: 'required',
      doc: 'required\nRequired input value',
    });
  });

  test('keeps normal hover for keyword argument values', () => {
    expect(inspectHover('documented_function(required=0, value=limit)', 'limit')).toMatchObject({
      found: true,
      type: 'int',
    });
  });

  test('does not substitute unrelated globals for unresolved keywords', () => {
    expect(inspectHover('unknown(min=0)', 'min')).toEqual({ found: false });
  });

  test.each([
    ['function declaration', 'def documented_function(value=1):\n    return value', 'documented_function'],
    ['function use', 'documented_function()', 'documented_function'],
    ['bound method', 'holder.method()', 'holder.method'],
    ['callable object', 'callable_object()', 'callable_object'],
    ['built-in function', 'len([1, 2])', 'len'],
  ])('classifies %s consistently as a function', (_label, code, word) => {
    const result = inspectHover(code, word);
    expect(result).toMatchObject({
      found: true,
      type: 'function',
    });
    expect(result).not.toHaveProperty('value');
  });

  test('keeps classes distinct from functions', () => {
    const result = inspectHover('Holder()', 'Holder');
    expect(result).toMatchObject({
      found: true,
      type: 'class',
    });
    expect(result).not.toHaveProperty('value');
  });
});