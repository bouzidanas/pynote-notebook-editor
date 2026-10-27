# The `.pynote` file format (version 1)

A `.pynote` file is a Markdown document with YAML front matter that stores a PyNote notebook.
It is designed for version control: diffs show code and prose, not JSON, and editing one cell changes one region of the file.
It converts to and from `.ipynb` without loss, so a notebook can move between the two formats any number of times.
`.ipynb` remains PyNote's default format; `.pynote` is an option in Save As and in Open.
The implementation is `src/lib/formats/pynote.ts`, and the format tests check this document's examples and escapes against its writer.

## Example

````markdown
---
pynote: 1
executionMode: reactive
theme:
  colors:
    primary: "#f38ba8"
---

<!-- cell 1f3a9c2e -->
# Sales analysis

Load the data first.

```python {#7b2e10d4}
import pandas as pd
df = pd.read_csv("sales.csv")
```

```python {#c90a5b13 autorun=false}
df.describe()
```

<!-- cell 4d0e8a71 -->
A second markdown cell.
````

On GitHub and in other Markdown viewers the cell markers are invisible HTML comments and the code cells render as highlighted Python.

## Structure

A file has three parts, in this order:

1. Front matter: notebook settings and metadata, between `---` lines.
2. Cells, each opened by an explicit marker.
3. An optional trailer: machine state (undo history, attachments) in one HTML comment at the end.

The file uses `\n` line endings, is UTF-8 without a byte order mark, and ends with a newline.

## Front matter

The front matter is a YAML 1.2 mapping.
`pynote: 1` is required and identifies the format version.

Every other top-level key except `metadata` is a PyNote notebook setting, with the same name and value it has under `metadata.PyNote` in an `.ipynb` file: `executionMode`, `autorun`, `autorunOnRefresh`, `codeHiddenPlaceholder`, `showTrailingAddButtons`, `codeview`, `theme`, and any setting a newer PyNote version adds.
The undo history is the exception: it lives in the trailer, so the front matter does not change on every edit.
When `metadata.PyNote` is not a mapping, is empty, or has a key named `pynote` or `metadata`, it stays under the front matter's `metadata` instead, apart from its `history`, which still goes to the trailer.

`metadata` holds the rest of the notebook's metadata exactly as the `.ipynb` stores it, for example another tool's keys (`colab`, `jupytext`) or a non-PyNote `kernelspec`.
PyNote's own `kernelspec` and `language_info` are omitted; a file without them gets PyNote's defaults.

## Cells

Every cell starts with a marker line that carries the cell's id.
Ids follow the nbformat rule: 1 to 64 characters from `a-z`, `A-Z`, `0-9`, `-` and `_`.

### Code cells

A code cell is a fenced code block whose info string is `python` followed by an attribute block that contains the id:

````markdown
```python {#7b2e10d4}
print("hello")
```
````

Everything between the opening and closing fence lines is the cell's source, exactly.
The fence is three backticks, or longer when the source itself contains a run of three or more backticks, so the source can never close it early.
A python block without an attribute block (or without `#id`) is not a cell; it is part of the surrounding Markdown cell.

### Markdown cells

A Markdown cell starts with a `<!-- cell ID -->` line; its source is every line after the marker up to the blank line that precedes the next cell.

### Raw cells

A raw cell is a fenced block with the info string `raw` and an attribute block, written like a code cell.

### Fenced Markdown cells

A Markdown cell whose source contains a line that would read as a cell marker or as the start of the trailer (for example documentation about this format) is written as a fenced block with the info string `markdown`.
Its source is then protected by the fence exactly as a code cell's is.

### Attribute blocks and cell metadata

Attributes follow the id, separated by spaces, as `key=value` pairs where the value is a JSON value: `true`, `false`, a number, a "string", an array or an object.
A bare word that is not a JSON literal is read as a string, so `placeholder=Setup` is accepted when editing by hand.

- Each key under the cell's `metadata.pynote` is an attribute with the same name: `autorun`, `autorunOnRefresh`, `placeholder`, `codeview`, and any key a newer PyNote adds.
  When `metadata.pynote` is not an object, is empty, or has a key that cannot be an attribute name (an ASCII letter or `_` followed by ASCII letters, digits, `_` and `-`, other than the reserved `meta` and `source`), the whole value stays inside `meta` instead.
- `meta` holds the rest of the cell's metadata (keys written by other tools) as one JSON object.
- `source` holds the cell's source as a JSON string when the source contains a carriage return or a NUL character, and the cell's body is then empty.
  Line-ending conversion (Git's `autocrlf`, editors) would rewrite a raw carriage return, and Git treats a file that contains a NUL byte as binary.
  A reader takes the attribute over the body.

For example `{#c90a5b13 autorun=false codeview={"showCode":false} meta={"tags":["parameters"]}}`.

The writer puts each JSON value on one line and escapes five characters in it: `<`, `>` and `&` are written as `\u003c`, `\u003e` and `\u0026`, and the separators U+2028 and U+2029 as `\u2028` and `\u2029`.
So a value can never end the HTML comment of a `<!-- cell -->` marker, and editors that break lines at U+2028 do not split a marker line.
They are ordinary JSON escapes, so a JSON parser reads the value back unchanged.
For example, a cell whose placeholder is `<b> & -->` has the attribute `placeholder="\u003cb\u003e \u0026 --\u003e"`.

When writing a file by hand, `{.cell}` may stand in for `{#id}`: PyNote assigns a new id when it opens the file.

### Exact sources

Cells are separated by exactly one blank line.
A Markdown cell's source is the lines between its marker and that separating blank line, joined with `\n`, which preserves leading and trailing blank lines exactly.
Extra blank lines added between cells by hand become part of the preceding Markdown cell's source.

## Trailer

When a notebook has undo history or cell attachments, the file ends with one HTML comment:

```markdown
<!-- pynote
{
 "attachments": {
  "1f3a9c2e": {
   "plot.png": {
    "image/png": "iVBORw0K..."
   }
  }
 },
 "history": [
  "a|1|code|7b2e10d4"
 ]
}
-->
```

Its content is JSON with sorted keys and a one-space indent, as `.ipynb` files are written.
`<`, `>` and `&` are escaped as in attribute values, so the comment cannot end early; U+2028 and U+2029 are written as they are.
`history` is the notebook's undo history and `attachments` maps cell ids to their `.ipynb` attachments.
An empty `history` is not stored, and a `metadata.PyNote` that held nothing else is dropped with it; this is the format's one normalization.
Deleting the trailer by hand is safe: the notebook loses its undo history and attachments, nothing else.

## Mapping to `.ipynb`

| `.ipynb` | `.pynote` |
| --- | --- |
| `metadata.PyNote` (except `history`) | top-level front matter keys |
| `metadata.PyNote.history` | trailer `history` |
| other `metadata` keys | front matter `metadata` |
| cell `id` | marker id |
| cell `metadata.pynote.*` | attributes of the same name |
| other cell `metadata` | `meta` attribute |
| cell `attachments` | trailer `attachments` |
| cell `source` | cell body, exactly (the `source` attribute when it holds a carriage return or a NUL) |

Outputs and execution counts are not stored, matching PyNote's `.ipynb` files.
