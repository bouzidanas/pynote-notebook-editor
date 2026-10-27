// The rules of src/lib/markdown-math.ts (INLINE_MATH, DISPLAY_MATH and where
// inline math starts) matched at every position of a text at once. Inline
// math read from a "$" may run past "$" that do not close it ("$5 and $x$" is
// one span), so matching it there reads on to a "$" that does, and to the end
// of the line when none does. The renderer matches it at every "$" that may
// open math each time it reads on (inlineMathStart), which takes it time
// cubic in the length of a line of dollar amounts between emphasis, links or
// escapes. A scan reads the text once, then answers for any position at once,
// as the rules would there.
//
// INLINE_MATH, as the regular expression engine reads it: after the opening
// "$" (or "$$", when no third "$" follows), its content is a run of units,
// each a backslash with the character after it (one `.` matches: no line
// terminator) or one character that is neither a backslash nor a line feed.
// The math is the shortest such run that ends with a unit other than a lone
// "$", and that is followed by the opening "$" (or "$$") and then by
// whitespace, one of `?!.,:？！。，：` or the end of the text. A line feed,
// and a backslash before a line terminator or at the end, end the run there,
// and with it the math. A unit starts wherever an even run of backslashes (or
// none) comes before it, as the run cannot reach back past the opening "$".
// DISPLAY_MATH runs from a "$$" to the next "$$" at least a character on.

const DOLLAR = 36;
const BACKSLASH = 92;
const LINE_FEED = 10;

// What may follow inline math (INLINE_MATH's lookahead), and what may come
// before it (inlineMathStart's).
const FOLLOWS = /[\s?!.,:？！。，：]/;
const SPACE = /\s/;
// The characters `.` does not match.
const isLineTerminator = (char: number) => char === LINE_FEED || char === 13 || char === 0x2028 || char === 0x2029;

export interface MathScan {
  /** Whether there is math at any position. */
  found: boolean;
  /** The length of the inline math (INLINE_MATH) at `at`, 0 if none. */
  inline(at: number): number;
  /** The length of the display math (DISPLAY_MATH) at `at`, 0 if none. */
  display(at: number): number;
  /** inlineMathStart of the text from `at` on. */
  inlineStart(at: number): number | undefined;
  /** displayMathStart of the text from `at` on. */
  displayStart(at: number): number | undefined;
}

const NO_MATH: MathScan = {
  found: false,
  inline: () => 0,
  display: () => 0,
  inlineStart: () => undefined,
  displayStart: () => undefined,
};

/**
 * The math rules matched at every position of `text`; with `follows`, inline
 * math may be followed by what it matches instead.
 */
export function scanMath(text: string, follows: RegExp = FOLLOWS): MathScan {
  if (!text.includes("$")) return NO_MATH;
  const n = text.length;
  const none = n + 1;
  const code = (at: number) => (at < n ? text.charCodeAt(at) : -1);
  const isFollowed = (at: number) => at === n || (at < n && follows.test(text[at]));

  // The backslashes right before each position.
  const backslashes = new Int32Array(n + 1);
  for (let k = 1; k <= n; k++) backslashes[k] = code(k - 1) === BACKSLASH ? backslashes[k - 1] + 1 : 0;

  // From each position on: the first unit that ends inline math there; the
  // first "$" and "$$" that close inline math (in place of a unit, after a
  // unit other than a lone "$", and followed as `follows` has it); and the
  // first "$$".
  const stop = new Int32Array(n + 2).fill(none);
  const close = new Int32Array(n + 2).fill(none);
  const closeTwo = new Int32Array(n + 2).fill(none);
  const pair = new Int32Array(n + 2).fill(none);
  for (let k = n - 1; k >= 0; k--) {
    const char = code(k);
    const unit = backslashes[k] % 2 === 0;
    const ends = char === LINE_FEED || (char === BACKSLASH && (k + 1 === n || isLineTerminator(code(k + 1))));
    stop[k] = unit && ends ? k : stop[k + 1];
    const closes = unit && char === DOLLAR && k > 0 && (code(k - 1) !== DOLLAR || backslashes[k - 1] % 2 === 1);
    close[k] = closes && isFollowed(k + 1) ? k : close[k + 1];
    closeTwo[k] = closes && code(k + 1) === DOLLAR && isFollowed(k + 2) ? k : closeTwo[k + 1];
    pair[k] = char === DOLLAR && code(k + 1) === DOLLAR ? k : pair[k + 1];
  }

  const inline = (at: number): number => {
    if (code(at) !== DOLLAR) return 0;
    const fence = code(at + 1) === DOLLAR ? 2 : 1;
    if (fence === 2 && code(at + 2) === DOLLAR) return 0;
    const content = at + fence;
    if (content >= n) return 0;
    const end = (fence === 1 ? close : closeTwo)[content + 1];
    return end < stop[content] ? end + fence - at : 0;
  };

  const display = (at: number): number => (code(at) === DOLLAR && code(at + 1) === DOLLAR && pair[at + 3] !== none ? pair[at + 3] + 2 - at : 0);

  // From each position on, the first "$" after whitespace where inline math
  // starts.
  const opens = new Int32Array(n + 2).fill(none);
  let found = false;
  for (let k = n - 1; k >= 0; k--) {
    const math = inline(k) > 0;
    if (k > 0) opens[k] = math && SPACE.test(text[k - 1]) ? k : opens[k + 1];
    found ||= math || display(k) > 0;
  }

  return {
    found,
    inline,
    display,
    inlineStart: (at) => (inline(at) > 0 ? 0 : opens[at + 1] === none ? undefined : opens[at + 1] - at),
    displayStart: (at) => (pair[at] === none ? undefined : pair[at] - at),
  };
}
