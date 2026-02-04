import type { CellData } from "../store";

export const tutorialAPICells: CellData[] = [
    // Table of contents
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

<br />

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI](?open=tutorial_ui)** | Sliders, text, groups, layouts, and display functions |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components *(you are here)* |

<br />

---`
    },

    // ============================================================================
    // API REFERENCE
    // ============================================================================
    {
        id: "tut-api-intro",
        type: "markdown",
        content: "# `pynote_ui` API Reference\n\nThis section provides a complete reference for all components and functions in the `pynote_ui` package."
    },

    // --- Slider ---
    {
        id: "tut-api-slider",
        type: "markdown",
        content: "## `Slider`\n\nAn interactive slider widget for numeric input.\n\n```python\nSlider(value=0, min=0, max=100, step=1, label=\"Slider\",\n       width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `value` | `int \\| float` | `0` | Initial value of the slider |\n| `min` | `int \\| float` | `0` | Minimum allowed value |\n| `max` | `int \\| float` | `100` | Maximum allowed value |\n| `step` | `int \\| float` | `1` | Increment step when moving the slider |\n| `label` | `str` | `\"Slider\"` | Label displayed above the slider |\n| `width` | `int \\| str \\| None` | `None` | Width of the component. Numbers → pixels, strings → CSS values |\n| `height` | `int \\| str \\| None` | `None` | Height of the component. Numbers → pixels, strings → CSS values |\n| `grow` | `int \\| None` | `None` | How much the component expands to fill space. `0` = only take needed space |\n| `shrink` | `int \\| None` | `None` | Whether the component can shrink. `0` = never shrink below its size |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n**Properties (read/write):**\n- `slider.value` — Get or set the current value. Setting triggers a UI update.\n\n**Methods:**\n- `slider.on_update(callback)` — Register a function to call when the user moves the slider. Callback receives `data` dict with `\"value\"` key."
    },

    // --- Text ---
    {
        id: "tut-api-text",
        type: "markdown",
        content: "## `Text`\n\nA text display widget for showing dynamic content.\n\n```python\nText(content=\"\", width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `content` | `str` | `\"\"` | Text content to display |\n| `width` | `int \\| str \\| None` | `None` | Width of the component. Numbers → pixels, strings → CSS values |\n| `height` | `int \\| str \\| None` | `None` | Height of the component. Numbers → pixels, strings → CSS values |\n| `grow` | `int \\| None` | `None` | How much the component expands to fill space. `0` = only take needed space |\n| `shrink` | `int \\| None` | `None` | Whether the component can shrink. `0` = never shrink below its size |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n**Properties (read/write):**\n- `text.content` — Get or set the text content. Setting triggers a UI update."
    },

    // --- Group ---
    {
        id: "tut-api-group",
        type: "markdown",
        content: "## `Group`\n\nA container for arranging child components in rows or columns. Groups can be nested.\n\n```python\nGroup(children, layout=\"col\", label=None, width=\"full\", height=None,\n      align=\"center\", grow=None, shrink=None, border=False, padding=None,\n      force_dimensions=False)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `children` | `list` | *(required)* | List of UI elements to contain |\n| `layout` | `str` | `\"col\"` | Layout direction: `\"col\"` (vertical) or `\"row\"` (horizontal) |\n| `label` | `str \\| None` | `None` | Optional label displayed above the group |\n| `width` | `int \\| str` | `\"full\"` | Width: `\"full\"` (100%), numbers → pixels, or CSS string |\n| `height` | `int \\| str \\| None` | `None` | Height of the container. Numbers → pixels, strings → CSS values |\n| `align` | `str` | `\"center\"` | Cross-axis alignment: `\"start\"`, `\"center\"`, `\"end\"`, `\"stretch\"` |\n| `grow` | `int \\| None` | `None` | How much this Group expands when nested inside another Group |\n| `shrink` | `int \\| None` | `None` | Whether this Group can shrink when nested inside another Group |\n| `border` | `bool` | `False` | If `True`, shows a visible border around the group |\n| `padding` | `int \\| str \\| None` | `None` | CSS padding. Default: all sides if border, top/bottom if label only |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n**Properties (read/write):**\n- `group.layout`, `group.label`, `group.width`, `group.height`, `group.align`, `group.grow`, `group.shrink`, `group.border`, `group.padding`"
    },

    // --- display() ---
    {
        id: "tut-api-display",
        type: "markdown",
        content: "## `display()`\n\nRender one or more UI elements immediately in the output stream.\n\n```python\ndisplay(*elements, inline=False, gap=1)\n```\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `*elements` | `UIElement` | *(required)* | One or more UI elements to display |\n| `inline` | `bool` | `False` | If `True`, display elements on the same line |\n| `gap` | `int` | `1` | Spacing between elements (spaces if inline, blank lines if separate) |\n\n**Usage:**\n\n```python\nfrom pynote_ui import Slider, Text, display\n\nslider = Slider(value=50)\ntext = Text(content=\"Hello\")\n\ndisplay(slider)                      # Single element\ndisplay(slider, text)                # Separate lines (default)\ndisplay(slider, text, inline=True)   # Same line\ndisplay(slider, text, gap=2)         # 2 blank lines between\n```\n\n**Note:** Unlike the last-expression behavior, `display()` outputs widgets **immediately** during execution, allowing interleaved text and UI."
    },

    // --- print_md() ---
    {
        id: "tut-api-printmd",
        type: "markdown",
        content: "## `print_md()`\n\nOutput formatted markdown content to the cell output.\n\n```python\nprint_md(content, styled=True)\n```\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `content` | `str` | *(required)* | Markdown string to render. Supports f-strings with embedded UI elements. |\n| `styled` | `bool` | `True` | If `True`, renders with prose styling (like markdown cells). If `False`, renders with monospace appearance. |\n\n**Usage:**\n\n```python\nfrom pynote_ui import print_md, Slider\n\nprint_md(\"# Heading\\n\\n**Bold** text\")\n\nslider = Slider(value=50)\nprint_md(f\"Value: {slider}\")  # Embed interactive widget\n\nprint_md(\"# Code-style\", styled=False)  # Monospace output\n```"
    },

    // --- Chart API Reference ---
    {
        id: "tut-api-charts",
        type: "markdown",
        content: `## Chart API Quick Reference

### \`Plot\` (Observable Plot)
\`\`\`python
Plot(data, x=None, y=None, mark="line", fill=None, stroke=None, 
     z=None, r=None, symbol=None, curve="linear", sort=None,
     thresholds=None, title=None, width="full", height=380, 
     border=True, title_style=None, **kwargs)
\`\`\`
- \`data\`: List of dicts \`[{"x": 1, "y": 2}, ...]\`
- \`mark\`: \`"line"\`, \`"dot"\`/\`"dotY"\`/\`"dotX"\`, \`"bar"\`/\`"barY"\`/\`"barX"\`, \`"area"\`, \`"rect"\`, \`"cell"\`, \`"rule"\`, \`"box"\`, \`"density"\`, \`"waffleY"\`, \`"waffleX"\`, \`"hexbin"\`
- **Channels** (data → visual): \`x\`, \`y\`, \`z\` (series), \`fill\`, \`stroke\`, \`opacity\`, \`r\` (size), \`symbol\`
- **Transforms**: \`sort\` (order), \`thresholds\` (bins), \`reduce\` (aggregate), \`interval\` (regularize)
- **Curve**: \`"linear"\`, \`"step"\`, \`"basis"\`, \`"catmull-rom"\`, \`"monotone-x"\`, \`"natural"\`
- **Stacked dots**: \`mark="dotY"\` or \`mark="dotX"\` for automatic stacking
- **Waffle options**: \`unit\` (qty per cell), \`gap\` (cell spacing), \`rx\` (corner radius, \`"100%"\` for circles)
- **Hexbin options**: \`bin_width\` (hex size in px), \`color_scheme\` (\`"turbo"\`, \`"viridis"\`, \`"YlGnBu"\`, etc.)
- \`width\`: Number (pixels), \`"full"\`, or \`"100%"\` (default: \`"full"\`)
- Update via \`plot.data = new_data\`

**Convenience functions**: \`scatter()\`, \`line()\`, \`area()\`, \`bar()\`, \`histogram()\`, \`boxplot()\`, \`heatmap()\`, \`density()\`, \`rule()\`, \`waffle()\`, \`hexbin()\`, \`stacked_dots()\``
    },
    {
        id: "tut-api-timeseries",
        type: "markdown",
        content: `### \`TimeSeries\` (uPlot)
\`\`\`python
TimeSeries(data, series=None, title=None, xType="time", 
           width="full", height=350, border=True, title_style=None, ...)
\`\`\`
- \`data\`: Dict \`{"x": [...], "y": [...]}\` or nested arrays \`[[x], [y1], [y2]]\`
- \`series\`: List of \`{"label": ..., "stroke": "#color"}\` (stroke optional, uses theme)
- \`xType\`: \`"time"\` (Unix timestamps) or \`"numeric"\`
- \`width\`: Number, \`"full"\`, or \`"100%"\` (default: \`"full"\`)`
    },
    {
        id: "tut-api-frappe",
        type: "markdown",
        content: `### \`Chart\` (Frappe)
\`\`\`python
Chart(type, data, title=None, width="full", height=300, 
      colors=None, border=True, title_style=None, ...)
\`\`\`
- \`type\`: \`"pie"\`, \`"donut"\`, \`"percentage"\`, \`"bar"\`, \`"line"\`, \`"heatmap"\`
- \`data\` for pie: \`{"labels": [...], "values": [...]}\`
- \`data\` for bar/line: \`{"labels": [...], "datasets": [{"values": [...]}]}\`
- \`colors\`: Custom palette (default: auto-generated from theme accent)`
    },
    {
        id: "tut-api-common",
        type: "markdown",
        content: `### Common Props (all chart types)
- \`width\`, \`height\`: Component dimensions (numbers → pixels, strings → CSS values)
- \`force_dimensions\`: If \`True\`, sets exact dimensions. If \`False\` (default), dimensions are minimums
- \`border\`: Show border (default: True)
- \`border_radius\`, \`border_width\`, \`border_color\`: Customize border

### Style Customization (all chart types)
All charts accept style dicts to override defaults:
- \`title_style\`: Title text, e.g., \`{"fontSize": "18px", "fontWeight": "bold"}\`
- \`x_label_style\`, \`y_label_style\`: Axis label styles
- \`tick_style\`: Tick/number label style
- \`grid_style\`: Grid lines, e.g., \`{"stroke": "#ccc", "strokeOpacity": 0.5}\`
- \`axis_style\`: Axis line style

Example:
\`\`\`python
Plot(data, x="x", y="y", title="My Chart",
     title_style={"fontSize": "20px", "fontWeight": "bold"},
     grid_style={"stroke": "#eee"})
\`\`\``
    },

    // --- Navigation ---
    {
        id: "tut-api-nav",
        type: "markdown",
        content: `---

<br />

## 📚 Full Tutorial Navigation


| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI](?open=tutorial_ui)** | Sliders, text, groups, layouts, and display functions |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |  

<br />

Happy coding! 🐍`
    }
];
