import type { CellData } from "../../store";

export const tutorialUIPart1Cells: CellData[] = [
    // Table of contents
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, colors, sizes, and states *(you are here)* |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

---`
    },

    // ============================================================================
    // INTERACTIVE UI - PART 1: Components & Styling
    // ============================================================================
    {
        id: "tut-ui-intro",
        type: "markdown",
        content: `# Interactive UI Part 1: Components & Styling

The built-in \`pynote_ui\` package provides a rich set of interactive widgets for building reactive interfaces directly in your notebook.

**This tutorial is split into three parts:**

| Part | Topics |
|------|--------|
| **Part 1** *(you are here)* | All available components, colors, sizes, and states |
| **[Part 2](?open=tutorial_ui_part2)** | Layout with Group, sizing, borders, and display functions |
| **[Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, cross-cell communication, and advanced patterns |`
    },

    // --- Component Overview ---
    {
        id: "tut-ui-component-list",
        type: "markdown",
        content: `## Available Components

Here's every component in \`pynote_ui\`:

| Component | Description | Key Props |
|-----------|-------------|-----------|
| \`Slider\` | Numeric input with draggable control | \`value\`, \`min\`, \`max\`, \`step\`, \`label\` |
| \`Text\` | Dynamic text display | \`content\`, \`align_h\`, \`align_v\` |
| \`Button\` | Clickable action trigger | \`label\`, \`color\`, \`style\`, \`button_type\` |
| \`Input\` | Single-line text input | \`value\`, \`placeholder\`, \`input_type\` |
| \`Textarea\` | Multi-line text input | \`value\`, \`placeholder\`, \`rows\` |
| \`Select\` | Dropdown picker | \`choices\`, \`value\`, \`placeholder\` |
| \`Toggle\` | Switch-style on/off control | \`checked\`, \`label\` |
| \`Checkbox\` | Traditional checkbox | \`checked\`, \`label\` |
| \`Upload\` | Drag & drop file upload | \`label\`, \`files\` |
| \`Group\` | Layout container (row/column) | \`layout\`, \`align\`, \`gap\`, \`border\` |
| \`Form\` | Deferred submission container | Same as Group + submit behavior |

**Shared props:** All components support \`size\`, \`color\`, \`width\`, \`height\`, \`grow\`, \`shrink\`, \`border\`, \`background\`, \`hidden\`, \`disabled\`.

Let's explore each one!`
    },

    // --- Slider ---
    {
        id: "tut-ui-slider",
        type: "markdown",
        content: "## Slider\n\nNumeric input with a draggable control. Use `on_update()` to react to value changes."
    },
    {
        id: "tut-demo-slider",
        type: "code",
        content: `from pynote_ui import Slider, Text, Group

demo_slider = Slider(min=0, max=100, value=50, label="Adjust Me")
output_text = Text(content="Value: 50")

def on_change(data):
    output_text.content = f"Value: {int(data['value'])}"

demo_slider.on_update(on_change)
Group([demo_slider, output_text])`
    },

    // --- Text ---
    {
        id: "tut-ui-text",
        type: "markdown",
        content: "## Text\n\nDisplay dynamic text content. Supports horizontal alignment via `align_h`."
    },
    {
        id: "tut-demo-text",
        type: "code",
        content: `from pynote_ui import Text

# Text with alignment options
Text(content="Left aligned (default)", width="100%", align_h="left")`
    },
    {
        id: "tut-demo-text2",
        type: "code",
        content: `from pynote_ui import Text

Text(content="Center aligned", width="100%", align_h="center")`
    },
    {
        id: "tut-demo-text3",
        type: "code",
        content: `from pynote_ui import Text

Text(content="Right aligned", width="100%", align_h="right")`
    },

    // --- Button ---
    {
        id: "tut-ui-button",
        type: "markdown",
        content: "## Button\n\nButtons trigger actions when clicked. They support colors (`primary`, `secondary`, `accent`, `info`, `success`, `warning`, `error`), styles (`outline`, `dash`, `soft`, `ghost`, `link`), and sizes."
    },
    {
        id: "tut-demo-button",
        type: "code",
        content: `from pynote_ui import Button, Text, Group

click_count = 0
count_display = Text(content="Clicks: 0")

def handle_click(data):
    global click_count
    click_count += 1
    count_display.content = f"Clicks: {click_count}"

click_btn = Button(label="Click Me!")
click_btn.on_update(handle_click)

Group([click_btn, count_display])`
    },

    // --- Input ---
    {
        id: "tut-ui-input",
        type: "markdown",
        content: "## Input\n\nSingle-line text input. Supports types: `text`, `password`, `email`, `number`, `search`, `tel`, `url`."
    },
    {
        id: "tut-demo-input",
        type: "code",
        content: `from pynote_ui import Input, Text, Group

name_input = Input(placeholder="Enter your name", grow=1)
greeting = Text(content="Hello!")

def update_greeting(data):
    name = data['value'].strip()
    greeting.content = f"Hello, {name}!" if name else "Hello!"

name_input.on_update(update_greeting)
Group([name_input, greeting])`
    },

    // --- Textarea ---
    {
        id: "tut-ui-textarea",
        type: "markdown",
        content: "## Textarea\n\nMulti-line text input. Use the `rows` parameter to control visible height."
    },
    {
        id: "tut-demo-textarea",
        type: "code",
        content: `from pynote_ui import Textarea, Text, Group

notes = Textarea(placeholder="Write your notes...", rows=4, grow=1)
char_count = Text(content="Characters: 0")

def count_chars(data):
    char_count.content = f"Characters: {len(data['value'])}"

notes.on_update(count_chars)
Group([notes, char_count])`
    },

    // --- Select ---
    {
        id: "tut-ui-select",
        type: "markdown",
        content: "## Select\n\nDropdown picker. Options can be simple strings or `{label, value}` dicts for different display/stored values."
    },
    {
        id: "tut-demo-select",
        type: "code",
        content: `from pynote_ui import Select, Text, Group

lang_select = Select(
    choices=["Python", "JavaScript", "TypeScript", "Rust", "Go"],
    placeholder="Choose a language",
    grow=1
)
selection_text = Text(content="No selection")

def on_select(data):
    selection_text.content = f"Selected: {data['value']}"

lang_select.on_update(on_select)
Group([lang_select, selection_text])`
    },

    // --- Toggle ---
    {
        id: "tut-ui-toggle",
        type: "markdown",
        content: "## Toggle\n\nSwitch-style on/off control. Access the state via `.checked`."
    },
    {
        id: "tut-demo-toggle",
        type: "code",
        content: `from pynote_ui import Toggle, Text, Group

dark_mode = Toggle(label="Dark Mode", checked=False)
status = Text(content="OFF")

def toggle_mode(data):
    status.content = "ON" if data['checked'] else "OFF"

dark_mode.on_update(toggle_mode)
Group([dark_mode, status])`
    },

    // --- Checkbox ---
    {
        id: "tut-ui-checkbox",
        type: "markdown",
        content: "## Checkbox\n\nTraditional checkbox for boolean selections. Works like Toggle but with checkbox appearance."
    },
    {
        id: "tut-demo-checkbox",
        type: "code",
        content: `from pynote_ui import Checkbox, Text, Group

agree = Checkbox(label="I agree to the terms", checked=False)
message = Text(content="Please agree to continue")

def check_agreement(data):
    message.content = "Thank you!" if data['checked'] else "Please agree to continue"

agree.on_update(check_agreement)
Group([agree, message])`
    },

    // ============================================================================
    // COLORS
    // ============================================================================
    {
        id: "tut-ui-colors",
        type: "markdown",
        content: `## Color Themes

Most components accept a \`color\` parameter using **theme-configurable colors**:
- \`"primary"\` — Primary color
- \`"secondary"\` — Secondary color
- \`"accent"\` — Accent color
- \`"neutral"\` — Neutral foreground color
- \`"info"\` — Informational blue
- \`"success"\` — Success green
- \`"warning"\` — Warning yellow/orange
- \`"error"\` — Error red

All colors adapt to your active theme (change theme in toolbar to see).

**Supported components:** Slider, Text, Button, Input, Textarea, Select, Toggle, Checkbox.`
    },
    {
        id: "tut-demo-colors",
        type: "code",
        content: `from pynote_ui import Button, Group

# Showcase all color options
Group([
    Button(label="Primary", color="primary"),
    Button(label="Secondary", color="secondary"),
    Button(label="Accent", color="accent"),
    Button(label="Neutral", color="neutral"),
    Button(label="Info", color="info"),
    Button(label="Success", color="success"),
    Button(label="Warning", color="warning"),
    Button(label="Error", color="error"),
], layout="row")`
    },

    // ============================================================================
    // SIZE PRESETS
    // ============================================================================
    {
        id: "tut-ui-sizes",
        type: "markdown",
        content: `## Size Presets

All components support a \`size\` parameter with these presets:
- \`"xs"\` — Extra small
- \`"sm"\` — Small
- \`"md"\` — Medium (default)
- \`"lg"\` — Large
- \`"xl"\` — Extra large

Sizes affect padding, font size, and component-specific dimensions.`
    },
    {
        id: "tut-demo-sizes",
        type: "code",
        content: `from pynote_ui import Button, display

print(
    Button(label="XS", size="xs"),
    Button(label="SM", size="sm"),
    Button(label="MD", size="md"),
    Button(label="LG", size="lg"),
    Button(label="XL", size="xl"),
)`
    },
    {
        id: "tut-demo-sizes2",
        type: "code",
        content: `from pynote_ui import Slider, Group

# Sizes also affect sliders
Group([
    Slider(value=25, label="XS", size="xs", grow=1),
    Slider(value=40, label="SM", size="sm", grow=1),
    Slider(value=55, label="MD", size="md", grow=1),
    Slider(value=70, label="LG", size="lg", grow=1),
    Slider(value=85, label="XL", size="xl", grow=1),
])`
    },

    // --- Dynamic Size Changes ---
    {
        id: "tut-ui-dynamic-size",
        type: "markdown",
        content: "### Dynamic Size Changes\n\nComponent sizes can be changed dynamically by setting the `.size` property:"
    },
    {
        id: "tut-demo-dynamic-size",
        type: "code",
        content: `from pynote_ui import Select, Button, Slider, Text, Group

# Components that will change size
demo_button = Button(label="Sample Button", size="md")
dynamic_size_slider = Slider(value=50, label="Sample Slider", size="md", grow=1)
demo_text = Text(content="Sample Text", size="md")
size_label = Text(content="Size:", size="md")

# Size selector
size_picker = Select(
    choices=["xs", "sm", "md", "lg", "xl"],
    placeholder="Choose size",
    color="primary"
)

def change_size(data):
    new_size = data['value']
    demo_button.size = new_size
    dynamic_size_slider.size = new_size
    demo_text.size = new_size
    size_picker.size = new_size
    size_label.size = new_size

size_picker.on_update(change_size)

Group([
    Group([size_label, size_picker], layout="row", align="center"),
    demo_button,
    dynamic_size_slider,
    demo_text
], label="Dynamic Sizing Demo", border=True)`
    },

    // ============================================================================
    // COMPONENT STATES
    // ============================================================================
    {
        id: "tut-ui-states",
        type: "markdown",
        content: "## Component States\n\nMany components support `disabled` and `loading` states:\n\n### Disabled\nPrevents interaction. Works on: Button, Input, Textarea, Select, Toggle, Checkbox.\n\n### Loading\nShows a loading indicator. Works on: Button."
    },
    {
        id: "tut-demo-states",
        type: "code",
        content: `from pynote_ui import Button, Input, Toggle, Group

Group([
    Button(label="Normal", color="primary"),
    Button(label="Disabled", color="primary", disabled=True),
    Button(label="Loading", color="primary", loading=True),
], layout="row")`
    },
    {
        id: "tut-demo-states2",
        type: "code",
        content: `from pynote_ui import Input, Select, Toggle, Group

Group([
    Input(placeholder="Normal input", grow=1),
    Input(placeholder="Disabled input", disabled=True, grow=1),
], layout="row")`
    },

    // --- Next Steps ---
    {
        id: "tut-ui-part1-next",
        type: "markdown",
        content: `---

## 🎉 Part 1 Complete!

You've learned about all available components and how to style them with colors and sizes.

**Continue to Part 2** to learn about:
- Building layouts with Group (rows, columns, nesting)
- Flex sizing and dimensions
- Border and background customization
- Displaying UI elements anywhere in your code

| Next Steps | |
|------------|---|
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete component reference |

<br />`
    }
];
