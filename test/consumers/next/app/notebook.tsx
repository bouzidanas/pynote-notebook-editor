// app/notebook.tsx, with pynote.config.json in the project's folder, imported
// as the example `npx pynote add` prints (next build type-checks it).
"use client";
import { useState } from "react";
import { PyNoteCell, configure } from "pynote/react";
import config from "../pynote.config.json";

configure(config);

// The widget cells, as a reader would use them: input widgets whose changes
// reach Python (and Python's reach the page), and output widgets.
const CONTROLS = `from pynote_ui import Slider, Toggle, Select, Input, Button, Text, Group

level = Slider(value=30, min=0, max=100, label="Level")
loud = Toggle(checked=False, label="Loud")
fruit = Select(choices=["apple", "banana", "cherry"], value="apple")
name = Input(placeholder="Your name")
reset = Button(label="Reset")
summary = Text(content="")

def show(data=None):
    words = f"{name.value or 'Someone'} likes {fruit.value} at {level.value}"
    summary.content = words.upper() if loud.checked else words

def restart(data):
    level.value = 30
    show()

for control in (level, loud, fruit, name):
    control.on_update(show)
reset.on_update(restart)
show()
Group([level, loud, fruit, name, reset, summary], label="Controls")`;

const OUTPUTS = `from pynote_ui import Text, display, print_md
from pynote_ui.oplot import Plot

print_md("## Circles\\n\\nA circle: $x^2 + y^2 = r^2$")
display(Text(content="Squares of 0 to 9"))
Plot([{"x": x, "y": x * x} for x in range(10)], x="x", y="y", mark="line", title="Squares")`;

export default function Notebook() {
  const [renders, setRenders] = useState(0);
  const [code, setCode] = useState("print('original')");
  const [quiet, setQuiet] = useState(true);
  const [setup, setSetup] = useState(false);
  return (
    <>
      <p>The first cell defines a value.</p>
      <PyNoteCell id="define" code={"x = 21"} />
      <p>Prose between the cells: both belong to one notebook, so the second cell sees x.</p>
      <PyNoteCell id="use" code={"print(f'x*2={x * 2}')"} />
      <PyNoteCell id="locked" code={"print('read-only code')"} editable={false} />
      <PyNoteCell id="plain" code={"print('no menu')"} menu={false} />
      <p>A cell whose code comes from the page's state:</p>
      <PyNoteCell id="dynamic" code={code} />
      <button type="button" onClick={() => setRenders(renders + 1)}>Re-render ({renders})</button>
      <button type="button" onClick={() => setCode("print('replaced')")}>Replace code</button>
      <p>A cell that shows neither its code nor, until asked, its printed output:</p>
      {/* Asked, the page stops setting showStdout: the option goes back to its default. */}
      <PyNoteCell id="hidden" code={"secret = 42\nprint('the secret is', secret)"} showCode={false} {...(quiet ? { showStdout: false } : {})} />
      <button type="button" onClick={() => setQuiet(!quiet)}>{quiet ? "Show output" : "Hide output"}</button>
      <p>A cell whose hidden code readers can show with the eye button:</p>
      <PyNoteCell id="peek" code={"answer = 6 * 7"} showCode={false} visibilityToggle />
      <p>Widgets: what a reader changes reaches Python, and what Python changes reaches the page.</p>
      <PyNoteCell id="controls" code={CONTROLS} />
      <PyNoteCell id="report" code={"print(level.value, loud.checked, fruit.value, name.value)"} />
      <p>Outputs: text, math and a plot.</p>
      <PyNoteCell id="outputs" code={OUTPUTS} />
      <p>A cell that runs when it mounts:</p>
      {setup && <PyNoteCell id="setup" code={"print('setup ran')"} autorun />}
      <button type="button" onClick={() => setSetup(!setup)}>{setup ? "Remove setup cell" : "Add setup cell"}</button>
    </>
  );
}
