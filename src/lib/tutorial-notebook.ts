import type { CellData } from "./store";

export const tutorialCells: CellData[] = [
  {
    id: "tut-1",
    type: "markdown",
    content: "# Welcome to PyNote!\n\nThis is an interactive tutorial running right inside your browser. **I am a notebook**, just like the ones you will create.\n\nDouble-click this text to edit it, then press `Ctrl + Enter` (or the Run button) to render it again.\n\nPyNote runs Python using **WebAssembly**, so your code executes locally on your machine. No server required!"
  },
  {
    id: "tut-2",
    type: "code",
    content: "# This is a code cell. You can run Python code here.\n# Press Shift + Enter to run and move to the next cell.\n\nimport sys\nprint(f\"Hello from Python {sys.version.split()[0]} running in the browser!\")\n\na = 10\nb = 20\nprint(f\"Calculation: {a} + {b} = {a+b}\")"
  },
  {
    id: "tut-3",
    type: "markdown",
    content: "## Interactive UI with pynote_ui\n\nPyNote includes a special library called `pynote_ui` that lets you build interactive widgets using Python.\n\nRun the cell below to see a **Slider** controlling a **Text** display in real-time. This demonstrates bidirectional communication between Python and the UI."
  },
  {
    id: "tut-4",
    type: "code",
    content: "from pynote_ui.elements import Slider, Text, Group\n\n# Create a slider and a text display\nslider = Slider(min=0, max=100, value=50, label=\"Input Value\")\ndisplay = Text(content=\"Current value squared: 2500\")\n\n# Define a callback function\ndef on_change(data):\n    # Get the new value from the slider\n    val = int(data.get('value', 0))\n    # Update the text display\n    display.content = f\"Current value squared: {val**2}\"\n\n# Attach the callback to the slider\nslider.on_update(on_change)\n\n# Display both widgets in a Group\nGroup([slider, display])"
  },
  {
    id: "tut-result-demo",
    type: "markdown",
    content: "### Output Types: Result vs. Print\n\nPyNote distinguishes between **execution results** (the value of the last expression) and **printed output** (standard output).\n\n1. **Result Only:** The cell below evaluates `10 * 10`. No `print()` is used, but the result `100` is displayed as the cell's return value."
  },
  {
    id: "tut-result-only",
    type: "code",
    content: "# This expression returns 100, which is displayed as the 'Result'\n10 * 10"
  },
  {
    id: "tut-stdout-demo",
    type: "markdown",
    content: "2. **Print (Stdout) Only:** The cell below uses `print()`. This text goes to the standard output stream. The cell returns `None` (implicitly), so no \"Result\" section is shown."
  },
  {
    id: "tut-stdout-only",
    type: "code",
    content: "# This sends text to stdout\nprint(\"I am standard output!\")\nprint(\"Me too.\")"
  },
  {
    id: "tut-5",
    type: "markdown",
    content: "## Next Steps\n\n- **Add Cells:** Use the buttons at the bottom or the toolbar menu.\n- **Shortcuts:** Press `Ctrl + /` to see keyboard shortcuts.\n- **Export:** Save your work as a `.ipynb` file to use in other Jupyter environments.\n\nHappy Coding!"
  }
];
