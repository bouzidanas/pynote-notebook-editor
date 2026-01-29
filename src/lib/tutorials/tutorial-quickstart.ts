import type { CellData } from "../store";

// Table of contents cell that appears at the top of all tutorials
export const tableOfContentsCells: CellData[] = [
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown *(you are here)* |
| **[Interactive UI](?open=tutorial_ui)** | Sliders, text, groups, layouts, and display functions |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

<br />

---`
    }
];

export const tutorialQuickstartCells: CellData[] = [
    // Table of contents
    ...tableOfContentsCells,

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
        content: "# 1. Result (Last Expression)\n# If the last line is a value, it is displayed automatically.\n\n[x**2 for x in range(10)]",
        // Force show result output for this cell (overrides document-level setting)
        metadata: {
            pynote: {
                codeview: {
                    showResult: true
                }
            }
        }
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

    // --- Section 1.6: Pyodide Features ---
    {
        id: "tut-s1-pyodide",
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

    // --- Next Steps ---
    {
        id: "tut-next",
        type: "markdown",
        content: `---

<br />

## 🎉 Quick Start Complete!

You now know the basics of PyNote. Continue your learning:

| Next Tutorial | What You'll Learn |
|---------------|-------------------|
| **[Interactive UI](?open=tutorial_ui)** | Build reactive widgets with sliders, text, and groups |
| **[Charts & Plotting](?open=tutorial_charts)** | Create beautiful visualizations with Observable Plot, uPlot, and Frappe |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

Happy coding! 🐍`
    }
];
