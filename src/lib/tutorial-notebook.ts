import type { CellData } from "./store";

export const tutorialCells: CellData[] = [
  // ============================================================================
  // INTRODUCTION
  // ============================================================================
  {
    id: "tut-intro",
    type: "markdown",
    content: "# Welcome to PyNote!\n\nThis is an interactive tutorial running right inside your browser. **I am a notebook**, just like the ones you will create.\n\nDouble-click any text cell to edit it, then press `Ctrl + Enter` to render it again.\n\nPyNote runs Python using **WebAssembly (Pyodide)**, so your code executes locally on your machine. No server required!"
  },

  // ============================================================================
  // PART 1: GETTING STARTED
  // ============================================================================
  {
    id: "tut-part1",
    type: "markdown",
    content: "# Part 1: Getting Started\n\nLearn the basics of writing code, understanding output, and navigating the notebook interface."
  },

  // --- Section 1.1: The Kernel ---
  {
    id: "tut-s1-kernel",
    type: "markdown",
    content: "## The Kernel & Status\n\nThe \"Kernel\" is the Python engine running in the background. Look at the **top right corner** of the app header for its status:\n\n- 🟢 **Ready**: Waiting for your command.\n- 🟡 **Busy**: Currently running code.\n- 🔴 **Starting/Error**: Setting up or crashed.\n\n**Tip:** If code gets stuck, open the Kernel Menu (top right) to **Interrupt** or **Restart** the engine."
  },

  // --- Section 1.2: Code Cells ---
  {
    id: "tut-s1-cells",
    type: "markdown",
    content: "## Code Cells & Indicators\n\nRun the cell below (`Shift + Enter`) and keep an eye on the visual cues:\n\n1. **Status Dot** (Top Right of cell): Shows a timer, then Green (Success) or Red (Error).\n2. **Stale Indicator** (Left Border): \n   - **Blue/Solid**: The output is fresh and matches the code.\n   - **Gray/Dashed**: The code has been changed since the last run (Stale).\n\n**Try it:** Run the cell, then edit the number `1.5` to `2.0` but **don't** run it. Notice the left border turns gray."
  },
  {
    id: "tut-demo-indicators",
    type: "code",
    content: "import time\n\nprint(\"I am running...\")\ntime.sleep(1.5) # Watch the timer!\nprint(\"Done!\")"
  },

  // --- Section 1.3: Output Types ---
  {
    id: "tut-s1-outputs",
    type: "markdown",
    content: "## Output Types\n\nPyNote intelligently handles different kinds of output."
  },
  {
    id: "tut-demo-result",
    type: "code",
    content: "# 1. Result (Last Expression)\n# If the last line is a value, it is displayed automatically.\n\n[x**2 for x in range(10)]"
  },
  {
    id: "tut-demo-stdout",
    type: "code",
    content: "# 2. Standard Output (Print)\n# Text printed to stdout appears in a stream.\n\nfor i in range(3):\n    print(f\"Processing item {i}...\")"
  },
  {
    id: "tut-demo-error",
    type: "code",
    content: "# 3. Errors\n# Tracebacks are captured and formatted.\n\ndef broken_function():\n    return 1 / 0\n\nbroken_function()"
  },
  {
    id: "tut-demo-note",
    type: "markdown",
    content: "**Note:** The `broken_function` call is on line 7 of the cell and the problematic line inside the function is on line 5. This matches with the traceback above."
  },

  // --- Section 1.4: Markdown Documentation ---
  {
    id: "tut-s1-md",
    type: "markdown",
    content: "## Writing Documentation with Markdown\n\nNotebooks tell a story. You can use **Markdown** cells (like this one) to explain your code.\n\nDouble-click this cell to see the source code!"
  },
  {
    id: "tut-s1-md-basic",
    type: "markdown",
    content: "### Basic Formatting\n\n- **Bold**: `**Text**`\n- *Italic*: `*Text*`\n- `Inline Code`: Backticks \\`\n\n#### Lists\n1. Ordered Item 1\n2. Ordered Item 2\n   - Unordered Sub-item\n   - Another Sub-item"
  },
  {
    id: "tut-s1-md-rich",
    type: "markdown",
    content: "### Rich Content: Quotes, Tables, and Images \n> **Blockquotes** are great for emphasizing notes or warnings.\n> Use the `>` character at the start of the line.\n#### Tables\nYou can create structured data tables:\n\n<br />\n\n| Item  | Quantity | Price |\n| ----- | -------- | ----- |\n| Apple | 5        | $1.00 |\n| Pear  | 2        | $2.50 |\n\n &nbsp;&nbsp; ${\\footnotesize \\textsf{Table 1: Fruit purchased in last shopping run}}$\n\n<br />\n\n#### Images\n\nYou can embed images using `![Alt Text](URL)`:\n\n<br />\n\n![](https://seas.harvard.edu/sites/default/files/2025-06/AdobeStock_417575370_0.jpeg) &nbsp;&nbsp; ${\\footnotesize \\textsf{Figure 1: Machine learning illustration}}$\n\n<br />\n\n#### Tips and tricks\n\nSome elements like lists, quote blocks, and headings space themselves apart from other content to provide natural separation from paragraph text. Images and tables do not. This is intentional! Its so that you can add captions above or below. You can put an empty line before and/or after to separate them more if you want. \n\n<br />\n\nTables and Images can sometimes add an empty line that can be hard to get rid of. Don't fret, there are a couple of ways. For lines after tables, you can press `SHIFT + RIGHT ARROW` key combo to highlight the empty line and then you can delete the light with the `BACKSPACE` or `DELETE` key. \n\n<br />\n\nIf there is content that comes after this empty line, you can also go to the beginning of the content and press `BACKSPACE` to remove the empty line.\n\n<br />\n\nFinally, if the empty line is at the very end, you can simply ignore it because it will not be included in the displayed result."
  },

  // --- Section 1.5: View Features ---
  {
    id: "tut-s1-view",
    type: "markdown",
    content: "## Keyboard Shortcuts & View Features\n\nWork faster by keeping your hands on the keyboard:\n\n- **Ctrl/Cmd + Enter**: Run cell.\n- **Shift + Enter**: Run and move to next cell.\n- **Alt + Backspace**: Clear cell output.\n- **Esc**: Exit Edit Mode (focus cell border).\n- **Enter**: Enter Edit Mode (focus editor).\n\n### Presentation Mode\nNeed to share your work? Click the **Presentation Icon** (projection screen) in the toolbar. This hides all menus and sidebars, giving you a clean, focused view of your content. Press `Esc` to exit."
  },

  // ============================================================================
  // PART 2: ADVANCED FEATURES
  // ============================================================================
  {
    id: "tut-part2",
    type: "markdown",
    content: "# Part 2: Advanced Features\n\nExplore interactive UI widgets, dynamic output, and powerful Pyodide capabilities."
  },

  // --- Section 2.1: Interactive UI ---
  {
    id: "tut-s2-ui",
    type: "markdown",
    content: "## Interactive UI with `pynote_ui`\n\nThe built-in `pynote_ui` package lets you create reactive widgets. Change the slider below to update the text in real-time."
  },
  {
    id: "tut-demo-ui",
    type: "code",
    content: "from pynote_ui import Slider, Text, Group\n\n# Define widgets\nsquare_slider = Slider(min=0, max=20, value=5, label=\"Square this number\")\nsquare_output = Text(content=\"Result: 25\")\n\n# Define interaction\ndef square_update(data):\n    val = int(data['value'])\n    square_output.content = f\"Result: {val**2}\"\n\nsquare_slider.on_update(square_update)\nGroup([square_slider, square_output])"
  },

  // --- Section 2.2: Component Layout ---
  {
    id: "tut-s2-layout",
    type: "markdown",
    content: "### Grouping & Layout\n\nUse `Group` to arrange components in rows or columns. Groups can be **nested** to create complex layouts!\n\n**Understanding `grow` vs `width`/`height`:**\n- `grow` controls sizing along the **container's direction** (horizontal in a row, vertical in a column)\n- `width`/`height` controls the **perpendicular direction**\n\nIn this example, the sliders use `grow=1` to share the row equally, while the text uses `width=\"100%\"` to stretch across the column."
  },
  {
    id: "tut-demo-layout",
    type: "code",
    content: "from pynote_ui import Slider, Text, Group\n\n# Create some widgets\ncalc_a = Slider(value=30, label=\"A\", grow=1)\ncalc_b = Slider(value=70, label=\"B\", grow=1)\ncalc_result = Text(content=\"A + B = 100\", width=\"100%\", align_h=\"center\")\n\ndef calc_update(data):\n    calc_result.content = f\"A + B = {int(calc_a.value + calc_b.value)}\"\ncalc_a.on_update(calc_update)\ncalc_b.on_update(calc_update)\n\n# Nested Groups: row of sliders inside a column\nGroup([\n    Group([calc_a, calc_b], layout=\"row\"),\n    calc_result\n], layout=\"col\", label=\"Calculator\", border=True)"
  },

  // --- Section 2.2b: Flex Distribution ---
  {
    id: "tut-s2-flex",
    type: "markdown",
    content: "### Space Sharing with `grow`\n\nBy default, components take their **natural size** (just enough space for their content). Use the `grow` argument to make them expand and share available space:\n\n- **No `grow`** (default): Component takes only the space it needs\n- **`grow=1`**: Component expands to fill available space\n- **`grow=2`**, **`grow=3`**, etc.: Component takes proportionally more space than others with lower grow values"
  },
  {
    id: "tut-demo-flex",
    type: "code",
    content: "from pynote_ui import Slider, Text, Group\n\n# Default: natural sizing (each takes only the space it needs)\nprint(\"Natural sizing (default):\")\nGroup([\n    Slider(value=30, label=\"A\"),\n    Slider(value=70, label=\"B\")\n], layout=\"row\", border=True)"
  },
  {
    id: "tut-demo-flex2",
    type: "code",
    content: "from pynote_ui import Slider, Text, Group\n\n# Equal distribution: both grow=1 means 50/50 split\nprint(\"Equal distribution (grow=1):\")\nGroup([\n    Slider(value=30, label=\"A\", grow=1),\n    Slider(value=70, label=\"B\", grow=1)\n], layout=\"row\", border=True)"
  },
  {
    id: "tut-demo-flex3",
    type: "code",
    content: "from pynote_ui import Slider, Group\n\n# Weighted distribution: 1:2 ratio\nprint(\"1:2 ratio:\")\nGroup([\n    Slider(value=30, label=\"Small\", grow=1),\n    Slider(value=70, label=\"Large\", grow=2)  # Takes 2x the space\n], layout=\"row\", border=True)"
  },

  // --- Section 2.3: Dimension Control ---
  {
    id: "tut-s2-dimensions",
    type: "markdown",
    content: "### Controlling Dimensions\n\nComponents accept `width`, `height`, and `force_dimensions` parameters. Numbers are treated as pixels, strings are used as-is (e.g., `\"50%\"`, `\"10rem\"`).\n\n- **Default behavior**: `width`/`height` set **minimum** dimensions (component can grow)\n- **`force_dimensions=True`**: Sets **exact** dimensions (component is fixed)"
  },
  {
    id: "tut-demo-dimensions",
    type: "code",
    content: "from pynote_ui import Slider, Text, Group\n\n# Fixed width sliders in a row\nGroup([\n    Slider(value=25, label=\"Fixed 200px\", width=200, force_dimensions=True),\n    Slider(value=75, label=\"Fixed 150px\", width=150, force_dimensions=True),\n], layout=\"row\", label=\"Fixed Width Components\", border=True)"
  },

  // --- Section 2.4: Display Function ---
  {
    id: "tut-s2-display",
    type: "markdown",
    content: "## Displaying UI Anywhere\n\nBy default, UI elements only appear when they're the **last expression** in a cell. The `display()` function lets you render UI elements **at any point** during execution.\n\n**Signature:** `display(*elements, inline=False, gap=1)`\n- `inline=False` (default): Each element on its own line\n- `inline=True`: Elements on the same line\n- `gap`: Spacing between elements (spaces if inline, blank lines if separate)"
  },
  {
    id: "tut-demo-display",
    type: "code",
    content: "from pynote_ui import Slider, Text, display\n\nprint(\"Creating interactive widgets...\")\n\ndisplay_slider = Slider(value=50, min=0, max=100, label=\"Adjustable Value\")\ndisplay_output = Text(content=\"Value: 50\")\n\ndef display_change(data):\n    display_output.content = f\"Value: {int(data['value'])}\"\ndisplay_slider.on_update(display_change)\n\ndisplay(display_slider, display_output)\n\nprint(\"☝️ Try moving the slider - the text updates in real-time!\")"
  },
  {
    id: "tut-s2-print",
    type: "markdown",
    content: "### Using `print()` with UI Elements\n\nFor convenience, you can also use Python's built-in `print()` function or f-strings to display widgets:"
  },
  {
    id: "tut-demo-print",
    type: "code",
    content: "from pynote_ui import Slider, Text\n\nvolume = Slider(value=75, min=0, max=100, label=\"🔊 Volume\")\nvol_text = Text(content=\"75%\")\n\ndef update_vol(data):\n    vol_text.content = f\"{int(data['value'])}%\"\nvolume.on_update(update_vol)\n\n# F-strings work and maintain interactivity!\nprint(f\"Volume: {volume} Level: {vol_text}\")"
  },

  // --- Section 2.5: Print Markdown ---
  {
    id: "tut-s2-printmd",
    type: "markdown",
    content: "## Rich Output with `print_md()`\n\nThe `print_md()` function outputs **formatted markdown** that looks just like markdown cells. You can even embed interactive widgets using f-strings!"
  },
  {
    id: "tut-demo-printmd",
    type: "code",
    content: "from pynote_ui import print_md, Slider, Text\n\nintensity_slider = Slider(value=50, min=0, max=100, label=\"Intensity\")\nintensity_text = Text(content=\"50%\")\nintensity_slider.on_update(lambda d: setattr(intensity_text, 'content', f\"{int(d['value'])}%\"))\n\nprint_md(f\"\"\"\n## Control Panel\n\nAdjust the **intensity** level:\n\n{intensity_slider}\n\nCurrent value: {intensity_text}\n\n---\n*Move the slider - the text updates in real-time!*\n\"\"\")"
  },
  {
    id: "tut-s2-printmd-note",
    type: "markdown",
    content: "### A Note on Embedded Components\n\n`print_md()` handles its own content processing, so components embedded within markdown may appear differently compared to standalone components. This is because markdown content flows as inline/block text.\n\nPass `styled=False` for a monospace look that matches stdout instead of prose styling."
  },

  // --- Section 2.6: Cross-Cell Communication ---
  {
    id: "tut-s2-crosscell",
    type: "markdown",
    content: "## Cross-Cell Communication\n\nUI elements can communicate **across cells** as long as both cells have been executed. Since Python variables persist in memory, you can reference widgets created in earlier cells.\n\n**Run both cells below in order** — moving the slider in Cell 1 will update the text in Cell 2!"
  },
  {
    id: "tut-demo-crosscell1",
    type: "code",
    content: "# Cell 1: Create the source slider\nfrom pynote_ui import Slider, display\n\ncross_slider = Slider(value=0, min=0, max=100, label=\"Source Slider\")\ndisplay(cross_slider)\nprint(\"☝️ This slider will control the text in the next cell\")"
  },
  {
    id: "tut-demo-crosscell2",
    type: "code",
    content: "# Cell 2: Create a text that responds to the slider from Cell 1\nfrom pynote_ui import Text, display\n\ncross_text = Text(content=\"Waiting for slider...\")\n\n# Connect to the slider defined in Cell 1\ndef on_slider_change(data):\n    cross_text.content = f\"Received: {int(data['value'])} from Cell 1!\"\n\ncross_slider.on_update(on_slider_change)\ndisplay(cross_text)\nprint(\"☝️ Now move the slider above - this text updates!\")"
  },

  // --- Section 2.7: Pyodide Features ---
  {
    id: "tut-s2-pyodide",
    type: "markdown",
    content: "## Pyodide Features\n\nSince Python runs in your browser via WebAssembly, you can interact with JavaScript and install Pure Python packages."
  },
  {
    id: "tut-demo-js",
    type: "code",
    content: "# JavaScript Interop\nimport js\n\n# Log directly to the browser console (F12)\njs.console.log(\"Hello from Python!\")\nprint(\"I just sent a message to the browser console.\")"
  },
  {
    id: "tut-demo-pip",
    type: "code",
    content: "# Package Installation\nimport micropip\n\n# Install a package from PyPI\nawait micropip.install(\"cowsay\")\nimport cowsay\ncowsay.cow(\"PyNote is powerful!\")"
  },

  // ============================================================================
  // API REFERENCE
  // ============================================================================
  {
    id: "tut-api-ref",
    type: "markdown",
    content: "## `pynote_ui` API Reference\n\nThis section provides a complete reference for all components and functions in the `pynote_ui` package."
  },
  {
    id: "tut-api-slider",
    type: "markdown",
    content: "### `Slider`\n\nAn interactive slider widget for numeric input.\n\n```python\nSlider(value=0, min=0, max=100, step=1, label=\"Slider\",\n       width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `value` | `int \\| float` | `0` | Initial value of the slider |\n| `min` | `int \\| float` | `0` | Minimum allowed value |\n| `max` | `int \\| float` | `100` | Maximum allowed value |\n| `step` | `int \\| float` | `1` | Increment step when moving the slider |\n| `label` | `str` | `\"Slider\"` | Label displayed above the slider |\n| `width` | `int \\| str \\| None` | `None` | Width of the component. Numbers → pixels, strings → CSS values |\n| `height` | `int \\| str \\| None` | `None` | Height of the component. Numbers → pixels, strings → CSS values |\n| `grow` | `int \\| None` | `None` | How much the component expands to fill space. `0` = only take needed space |\n| `shrink` | `int \\| None` | `None` | Whether the component can shrink. `0` = never shrink below its size |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n**Properties (read/write):**\n- `slider.value` — Get or set the current value. Setting triggers a UI update.\n\n**Methods:**\n- `slider.on_update(callback)` — Register a function to call when the user moves the slider. Callback receives `data` dict with `\"value\"` key."
  },
  {
    id: "tut-api-text",
    type: "markdown",
    content: "### `Text`\n\nA text display widget for showing dynamic content.\n\n```python\nText(content=\"\", width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `content` | `str` | `\"\"` | Text content to display |\n| `width` | `int \\| str \\| None` | `None` | Width of the component. Numbers → pixels, strings → CSS values |\n| `height` | `int \\| str \\| None` | `None` | Height of the component. Numbers → pixels, strings → CSS values |\n| `grow` | `int \\| None` | `None` | How much the component expands to fill space. `0` = only take needed space |\n| `shrink` | `int \\| None` | `None` | Whether the component can shrink. `0` = never shrink below its size |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n**Properties (read/write):**\n- `text.content` — Get or set the text content. Setting triggers a UI update."
  },
  {
    id: "tut-api-group",
    type: "markdown",
    content: "### `Group`\n\nA container for arranging child components in rows or columns. Groups can be nested.\n\n```python\nGroup(children, layout=\"col\", label=None, width=\"full\", height=None,\n      align=\"center\", grow=None, shrink=None, border=False, padding=None,\n      force_dimensions=False)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `children` | `list` | *(required)* | List of UI elements to contain |\n| `layout` | `str` | `\"col\"` | Layout direction: `\"col\"` (vertical) or `\"row\"` (horizontal) |\n| `label` | `str \\| None` | `None` | Optional label displayed above the group |\n| `width` | `int \\| str` | `\"full\"` | Width: `\"full\"` (100%), numbers → pixels, or CSS string |\n| `height` | `int \\| str \\| None` | `None` | Height of the container. Numbers → pixels, strings → CSS values |\n| `align` | `str` | `\"center\"` | Cross-axis alignment: `\"start\"`, `\"center\"`, `\"end\"`, `\"stretch\"` |\n| `grow` | `int \\| None` | `None` | How much this Group expands when nested inside another Group |\n| `shrink` | `int \\| None` | `None` | Whether this Group can shrink when nested inside another Group |\n| `border` | `bool` | `False` | If `True`, shows a visible border around the group |\n| `padding` | `int \\| str \\| None` | `None` | CSS padding. Default: all sides if border, top/bottom if label only |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n**Properties (read/write):**\n- `group.layout`, `group.label`, `group.width`, `group.height`, `group.align`, `group.grow`, `group.shrink`, `group.border`, `group.padding`"
  },
  {
    id: "tut-api-display",
    type: "markdown",
    content: "### `display()`\n\nRender one or more UI elements immediately in the output stream.\n\n```python\ndisplay(*elements, inline=False, gap=1)\n```\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `*elements` | `UIElement` | *(required)* | One or more UI elements to display |\n| `inline` | `bool` | `False` | If `True`, display elements on the same line |\n| `gap` | `int` | `1` | Spacing between elements (spaces if inline, blank lines if separate) |\n\n**Usage:**\n\n```python\nfrom pynote_ui import Slider, Text, display\n\nslider = Slider(value=50)\ntext = Text(content=\"Hello\")\n\ndisplay(slider)                      # Single element\ndisplay(slider, text)                # Separate lines (default)\ndisplay(slider, text, inline=True)   # Same line\ndisplay(slider, text, gap=2)         # 2 blank lines between\n```\n\n**Note:** Unlike the last-expression behavior, `display()` outputs widgets **immediately** during execution, allowing interleaved text and UI."
  },
  {
    id: "tut-api-printmd",
    type: "markdown",
    content: "### `print_md()`\n\nOutput formatted markdown content to the cell output.\n\n```python\nprint_md(content, styled=True)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `content` | `str` | *(required)* | Markdown string to render. Supports f-strings with embedded UI elements. |\n| `styled` | `bool` | `True` | If `True`, renders with prose styling (like markdown cells). If `False`, renders with monospace appearance. |\n\n**Usage:**\n\n```python\nfrom pynote_ui import print_md, Slider\n\nprint_md(\"# Heading\\n\\n**Bold** text\")\n\nslider = Slider(value=50)\nprint_md(f\"Value: {slider}\")  # Embed interactive widget\n\nprint_md(\"# Code-style\", styled=False)  # Monospace output\n```"
  }
];
