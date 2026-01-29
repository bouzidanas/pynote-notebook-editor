import type { CellData } from "../store";

export const tutorialUICells: CellData[] = [
    // Table of contents (with modified "you are here")
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI](?open=tutorial_ui)** | Sliders, text, groups, layouts, and display functions *(you are here)* |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

<br />

---`
    },

    // ============================================================================
    // INTERACTIVE UI
    // ============================================================================
    {
        id: "tut-ui-intro",
        type: "markdown",
        content: "# Interactive UI with `pynote_ui`\n\nThe built-in `pynote_ui` package lets you create reactive widgets. This tutorial covers sliders, text displays, layout groups, and how to output UI elements anywhere in your code."
    },

    // --- Section: Basic Widgets ---
    {
        id: "tut-ui-basic",
        type: "markdown",
        content: "## Basic Widgets: Slider & Text\n\nChange the slider below to update the text in real-time."
    },
    {
        id: "tut-demo-ui",
        type: "code",
        content: "from pynote_ui import Slider, Text, Group\n\n# Define widgets\nsquare_slider = Slider(min=0, max=20, value=5, label=\"Square this number\")\nsquare_output = Text(content=\"Result: 25\")\n\n# Define interaction\ndef square_update(data):\n    val = int(data['value'])\n    square_output.content = f\"Result: {val**2}\"\n\nsquare_slider.on_update(square_update)\nGroup([square_slider, square_output])"
    },

    // --- Section: Component Layout ---
    {
        id: "tut-ui-layout",
        type: "markdown",
        content: "## Grouping & Layout\n\nUse `Group` to arrange components in rows or columns. Groups can be **nested** to create complex layouts!\n\n**Understanding `grow` vs `width`/`height`:**\n- `grow` controls sizing along the **container's direction** (horizontal in a row, vertical in a column)\n- `width`/`height` controls the **perpendicular direction**\n\nIn this example, the sliders use `grow=1` to share the row equally, while the text uses `width=\"100%\"` to stretch across the column."
    },
    {
        id: "tut-demo-layout",
        type: "code",
        content: "from pynote_ui import Slider, Text, Group\n\n# Create some widgets\ncalc_a = Slider(value=30, label=\"A\", grow=1)\ncalc_b = Slider(value=70, label=\"B\", grow=1)\ncalc_result = Text(content=\"A + B = 100\", width=\"100%\", align_h=\"center\")\n\ndef calc_update(data):\n    calc_result.content = f\"A + B = {int(calc_a.value + calc_b.value)}\"\ncalc_a.on_update(calc_update)\ncalc_b.on_update(calc_update)\n\n# Nested Groups: row of sliders inside a column\nGroup([\n    Group([calc_a, calc_b], layout=\"row\"),\n    calc_result\n], layout=\"col\", label=\"Calculator\", border=True)"
    },

    // --- Section: Flex Distribution ---
    {
        id: "tut-ui-flex",
        type: "markdown",
        content: "## Space Sharing with `grow`\n\nBy default, components take their **natural size** (just enough space for their content). Use the `grow` argument to make them expand and share available space:\n\n- **No `grow`** (default): Component takes only the space it needs\n- **`grow=1`**: Component expands to fill available space\n- **`grow=2`**, **`grow=3`**, etc.: Component takes proportionally more space than others with lower grow values"
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

    // --- Section: Dimension Control ---
    {
        id: "tut-ui-dimensions",
        type: "markdown",
        content: "## Controlling Dimensions\n\nComponents accept `width`, `height`, and `force_dimensions` parameters. Numbers are treated as pixels, strings are used as-is (e.g., `\"50%\"`, `\"10rem\"`).\n\n- **Default behavior**: `width`/`height` set **minimum** dimensions (component can grow)\n- **`force_dimensions=True`**: Sets **exact** dimensions (component is fixed)"
    },
    {
        id: "tut-demo-dimensions",
        type: "code",
        content: "from pynote_ui import Slider, Text, Group\n\n# Fixed width sliders in a row\nGroup([\n    Slider(value=25, label=\"Fixed 200px\", width=200, force_dimensions=True),\n    Slider(value=75, label=\"Fixed 150px\", width=150, force_dimensions=True),\n], layout=\"row\", label=\"Fixed Width Components\", border=True)"
    },

    // --- Section: Display Function ---
    {
        id: "tut-ui-display",
        type: "markdown",
        content: "## Displaying UI Anywhere\n\nBy default, UI elements only appear when they're the **last expression** in a cell. The `display()` function lets you render UI elements **at any point** during execution.\n\n**Signature:** `display(*elements, inline=False, gap=1)`\n- `inline=False` (default): Each element on its own line\n- `inline=True`: Elements on the same line\n- `gap`: Spacing between elements (spaces if inline, blank lines if separate)"
    },
    {
        id: "tut-demo-display",
        type: "code",
        content: "from pynote_ui import Slider, Text, display\n\nprint(\"Creating interactive widgets...\")\n\ndisplay_slider = Slider(value=50, min=0, max=100, label=\"Adjustable Value\", width=\"100%\")\ndisplay_output = Text(content=\"Value: 50\", width=\"100%\")\n\ndef display_change(data):\n    display_output.content = f\"Value: {int(data['value'])}\"\ndisplay_slider.on_update(display_change)\n\ndisplay(display_slider, display_output)\n\nprint(\"☝️ Try moving the slider - the text updates in real-time!\")"
    },
    {
        id: "tut-ui-print",
        type: "markdown",
        content: "### Using `print()` with UI Elements\n\nFor convenience, you can also use Python's built-in `print()` function or f-strings to display widgets:"
    },
    {
        id: "tut-demo-print",
        type: "code",
        content: "from pynote_ui import Slider, Text\n\nvolume = Slider(value=75, min=0, max=100, label=\"🔊 Volume\", width=\"100%\")\nvol_text = Text(content=\"75%\")\n\ndef update_vol(data):\n    vol_text.content = f\"{int(data['value'])}%\"\nvolume.on_update(update_vol)\n\n# F-strings work and maintain interactivity!\nprint(f\"Volume: {volume} Level: {vol_text}\")"
    },

    // --- Section: Print Markdown ---
    {
        id: "tut-ui-printmd",
        type: "markdown",
        content: "## Rich Output with `print_md()`\n\nThe `print_md()` function outputs **formatted markdown** that looks just like markdown cells. You can even embed interactive widgets using f-strings!"
    },
    {
        id: "tut-demo-printmd",
        type: "code",
        content: "from pynote_ui import print_md, Slider, Text\n\nintensity_slider = Slider(value=50, min=0, max=100, label=\"Intensity\", width=\"100%\")\nintensity_text = Text(content=\"50%\", width=\"100%\")\nintensity_slider.on_update(lambda d: setattr(intensity_text, 'content', f\"{int(d['value'])}%\"))\n\nprint_md(f\"\"\"\n## Control Panel\n\nAdjust the **intensity** level:\n\n{intensity_slider}\n\nCurrent value: {intensity_text}\n\n---\n*Move the slider - the text updates in real-time!*\n\"\"\")"
    },
    {
        id: "tut-ui-printmd-note",
        type: "markdown",
        content: "### A Note on Embedded Components\n\n`print_md()` handles its own content processing, so components embedded within markdown may appear differently compared to standalone components. This is because markdown content flows as inline/block text.\n\nPass `styled=False` for a monospace look that matches stdout instead of prose styling."
    },

    // --- Section: Cross-Cell Communication ---
    {
        id: "tut-ui-crosscell",
        type: "markdown",
        content: "## Cross-Cell Communication\n\nUI elements can communicate **across cells** as long as both cells have been executed. Since Python variables persist in memory, you can reference widgets created in earlier cells.\n\n**Run both cells below in order** — moving the slider in Cell 1 will update the text in Cell 2!"
    },
    {
        id: "tut-demo-crosscell1",
        type: "code",
        content: "# Cell 1: Create the source slider\nfrom pynote_ui import Slider, display\n\ncross_slider = Slider(value=0, min=0, max=100, label=\"Source Slider\", width=\"100%\")\ndisplay(cross_slider)\nprint(\"☝️ This slider will control the text in the next cell\")"
    },
    {
        id: "tut-demo-crosscell2",
        type: "code",
        content: "# Cell 2: Create a text that responds to the slider from Cell 1\nfrom pynote_ui import Text, display\n\ncross_text = Text(content=\"Waiting for slider...\", width=\"100%\")\n\n# Connect to the slider defined in Cell 1\ndef on_slider_change(data):\n    cross_text.content = f\"Received: {int(data['value'])} from Cell 1!\"\n\ncross_slider.on_update(on_slider_change)\ndisplay(cross_text)\nprint(\"☝️ Now move the slider above - this text updates!\")"
    },

    // --- Next Steps ---
    {
        id: "tut-ui-next",
        type: "markdown",
        content: `---

<br />

## 🎉 Interactive UI Complete!

You now know how to build reactive interfaces with \`pynote_ui\`. Continue your learning:

| Next Tutorial | What You'll Learn |
|---------------|-------------------|
| **[Charts & Plotting](?open=tutorial_charts)** | Create beautiful visualizations with Observable Plot, uPlot, and Frappe |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

Or go back to **[Quick Start](?open=tutorial)** to review the basics.`
    }
];
