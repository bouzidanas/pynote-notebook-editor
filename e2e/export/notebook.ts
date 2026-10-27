import type { NotebookDocument } from "../../src/lib/formats/document";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../../src/lib/formats/document";
import { UI_MIME } from "../../src/lib/output-markers";
import type { CellOutputs } from "../../src/lib/host";

// The notebook the export suite exports. It exercises markdown rendering
// (math included, so exports must carry KaTeX's fonts, and a highlighted HTML
// code block, whose grammar compiles a regular expression with "<!--" that a
// single-file page must keep valid), a plain print, package imports (numpy,
// and pytz after a semicolon, so offline exports must find, bundle and load
// both) and pynote_ui components wired to a Python callback.
export const EXPORT_NOTEBOOK: NotebookDocument = {
  metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { executionMode: "hybrid", history: [] } },
  cells: [
    {
      id: "title",
      type: "markdown",
      source: [
        "# Exported notebook",
        "",
        "A paragraph with **bold** text and math, $E = mc^2$:",
        "",
        "$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$",
        "",
        "```html\n<!-- a comment -->\n<div class=\"box\">Hi</div>\n```",
      ].join("\n"),
      metadata: {},
    },
    { id: "hello", type: "code", source: "answer = 21 * 2\nprint(f'answer={answer}')", metadata: {} },
    {
      id: "numpy",
      type: "code",
      source: "import numpy as np; import pytz\nprint('sum=' + str(int(np.arange(10).sum())))\nprint('tz=' + pytz.utc.zone)",
      metadata: {},
    },
    {
      id: "widget",
      type: "code",
      source: [
        "from pynote_ui import Group, Slider, Text",
        "level = Slider(value=30, min=0, max=100, label='Level')",
        "echo = Text(content='level=30')",
        "",
        "def show(data):",
        "    echo.content = f\"level={int(data['value'])}\"",
        "",
        "level.on_update(show)",
        "Group([level, echo])",
      ].join("\n"),
      metadata: {},
    },
  ],
};

// Saved outputs a read-only export embeds: the components as they were when
// exported (the slider moved to 64), as the Export dialog snapshots them.
const level = { id: "level-1", type: "Slider", props: { value: 64, min: 0, max: 100, step: 1, label: "Level" } };
const echo = { id: "echo-1", type: "Text", props: { content: "level=64" } };

export const READONLY_OUTPUTS: Record<string, CellOutputs> = {
  hello: { stdout: ["answer=42\n"], stderr: [], executionCount: 1 },
  numpy: { stdout: ["sum=45\n", "tz=UTC\n"], stderr: [], executionCount: 2 },
  widget: {
    stdout: [],
    stderr: [],
    executionCount: 3,
    mimebundle: { [UI_MIME]: { id: "group-1", type: "Group", props: { children: [level, echo], layout: "col" } } },
  },
};
