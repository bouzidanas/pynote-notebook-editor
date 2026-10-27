# Text exports: `.py`, `.md` and the `.py`/`.md` pair

PyNote exports a notebook as plain text in three forms.
The `.py` script is a runnable Python file that code editors understand as cells.
The `.md` document is a readable Markdown version of the notebook, for publishing or reviewing.
The `.py`/`.md` pair splits a notebook into a runnable script and a prose document that can be edited separately and merged back.

These exports are for reading, running and editing outside PyNote.
PyNote's Open opens notebooks only (`.ipynb` and `.pynote`); the readers specified below (`parsePython`, `parseMarkdown`, `mergePair`) are there for importing these files.
They do not replace `.ipynb` or `.pynote` (see [pynote.md](pynote.md)): neither keeps outputs, and only some notebook metadata survives (see [What is not preserved](#what-is-not-preserved)).
Every export is deterministic, uses `\n` line endings and ends with exactly one newline.

The implementation is `src/lib/formats/python.ts`, `comment-wrap.ts`, `markdown.ts` and `pair.ts`.
The format tests, the golden files in `test/golden/` and the oracle in `test/oracle/check_scripts.py` (run by `npm run test:oracle`) hold it to this document.

## The `.py` script

### Example

A reactive notebook whose summary cell comes before the cell that computes the total:

```python
# ---
# pynote:
#   executionMode: reactive
# ---

# %% [markdown]
# # Sales report
#
# The summary comes first, although it uses the total that a later cell
# computes: in reactive mode the order of cells does not matter.

# %% [markdown]
# ## Data
#
# | Region | Units |
# | ------ | ----: |
# | North  |   120 |
# | South  |    80 |

# %%
sales = {"North": 120, "South": 80}
total = sum(sales.values())

# %%
print(f"Total: {total} units")
```

The script runs top to bottom with any Python, so the cell that defines `total` comes first.

### Format

The file uses the "py:percent" cell format that VS Code, PyCharm, Spyder and jupytext read.
It has two parts:

1. A header: YAML in comment lines between two `# ---` lines.
2. Cells, each starting with a marker line, separated by exactly one blank line.

The header records PyNote's execution mode.
The script runs its cells in an order where every name is defined before it is used, as reactive mode does, so the mode is reactive and reading the script back gives a reactive notebook:

```python
# ---
# pynote:
#   executionMode: reactive
# ---
```

When the notebook's order has to be kept (see [Order](#order): a name defined in more than one cell, or a cycle), reactive mode would reject the notebook, so the header records the notebook's own mode instead (`executionMode: hybrid`, say), or `pynote: {}` when the notebook has none.

A blank line follows the header.

A code cell starts with `# %%` and its source follows exactly as written: indentation, tabs and trailing spaces are kept, and an empty cell is a bare marker.
A markdown cell starts with `# %% [markdown]` and its text follows as comment lines (see [Comment wrapping](#comment-wrapping)).
A raw cell starts with `# %% [raw]` and its text follows as comment lines, verbatim and never wrapped.
In comment lines, an empty line is written as a bare `#` and every other line starts with `# `.

A comment line whose text starts with `%%` (after optional spaces) would read as a cell marker, so it gets one extra space after `# ` (`#  %% a mermaid comment`); reading removes it.
A NUL character in a markdown or raw cell is written as U+FFFD, since CPython refuses source code that contains NUL.

### Order

A script runs top to bottom, while a reactive notebook may define a name in a cell below the cell that uses it.
When the export is given each code cell's definitions and references (from the same analysis reactive mode uses), it orders the code cells so that every name is defined before it is used:

- There is an edge from cell A to cell B when B references a name that A defines (A and B distinct).
- Names that start with `_` are local to their cell, as in reactive mode, and create no edges.
- The order is the earliest valid one: among the cells whose dependencies have all been emitted, the one that comes first in the notebook goes next.
  A notebook whose order is already valid is exported unchanged, and other cells move as little as the dependencies require.
- When a name is defined by more than one code cell, the notebook order is kept (reordering is only safe under reactive mode's rule that each name has one defining cell), and the result reports `orderNote: "duplicates"`.
- When the dependencies form a cycle, the notebook order is kept, and the result reports `orderNote: "cycle"`.
- Duplicate definitions are reported in every case, as `duplicateDefinitions` (name and defining cell ids, sorted by name).

Without dependency information, the notebook order is kept.
The result also lists the code cell ids in emitted order (`codeOrder`) and those emitted at a different position among the code cells than in the notebook (`moved`).

Markdown and raw cells move with the code:

- Those before the first code cell stay at the top.
- Every other one travels with the next code cell after it in the notebook.
- Those after the last code cell stay at the end.

An export of code cells only (no markdown option) leaves out both markdown and raw cells.

### Reading a `.py` file

`parsePython` reads any Python script, written by PyNote or not:

- A header is the first lines of the file, from a `# ---` line to the next one, all comment lines, that hold a YAML mapping.
  Its `pynote.executionMode` becomes the notebook's execution mode; other keys (jupytext's `jupyter:` block, a title) are ignored.
  Comment lines that only look like a header (not a mapping, invalid YAML, no closing line) are code.
- A marker is a line that starts with `#`, at most one space and `%%`, followed by a space, a tab or the end of the line (`# %%`, `#%%`).
  `# %%%`, `# %%x` and an indented `# %%` are not markers.
- The text after `%%` follows jupytext's syntax: an optional title, an optional `[markdown]`, `[md]` or `[raw]`, and `key=value` metadata whose values are JSON (or bare words, read as strings).
  A JSON object may stand for the metadata.
  `id="..."` is the cell's id when it is a valid nbformat id; other keys go to the cell's metadata, and the title to its `title` key (as jupytext does).
- A cell's text ends with the one blank line that separates it from the next marker (or with the end of the file); only that line is dropped, so other blank lines are kept exactly.
- In markdown and raw cells, `# ` or `#` is removed from the start of each line, and the escape for `%%` lines is undone.
  The reflowed Markdown is not unwrapped: it is equivalent Markdown.
- Text before the first marker is a code cell, unless it is blank.
  A script without markers is one code cell.
- A cell without a valid id gets a new one, and so does every cell that shares an id with another.
- The notebook gets PyNote's kernelspec and language_info.

Reading never fails: any text is a valid script.

### Compatibility

jupytext reads the export as py:percent with the same cells.
It treats the header as root-level metadata (with `root_level_metadata_as_raw_cell` off, as a raw cell otherwise) and keeps `id="..."` as cell metadata.
`test/oracle/check_scripts.py --jupytext` checks every golden script against jupytext's reader: cell count, types, sources, pair ids and the execution mode.

VS Code, PyCharm and Spyder show the `# %%` cells and run them in order.
VS Code's own cell regex also splits at a comment line written as `#  %%` (the escaped form above); this only affects how it displays a markdown cell.

Every golden script runs with CPython (`test/oracle/check_scripts.py`), which checks the order end to end.

## Comment wrapping

Markdown cells become comment lines that read like the rendered cell and stay equivalent Markdown, so a script can be opened back as a notebook.
The width (79 by default) includes the `# ` prefix and is counted in code points.

- Paragraphs, also inside lists and quotes, are reflowed to the width, breaking only at spaces (not at non-breaking spaces).
  A paragraph is never broken inside a code span, a link or image, an autolink, inline math, or an inline HTML tag; such a span longer than the width gets a line of its own.
- Hard line breaks (two trailing spaces, or a trailing backslash) stay line ends, with their markers.
- A wrapped line never starts with something Markdown would read as the start of a block: a list or quote marker, `#`, a rule or setext underline (`---`, `===`), a table delimiter, a fence, a `<` that could open an HTML block, `$$`, or `%%` (a cell marker).
  Such a word stays on the line before it, and a line never ends with a backslash that would become a hard break.
- A line that starts with `%%` is written `\%%`, and a `$` that is not math but would become math once lines are joined (a `$...$` span split across lines, which PyNote does not read as math) is written `\$`.
  Both render unchanged.
- Headings are one line, verbatim (`# ## Results`).
- List items keep their markers and numbering verbatim and their nesting.
  Nesting markers are never broken, so in deep nesting a line can be wider than the width when its markers alone fill it.
  Wrapped text hangs at the item's content offset (after the marker; a task box stays with its first word).
- Quotes wrap their content, each line prefixed `> ` after `# `; a quote that ends with an empty quote line keeps it.
- Code blocks, HTML blocks, display math (`$$` blocks, including multi-line ones inside a paragraph), rules, link definitions and front matter at the top of a cell are kept verbatim, never wrapped.
  An unclosed code fence is closed, which renders the same.
- Tables are re-aligned: cells are padded so the pipes line up (by alignment: left, right, centered), the delimiter row keeps its colons, and cell text is kept verbatim (escapes included).
  A table is never wrapped.
- Blank lines between blocks become one `#` line; there is no `#` line at the start or the end.

Markdown has quirks that a rewrap can trip, so every result is checked: when the comment would not render exactly like the cell (as marked, PyNote's renderer, reads it), or the cell has a structure that marked builds from rewritten text, the cell is written as is, line by line.
Comment wrapping never fails.

## The `.md` document

The cells as one Markdown document, in notebook order, separated by one blank line, without front matter:

````markdown
# Sales report

The summary comes first, although it uses the total that a later cell computes: in reactive mode the order of cells does not matter.

```python
print(f"Total: {total} units")
```

## Data

| Region | Units |
|---|---:|
| North | 120 |
| South | 80 |

```python
sales = {"North": 120, "South": 80}
total = sum(sales.values())
```
````

- Markdown cells are written as they are (blank ones are left out).
- Code cells, unless left out, are fenced `python` blocks whose fence is longer than any run of backticks in the code (at least three).
- Raw cells are fenced blocks whose info string comes from their format: `latex` for `text/latex`, `rst` for `text/restructuredtext`, `html` for `text/html`, `text` otherwise.
- A prose line that reads exactly like a pair anchor gets one more space after `<!--`, so the file is never mistaken for a pair half; it renders the same and reads back unchanged.

### Reading a Markdown file

`parseMarkdown` reads any Markdown file.
A pair half (see below) is read as such; any other file is read as follows:

- A fenced block whose info string starts with `python` and whose fence starts at the left margin is a code cell, its text exactly the lines inside the fence (an unclosed fence runs to the end of the file).
- Everything else is markdown, split at those code blocks: the text between two code blocks is one markdown cell, without the one blank line that separates it from each block.
- Other fenced blocks, and python blocks inside lists or quotes, stay in the markdown.
  So do raw cells of a plain export.
- A U+FEFF at the very start of the file is read as a byte order mark.

## The `.py`/`.md` pair

A pair is two files that each work on their own: `<name>.py` is the runnable script of the code cells, and `<name>.md` is the prose, with an invisible anchor where each code cell goes.
`mergePair` puts them back together into one notebook, keeping edits made to either file.

### Example

`sales.py`:

```python
# ---
# pynote:
#   executionMode: reactive
# # This is the code half of a notebook whose prose is in sales.md.
# ---

# %% id="total"
sales = {"North": 120, "South": 80}
total = sum(sales.values())

# %% id="summary"
print(f"Total: {total} units")
```

`sales.md`:

```markdown
<!-- PyNote: this is the prose half of a notebook whose code is in sales.py. -->

<!-- cell intro -->
# Sales report

The summary comes first, although it uses the total that a later cell computes: in reactive mode the order of cells does not matter.

<!-- code summary -->

<!-- cell data -->
## Data

| Region | Units |
|---|---:|
| North | 120 |
| South | 80 |

<!-- code total -->
```

### The code half

The `.py` export of the code cells only, ordered by their dependencies, with `id="<cell id>"` on each marker.
Its header carries a note, as YAML comments, naming the prose half.
The note is inside the header because jupytext, and PyNote itself, read any text between the header and the first marker as a cell.

### The prose half

The notebook's cells in notebook order, each marked by an HTML comment on a line of its own, invisible when rendered:

- `<!-- cell ID -->` starts a markdown cell: its source is every line up to the blank line before the next anchor.
- `<!-- code ID -->` stands for a code cell: the code itself is in the `.py`.
- `<!-- raw ID -->` starts a raw cell: its source is the fenced block that follows, written as in the `.md` export.

The first line is a note naming the code half; it also marks the file as a pair half.
Prose lines that read like anchors are escaped as in the `.md` export.
A file is read as a pair half when it starts with the note or has an anchor outside fenced blocks.
Prose typed outside any cell (before the first anchor, or after a code or raw cell) becomes a new markdown cell, with a warning, rather than being lost.

### Merging

The `.md` decides the order:

1. Its markdown and raw cells are kept, in order.
2. Each code anchor takes the `.py` code cell with its id.
3. A `.py` cell that no anchor names (written in the `.py`, or whose anchor was deleted from the `.md`) goes right after the `.py` cell before it; the first `.py` cell goes before the first code cell, or at the end when no anchor is left.
   This also places markdown cells written in the `.py`.
4. An anchor whose id is not in the `.py` (code deleted there) is dropped.
   A second anchor for the same code cell is dropped too.

Each inserted or dropped cell is reported as a warning.
The execution mode comes from the `.py` header.
Ids come from the files; a cell without one, or whose id another cell already has, gets a new one.
Merging never fails: two files PyNote did not write still merge (a `.md` without anchors keeps its text and gets the code cells after it).

## The Jupyter clean copy

`stripPyNoteMetadata` gives a copy of a notebook without PyNote's settings, for an `.ipynb` meant for other tools: `metadata.PyNote` and each cell's `metadata.pynote` are removed.
Every other key stays, so a cell whose metadata held only PyNote settings keeps an empty metadata object.

## What is not preserved

The `.py` and `.md` exports are for reading and running, and the pair for editing; none of them keeps everything a notebook holds.

- Outputs and execution counts (no PyNote format keeps them yet).
- Notebook metadata other than the execution mode, which every `.py` header records (a pair keeps cell ids and the execution mode, and nothing else).
  Cell metadata other than ids, and attachments.
- In a `.py`, a code line that starts with `# %%` (or `#%%`): it is written as is but reads back as a new cell marker.
  py:percent has no escape for it; jupytext has the same limitation.
- In a `.py`, the line breaks of reflowed paragraphs (the Markdown is equivalent, not identical), the escapes `\%%` and `\$` in prose, and the alignment padding of tables.
- In a `.py`, the order of code cells when dependencies move them (the pair keeps the notebook order in its `.md`).
- Line endings: CRLF and CR in sources become LF.
- The trailing line breaks of the last cell of each file (each file ends with exactly one newline).
- NUL in markdown and raw cells of a `.py` (written as U+FFFD).
- In a plain `.md`: cell ids, raw cells (they read back as markdown), the boundaries between adjacent markdown cells, blank markdown cells, and a U+FEFF that starts the file.
