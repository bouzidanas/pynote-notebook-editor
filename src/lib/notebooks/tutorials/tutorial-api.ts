import type { CellData } from "../../store";

export const tutorialAPICells: CellData[] = [
    // Table of contents
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, colors, sizes, and states |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components *(you are here)* |

---`
    },

    // ============================================================================
    // API REFERENCE
    // ============================================================================
    {
        id: "tut-api-intro",
        type: "markdown",
        content: "# `pynote_ui` API Reference\n\nThis section provides a complete reference for all components and functions in the `pynote_ui` package.\n\n**Display & Input:** `Slider`, `Text`, `Button`, `Input`, `Textarea`\n\n**Selection & Boolean:** `Select`, `Toggle`, `Checkbox`\n\n**Layout & Containers:** `Group`, `Form`\n\n**Display Functions:** `display()`, `print_md()`\n\n**Chart Libraries:** `oplot` (Observable Plot), `uplot` (uPlot TimeSeries), `fplot` (Frappe Charts)\n\n*Note: All components can be used anywhere - inside forms, in groups, or standalone.*\n\n---\n\n### Theme-Configurable Colors\n\nMost components accept a `color` parameter using these **theme-configurable** values:\n- `\"primary\"` — Primary color\n- `\"secondary\"` — Secondary color\n- `\"accent\"` — Accent color\n- `\"neutral\"` — Neutral foreground color\n- `\"info\"` — Informational blue\n- `\"success\"` — Success green\n- `\"warning\"` — Warning yellow/orange\n- `\"error\"` — Error red\n\nAll colors automatically adapt to your active theme.\n\n---"
    },

    // --- Slider ---
    {
        id: "tut-api-slider",
        type: "markdown",
        content: "## `Slider`\n\nAn interactive slider widget for numeric input.\n\n```python\nSlider(value=0, min=0, max=100, step=1, label=\"Slider\", size=None,\n       width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `value` | `int \\| float` | `0` | Initial value of the slider |\n| `min` | `int \\| float` | `0` | Minimum allowed value |\n| `max` | `int \\| float` | `100` | Maximum allowed value |\n| `step` | `int \\| float` | `1` | Increment step when moving the slider |\n| `label` | `str` | `\"Slider\"` | Label displayed above the slider |\n| `size` | `str \\| None` | `None` | Size preset: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` (affects track, thumb, padding, font sizes) |\n| `width` | `int \\| str \\| None` | `None` | Width of the component. Numbers → pixels, strings → CSS values |\n| `height` | `int \\| str \\| None` | `None` | Height of the component. Numbers → pixels, strings → CSS values |\n| `grow` | `int \\| None` | `None` | How much the component expands to fill space. `0` = only take needed space |\n| `shrink` | `int \\| None` | `None` | Whether the component can shrink. `0` = never shrink below its size |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n<br/>\n\n**Properties (read/write):**\n- `slider.value` — Get or set the current value. Setting triggers a UI update.\n\n**Methods:**\n- `slider.on_update(callback)` — Register a function to call when the user moves the slider. Callback receives `data` dict with `\"value\"` key."
    },

    // --- Text ---
    {
        id: "tut-api-text",
        type: "markdown",
        content: "## `Text`\n\nA text display widget for showing dynamic content.\n\n```python\nText(content=\"\", size=None, width=None, height=None, grow=None, shrink=None,\n     force_dimensions=False, align_h=\"left\", align_v=\"top\")\n```\n\n <br/>\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `content` | `str` | `\"\"` | Text content to display |\n| `size` | `str \\| None` | `None` | Size preset: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` (affects padding and font size) |\n| `width` | `int \\| str \\| None` | `None` | Width of the component. Numbers → pixels, strings → CSS values |\n| `height` | `int \\| str \\| None` | `None` | Height of the component. Numbers → pixels, strings → CSS values |\n| `grow` | `int \\| None` | `None` | How much the component expands to fill space. `0` = only take needed space |\n| `shrink` | `int \\| None` | `None` | Whether the component can shrink. `0` = never shrink below its size |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n| `align_h` | `str` | `\"left\"` | Horizontal alignment: `\"left\"`, `\"center\"`, `\"right\"` |\n| `align_v` | `str` | `\"top\"` | Vertical alignment: `\"top\"`, `\"center\"`, `\"bottom\"` |\n\n<br/>\n\n**Properties (read/write):**\n- `text.content` — Get or set the text content. Setting triggers a UI update."
    },

    // --- Group ---
    {
        id: "tut-api-group",
        type: "markdown",
        content: "## `Group`\n\nA container for arranging child components in rows or columns. Groups can be nested.\n\n```python\nGroup(children, layout=\"col\", label=None, width=\"full\", height=None,\n      align=\"center\", grow=None, shrink=None, border=False, padding=None,\n      gap=None, overflow=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `children` | `list` | *(required)* | List of UI elements to contain |\n| `layout` | `str` | `\"col\"` | Layout direction: `\"col\"` (vertical) or `\"row\"` (horizontal) |\n| `label` | `str \\| None` | `None` | Optional label displayed above the group |\n| `width` | `int \\| str` | `\"full\"` | Width: `\"full\"` (100%), numbers → pixels, or CSS string |\n| `height` | `int \\| str \\| None` | `None` | Height of the container. Numbers → pixels, strings → CSS values |\n| `align` | `str` | `\"center\"` | Cross-axis alignment: `\"start\"`, `\"center\"`, `\"end\"`, `\"stretch\"` |\n| `grow` | `int \\| None` | `None` | How much this Group expands when nested inside another Group |\n| `shrink` | `int \\| None` | `None` | Whether this Group can shrink when nested inside another Group |\n| `border` | `bool \\| str` | `False` | Border style: `True` (default border), `False`/`\"none\"` (no border), or CSS string |\n| `padding` | `int \\| str \\| None` | `None` | CSS padding. Default: all sides if border, top/bottom if label only |\n| `gap` | `int \\| str \\| None` | `3` | Spacing between children. Numbers use Tailwind scale, strings are CSS values |\n| `overflow` | `str \\| None` | `None` | Overflow behavior: `\"visible\"`, `\"hidden\"`, `\"scroll\"`, `\"auto\"`, `\"scroll-x\"`, `\"scroll-y\"` |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n<br/>\n\n**Properties (read/write):**\n- `group.layout`, `group.label`, `group.width`, `group.height`, `group.align`, `group.overflow`"
    },

    // --- Form ---
    {
        id: "tut-api-form",
        type: "markdown",
        content: "## `Form`\n\nA container that defers child component updates until a submit button is clicked. Perfect for collecting multiple inputs before processing.\n\n```python\nForm(children, layout=\"col\", label=None, width=\"full\", height=None,\n     align=\"center\", grow=None, shrink=None, border=True, padding=None,\n     gap=None, overflow=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `children` | `list` | *(required)* | List of UI elements to contain. Include a Button with `button_type=\"submit\"` to trigger submission |\n| `layout` | `str` | `\"col\"` | Layout direction: `\"col\"` (vertical) or `\"row\"` (horizontal) |\n| `label` | `str \\| None` | `None` | Optional label displayed above the form |\n| `width` | `int \\| str` | `\"full\"` | Width: `\"full\"` (100%), numbers → pixels, or CSS string |\n| `height` | `int \\| str \\| None` | `None` | Height of the container. Numbers → pixels, strings → CSS values |\n| `align` | `str` | `\"center\"` | Cross-axis alignment: `\"start\"`, `\"center\"`, `\"end\"`, `\"stretch\"` |\n| `grow` | `int \\| None` | `None` | How much this Form expands when nested inside a Group |\n| `shrink` | `int \\| None` | `None` | Whether this Form can shrink when nested inside a Group |\n| `border` | `bool \\| str` | `True` | Border style: `True` (default border), `False`/`\"none\"` (no border), or CSS string |\n| `padding` | `int \\| str \\| None` | `None` | CSS padding. Default: all sides if border, top/bottom if label only |\n| `gap` | `int \\| str \\| None` | `3` | Spacing between children. Numbers use Tailwind scale, strings are CSS values |\n| `overflow` | `str \\| None` | `None` | Overflow behavior: `\"visible\"`, `\"hidden\"`, `\"scroll\"`, `\"auto\"`, `\"scroll-x\"`, `\"scroll-y\"` |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions. If `False`, dimensions are minimums |\n\n<br/>\n\n**Properties (read/write):**\n- `form.value` (read-only) — Dictionary of all child values, populated after submit\n- `form.layout`, `form.label`, `form.width`, `form.height`\n\n<br/>\n\n**How it works:**\n1. Child input components defer updates until submit\n2. When a Button with `button_type=\"submit\"` is clicked, Form collects all values\n3. Values accessible via `form.value` dict AND individual components (`input.value`, etc.)\n\n**Example:**\n```python\nname = Input(placeholder=\"Name\")\nemail = Input(placeholder=\"Email\")\nsubmit = Button(label=\"Submit\", button_type=\"submit\")\n\nform = Form([name, email, submit])\n# After submit: form.value = {\"<id1>\": \"...\", \"<id2>\": \"...\"}\n# Also: name.value and email.value are populated\n```"
    },

    // --- Button ---
    {
        id: "tut-api-button",
        type: "markdown",
        content: "## `Button`\n\nA clickable button that triggers actions.\n\n```python\nButton(label=\"Button\", button_type=None, color=None, style=None, size=None,\n       disabled=False, loading=False, width=None, height=None, grow=None,\n       shrink=None, force_dimensions=False, border=True)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `label` | `str` | `\"Button\"` | Text displayed on the button |\n| `button_type` | `str \\| None` | `None` | Button type: `\"default\"` (normal), `\"primary\"` (styled primary), `\"submit\"` (triggers form submission) |\n| `color` | `str \\| None` | `None` | Color theme: `\"primary\"`, `\"secondary\"`, `\"accent\"`, `\"info\"`, `\"success\"`, `\"warning\"`, `\"error\"`, `\"neutral\"` |\n| `style` | `str \\| None` | `None` | Visual style: `\"outline\"`, `\"dash\"`, `\"soft\"`, `\"ghost\"`, `\"link\"` |\n| `size` | `str \\| None` | `None` | Size: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` |\n| `disabled` | `bool` | `False` | If `True`, button is non-interactive |\n| `loading` | `bool` | `False` | If `True`, shows a loading spinner |\n| `width` | `int \\| str \\| None` | `None` | Width of the component |\n| `height` | `int \\| str \\| None` | `None` | Height of the component |\n| `grow` | `int \\| None` | `None` | Flex grow factor |\n| `shrink` | `int \\| None` | `None` | Flex shrink factor |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions |\n| `border` | `bool \\| str` | `True` | Border style: `True` (default), `False`/`\"none\"` (no border), or CSS string |\n\n<br/>\n\n**Properties (read/write):**\n- `button.label` — Get or set the button text\n- `button.disabled` — Enable/disable the button\n- `button.loading` — Show/hide loading state\n- `button.size` — Change size dynamically\n\n**Methods:**\n- `button.on_update(callback)` — Register a function to call when clicked. Callback receives `{\"clicked\": True, \"label\": \"button_label\"}`.\n\n<br/>\n\n**Button Types:**\n- `button_type=\"default\"` or `None` — Normal button behavior\n- `button_type=\"primary\"` — Always filled background with brightness hover effect\n- `button_type=\"submit\"` — When inside a Form, triggers form submission instead of immediate callback"
    },

    // --- Select ---
    {
        id: "tut-api-select",
        type: "markdown",
        content: "## `Select`\n\nA dropdown for picking from a list of options.\n\n```python\nSelect(choices=None, value=None, placeholder=\"Select an option\", color=None, size=None,\n       disabled=False, width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `choices` | `list` | `[]` | List of choices. Can be strings or `{\"label\": str, \"value\": str}` dicts |\n| `value` | `str \\| None` | `None` | Currently selected value |\n| `placeholder` | `str` | `\"Select an option\"` | Placeholder text shown when no value selected |\n| `color` | `str \\| None` | `None` | Color theme: `\"primary\"`, `\"secondary\"`, `\"accent\"`, `\"info\"`, `\"success\"`, `\"warning\"`, `\"error\"`, `\"neutral\"` |\n| `size` | `str \\| None` | `None` | Size: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` |\n| `disabled` | `bool` | `False` | If `True`, select is non-interactive |\n| `width` | `int \\| str \\| None` | `None` | Width of the component |\n| `height` | `int \\| str \\| None` | `None` | Height of the component |\n| `grow` | `int \\| None` | `None` | Flex grow factor |\n| `shrink` | `int \\| None` | `None` | Flex shrink factor |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions |\n\n<br/>\n\n**Properties (read/write):**\n- `select.value` — Get or set the selected value\n- `select.choices` — Get or set the choices list\n- `select.disabled` — Enable/disable the select\n\n**Methods:**\n- `select.on_update(callback)` — Register a function to call when selection changes. Callback receives `{\"value\": selected_value}`.\n- `select.options(**kwargs)` — Update component properties after initialization. Returns self for chaining."
    },

    // --- Input ---
    {
        id: "tut-api-input",
        type: "markdown",
        content: "## `Input`\n\nA single-line text input field.\n\n```python\nInput(value=\"\", placeholder=\"\", input_type=\"text\", color=None, size=None, disabled=False,\n      width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `value` | `str` | `\"\"` | Current text value |\n| `placeholder` | `str` | `\"\"` | Placeholder text shown when empty |\n| `input_type` | `str` | `\"text\"` | Input type: `\"text\"`, `\"password\"`, `\"email\"`, `\"number\"`, `\"search\"`, `\"tel\"`, `\"url\"` |\n| `color` | `str \\| None` | `None` | Color theme: `\"primary\"`, `\"secondary\"`, `\"accent\"`, `\"info\"`, `\"success\"`, `\"warning\"`, `\"error\"`, `\"neutral\"` |\n| `size` | `str \\| None` | `None` | Size: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` |\n| `disabled` | `bool` | `False` | If `True`, input is non-interactive |\n| `width` | `int \\| str \\| None` | `None` | Width of the component |\n| `height` | `int \\| str \\| None` | `None` | Height of the component |\n| `grow` | `int \\| None` | `None` | Flex grow factor |\n| `shrink` | `int \\| None` | `None` | Flex shrink factor |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions |\n\n<br/>\n\n**Properties (read/write):**\n- `input.value` — Get or set the text content\n- `input.disabled` — Enable/disable the input\n\n**Methods:**\n- `input.on_update(callback)` — Register a function to call on text change. Callback receives `{\"value\": current_text}`."
    },

    // --- Textarea ---
    {
        id: "tut-api-textarea",
        type: "markdown",
        content: "## `Textarea`\n\nA multi-line text input field.\n\n```python\nTextarea(value=\"\", placeholder=\"\", rows=4, color=None, size=None, disabled=False,\n         width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `value` | `str` | `\"\"` | Current text value |\n| `placeholder` | `str` | `\"\"` | Placeholder text shown when empty |\n| `rows` | `int` | `4` | Number of visible text rows |\n| `color` | `str \\| None` | `None` | Color theme: `\"primary\"`, `\"secondary\"`, `\"accent\"`, `\"info\"`, `\"success\"`, `\"warning\"`, `\"error\"`, `\"neutral\"` |\n| `size` | `str \\| None` | `None` | Size: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` |\n| `disabled` | `bool` | `False` | If `True`, textarea is non-interactive |\n| `width` | `int \\| str \\| None` | `None` | Width of the component |\n| `height` | `int \\| str \\| None` | `None` | Height of the component |\n| `grow` | `int \\| None` | `None` | Flex grow factor |\n| `shrink` | `int \\| None` | `None` | Flex shrink factor |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions |\n\n<br/>\n\n**Properties (read/write):**\n- `textarea.value` — Get or set the text content\n- `textarea.disabled` — Enable/disable the textarea\n\n**Methods:**\n- `textarea.on_update(callback)` — Register a function to call on text change. Callback receives `{\"value\": current_text}`."
    },

    // --- Toggle ---
    {
        id: "tut-api-toggle",
        type: "markdown",
        content: "## `Toggle`\n\nA switch-style toggle for boolean values.\n\n```python\nToggle(checked=False, label=None, color=None, size=None, disabled=False,\n       width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `checked` | `bool` | `False` | Whether the toggle is on |\n| `label` | `str \\| None` | `None` | Optional label displayed next to the toggle |\n| `color` | `str \\| None` | `None` | Color when checked: `\"primary\"`, `\"secondary\"`, `\"accent\"`, `\"info\"`, `\"success\"`, `\"warning\"`, `\"error\"`, `\"neutral\"` |\n| `size` | `str \\| None` | `None` | Size: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` |\n| `disabled` | `bool` | `False` | If `True`, toggle is non-interactive |\n| `width` | `int \\| str \\| None` | `None` | Width of the component |\n| `height` | `int \\| str \\| None` | `None` | Height of the component |\n| `grow` | `int \\| None` | `None` | Flex grow factor |\n| `shrink` | `int \\| None` | `None` | Flex shrink factor |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions |\n\n<br/>\n\n**Properties (read/write):**\n- `toggle.checked` — Get or set the checked state\n- `toggle.disabled` — Enable/disable the toggle\n\n**Methods:**\n- `toggle.on_update(callback)` — Register a function to call on toggle. Callback receives `{\"checked\": bool}`."
    },

    // --- Checkbox ---
    {
        id: "tut-api-checkbox",
        type: "markdown",
        content: "## `Checkbox`\n\nA checkbox for boolean selection.\n\n```python\nCheckbox(checked=False, label=None, color=None, size=None, disabled=False,\n         width=None, height=None, grow=None, shrink=None, force_dimensions=False)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `checked` | `bool` | `False` | Whether the checkbox is checked |\n| `label` | `str \\| None` | `None` | Optional label displayed next to the checkbox |\n| `color` | `str \\| None` | `None` | Color when checked: `\"primary\"`, `\"secondary\"`, `\"accent\"`, `\"info\"`, `\"success\"`, `\"warning\"`, `\"error\"`, `\"neutral\"` |\n| `size` | `str \\| None` | `None` | Size: `\"xs\"`, `\"sm\"`, `\"md\"`, `\"lg\"`, `\"xl\"` |\n| `disabled` | `bool` | `False` | If `True`, checkbox is non-interactive |\n| `width` | `int \\| str \\| None` | `None` | Width of the component |\n| `height` | `int \\| str \\| None` | `None` | Height of the component |\n| `grow` | `int \\| None` | `None` | Flex grow factor |\n| `shrink` | `int \\| None` | `None` | Flex shrink factor |\n| `force_dimensions` | `bool` | `False` | If `True`, sets exact dimensions |\n\n<br/>\n\n**Properties (read/write):**\n- `checkbox.checked` — Get or set the checked state\n- `checkbox.disabled` — Enable/disable the checkbox\n\n**Methods:**\n- `checkbox.on_update(callback)` — Register a function to call on check/uncheck. Callback receives `{\"checked\": bool}`."
    },

    // --- display() ---
    {
        id: "tut-api-display",
        type: "markdown",
        content: "## `display()`\n\nRender one or more UI elements immediately in the output stream.\n\n```python\ndisplay(*elements, inline=False, gap=1)\n```\n\n<br/>\n\n| Argument | Type | Default | Description |\n|----------|------|---------|-------------|\n| `*elements` | `UIElement` | *(required)* | One or more UI elements to display |\n| `inline` | `bool` | `False` | If `True`, display elements on the same line |\n| `gap` | `int` | `1` | Spacing between elements (spaces if inline, blank lines if separate) |\n\n<br/>\n\n**Usage:**\n\n```python\nfrom pynote_ui import Slider, Text, display\n\nslider = Slider(value=50)\ntext = Text(content=\"Hello\")\n\ndisplay(slider)                      # Single element\ndisplay(slider, text)                # Separate lines (default)\ndisplay(slider, text, inline=True)   # Same line\ndisplay(slider, text, gap=2)         # 2 blank lines between\n```\n\n**Note:** Unlike the last-expression behavior, `display()` outputs widgets **immediately** during execution, allowing interleaved text and UI."
    },

    // --- print_md() ---
    {
        id: "tut-api-printmd",
        type: "markdown",
        content: "## `print_md()`\n\nOutput formatted markdown content to the cell output.\n\n```python\nprint_md(content, styled=True)\n```\n\n<br/>\n\n| Argument | Type                 | Default | Description |\n|----------|----------------------|---------|-------------|\n| `content` | `str` | *(required)* | Markdown string to render. Supports f-strings with embedded UI elements. |\n| `styled` | `bool` | `True` | If `True`, renders with prose styling (like markdown cells). If `False`, renders with monospace appearance. |\n\n<br/>\n\n**Usage:**\n\n```python\nfrom pynote_ui import print_md, Slider\n\nprint_md(\"# Heading\\n\\n**Bold** text\")\n\nslider = Slider(value=50)\nprint_md(f\"Value: {slider}\")  # Embed interactive widget\n\nprint_md(\"# Code-style\", styled=False)  # Monospace output\n```"
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

## 📚 Full Tutorial Navigation

<br/>

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, colors, sizes, and states |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |  

Happy coding! 🐍`
    }
];
