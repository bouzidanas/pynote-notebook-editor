import { describe, test, expect } from 'vitest';
import {
  parseStdoutWithUI,
  parseMarkdownWithUI,
  MARKER_UI_START,
  MARKER_UI_END,
  MARKER_MD_STYLED_START,
  MARKER_MD_STYLED_END,
  MARKER_MD_PLAIN_START,
  MARKER_MD_PLAIN_END,
} from '../../components/Output';

const ui = (json: string) => `${MARKER_UI_START}${json}${MARKER_UI_END}`;
const mdStyled = (text: string) => `${MARKER_MD_STYLED_START}${text}${MARKER_MD_STYLED_END}`;
const mdPlain = (text: string) => `${MARKER_MD_PLAIN_START}${text}${MARKER_MD_PLAIN_END}`;

describe('parseStdoutWithUI', () => {
  test('empty input returns empty array', () => {
    expect(parseStdoutWithUI([])).toEqual([]);
    expect(parseStdoutWithUI([''])).toEqual([]);
  });

  test('plain text returns single text segment', () => {
    const result = parseStdoutWithUI(['hello world']);
    expect(result).toEqual([{ type: 'text', content: 'hello world' }]);
  });

  test('interleaved text, UI, and markdown segments', () => {
    const json = JSON.stringify({ id: 'btn1', type: 'button', props: { label: 'OK' } });
    const input = `before${ui(json)}middle${mdStyled('# Title')}after`;
    const result = parseStdoutWithUI([input]);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ type: 'text', content: 'before' });
    expect(result[1]).toEqual({ type: 'ui', data: { id: 'btn1', type: 'button', props: { label: 'OK' } } });
    expect(result[2]).toEqual({ type: 'text', content: 'middle' });
    expect(result[3]).toEqual({ type: 'markdown', content: '# Title', styled: true });
    expect(result[4]).toEqual({ type: 'text', content: 'after' });
  });

  test('malformed JSON in UI marker falls back to text segment', () => {
    const input = `${ui('{not json}')}`;
    const result = parseStdoutWithUI([input]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'text', content: '{not json}' });
  });

  test('nested UI inside markdown is skipped at top level', () => {
    const innerUI = ui(JSON.stringify({ id: 'x', type: 'btn', props: {} }));
    const input = `${mdPlain(`text ${innerUI} more`)}`;
    const result = parseStdoutWithUI([input]);
    // Only one markdown segment — nested UI is NOT extracted as a separate top-level segment
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('markdown');
  });

  test('plain markdown segment has styled=false', () => {
    const result = parseStdoutWithUI([mdPlain('hello')]);
    expect(result[0]).toEqual({ type: 'markdown', content: 'hello', styled: false });
  });

  test('handles split across multiple stdout chunks', () => {
    // The markers might be split across separate print() calls
    const json = JSON.stringify({ id: 'a', type: 'b', props: {} });
    const full = `pre${ui(json)}post`;
    const mid = Math.floor(full.length / 2);
    const result = parseStdoutWithUI([full.slice(0, mid), full.slice(mid)]);
    expect(result.some(s => s.type === 'ui')).toBe(true);
    expect(result[0]).toEqual({ type: 'text', content: 'pre' });
  });
});

describe('parseMarkdownWithUI', () => {
  test('text with embedded UI elements', () => {
    const json = JSON.stringify({ id: 'slider1', type: 'slider', props: { min: 0 } });
    const content = `Hello ${ui(json)} world`;
    const result = parseMarkdownWithUI(content);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'text', content: 'Hello ' });
    expect(result[1]).toEqual({ type: 'ui', data: { id: 'slider1', type: 'slider', props: { min: 0 } } });
    expect(result[2]).toEqual({ type: 'text', content: ' world' });
  });

  test('invalid JSON preserved as raw text including markers', () => {
    const raw = ui('not-json');
    const result = parseMarkdownWithUI(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    // The raw marker text is preserved
    expect((result[0] as { type: "text"; content: string }).content).toBe(raw);
  });

  test('no markers returns single text segment', () => {
    const result = parseMarkdownWithUI('just text');
    expect(result).toEqual([{ type: 'text', content: 'just text' }]);
  });
});
