import type { CellData } from "../store";

export const tutorialUIPart1Cells: CellData[] = [
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
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, styling, sizing, and borders *(you are here)* |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layouts, forms, and interactive communication |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

<br />

---`
    },

    // ============================================================================
    // INTERACTIVE UI - PART 1: Components & Styling
    // ============================================================================
    {
        id: "tut-ui-intro",
        type: "markdown",
        content: "# Interactive UI Part 1: Components & Styling\n\nThe built-in `pynote_ui` package provides a rich set of interactive widgets for building reactive interfaces. This tutorial introduces all available components and teaches you how to configure, style, and size them.\n\n**In this part**, you'll learn about:\n- All available UI components\n- Colors and visual styles\n- Size presets\n- Width, height, and flex sizing\n- Border customization\n\n**In Part 2**, you'll learn about layouts, forms, and interactive communication."
    },

    // --- Section: Components (Part 1) ---
    {
        id: "tut-ui-core",
        type: "markdown",
        content: "## Available Components\n\nLet's explore all available components. All of these can be used anywhere - inside forms, in groups, or standalone.\n\n### Slider\n\nNumeric input with draggable control."
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

    {
        id: "tut-ui-text",
        type: "markdown",
        content: "### Text\n\nDisplay dynamic text content that can be updated programmatically."
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

    {
        id: "tut-ui-button",
        type: "markdown",
        content: "### Button\n\nClickable buttons that trigger actions."
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

    // --- Input Example ---
    {
        id: "tut-ui-input",
        type: "markdown",
        content: "### Input\n\nInput fields capture single-line text. They support various types: `text`, `password`, `email`, `number`, `search`, `tel`, `url`."
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

    // --- Textarea Example ---
    {
        id: "tut-ui-textarea",
        type: "markdown",
        content: "### Textarea\n\nTextarea provides multi-line text input. Use the `rows` parameter to control height."
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

    // --- Select Example ---
    {
        id: "tut-ui-select",
        type: "markdown",
        content: "### Select\n\nSelect dropdowns let users pick from predefined options."
    },
    {
        id: "tut-demo-select",
        type: "code",
        content: `from pynote_ui import Select, Text, Group

lang_select = Select(
    options=["Python", "JavaScript", "TypeScript", "Rust", "Go"],
    placeholder="Choose a language",
    grow=1
)
selection_text = Text(content="No selection")

def on_select(data):
    selection_text.content = f"Selected: {data['value']}"

lang_select.on_update(on_select)
Group([lang_select, selection_text])`
    },

    // --- Toggle Example ---
    {
        id: "tut-ui-toggle",
        type: "markdown",
        content: "### Toggle\n\nToggles are switch-style controls for on/off states."
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

    // --- Checkbox Example ---
    {
        id: "tut-ui-checkbox",
        type: "markdown",
        content: "### Checkbox\n\nCheckboxes provide traditional checkbox controls for boolean selections."
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

    // --- Colors Section ---
    {
        id: "tut-ui-colors",
        type: "markdown",
        content: "## Color Themes\n\nMost components accept a `color` parameter using **theme-configurable colors**:\n- `\"primary\"` — Primary color\n- `\"secondary\"` — Secondary color\n- `\"accent\"` — Accent color\n- `\"neutral\"` — Neutral foreground color\n- `\"info\"` — Informational blue\n- `\"success\"` — Success green\n- `\"warning\"` — Warning yellow/orange\n- `\"error\"` — Error red\n\nAll colors adapt to your active theme (change theme in toolbar to see).\n\n**Supported components:** Slider, Text, Button, Input, Textarea, Select, Toggle, Checkbox."
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

    // --- Size Presets ---
    {
        id: "tut-ui-sizes",
        type: "markdown",
        content: "## Size Presets\n\nAll components support a `size` parameter with these presets:\n- `\"xs\"` — Extra small\n- `\"sm\"` — Small\n- `\"md\"` — Medium (default)\n- `\"lg\"` — Large\n- `\"xl\"` — Extra large\n\nSizes affect padding, font size, and component-specific dimensions."
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

    // --- Dynamic Sizing Demo ---
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
demo_slider = Slider(value=50, label="Sample Slider", size="md", grow=1)
demo_text = Text(content="Sample Text", size="md")
size_label = Text(content="Size:", size="md")

# Size selector
size_picker = Select(
    options=["xs", "sm", "md", "lg", "xl"],
    placeholder="Choose size",
    color="primary"
)

def change_size(data):
    new_size = data['value']
    demo_button.size = new_size
    demo_slider.size = new_size
    demo_text.size = new_size
    size_picker.size = new_size
    size_label.size = new_size

size_picker.on_update(change_size)

Group([
    Group([size_label, size_picker], layout="row", align="center"),
    demo_button,
    demo_slider,
    demo_text
], label="Dynamic Sizing Demo", border=True)`
    },

    // --- Dimensions Section ---
    {
        id: "tut-ui-dimensions",
        type: "markdown",
        content: "## Width & Height\n\nAll components accept `width` and `height` parameters:\n- **Numbers** are treated as pixels: `width=200` → 200px\n- **Strings** are used as-is: `width=\"50%\"`, `width=\"10rem\"`\n- By default, these set **minimum** dimensions (component can grow)\n- Use `force_dimensions=True` for **exact** dimensions (component is fixed)"
    },
    {
        id: "tut-demo-dimensions",
        type: "code",
        content: `from pynote_ui import Button, Group

Group([
    Button(label="100px wide", width=100),
    Button(label="200px wide", width=200),
    Button(label="300px wide", width=300),
], layout="row")`
    },
    {
        id: "tut-demo-dimensions2",
        type: "code",
        content: `from pynote_ui import Slider, Group

# Fixed vs flexible dimensions
Group([
    Slider(value=50, label="Flexible (grows)", width=200, grow=1),
    Slider(value=50, label="Fixed 200px", width=200, force_dimensions=True),
], layout="col", border=True)`
    },

    // --- Flex Sizing Section ---
    {
        id: "tut-ui-flex",
        type: "markdown",
        content: "## Flex Sizing: `grow` and `shrink`\n\nComponents support flexbox properties for responsive sizing:\n\n### `grow`\n- **`grow=None`** (default): Component takes only the space it needs\n- **`grow=1`**: Component expands to fill available space\n- **`grow=2`, `grow=3`, etc.**: Takes proportionally more space\n\n### `shrink`\n- **`shrink=None`** (default): Component can shrink if needed\n- **`shrink=0`**: Component never shrinks below its natural size\n\nGrow is most useful inside Group containers (covered in Part 2)."
    },
    {
        id: "tut-demo-flex",
        type: "code",
        content: `from pynote_ui import Slider, Group

print("Equal space sharing (grow=1):")
Group([
    Slider(value=30, label="A", grow=1),
    Slider(value=70, label="B", grow=1)
], layout="row", border=True)`
    },
    {
        id: "tut-demo-flex2",
        type: "code",
        content: `from pynote_ui import Slider, Group

print("Weighted distribution (1:2 ratio):")
Group([
    Slider(value=30, label="1x space", grow=1),
    Slider(value=70, label="2x space", grow=2)
], layout="row", border=True)`
    },

    // --- Borders Section ---
    {
        id: "tut-ui-borders",
        type: "markdown",
        content: "## Border Customization\n\nAll components support a `border` parameter:\n- **`border=True`** — Default border (2px foreground color)\n- **`border=False` or `border=\"none\"`** — No border\n- **`border=\"<CSS>\"`** — Custom CSS border string\n\nExamples: `border=\"3px solid red\"`, `border=\"2px dashed #00ff00\"`"
    },
    {
        id: "tut-demo-borderless",
        type: "code",
        content: `from pynote_ui import Button, Input, Select, Group

print("Borderless components:")
Group([
    Button(label="No Border", border=False),
    Input(placeholder="No border input", border=False, grow=1),
    Select(options=["A", "B", "C"], value="A", border=False, grow=1),
], layout="row", border=False, padding=16, gap=3)`
    },
    {
        id: "tut-demo-colored-borders",
        type: "code",
        content: `from pynote_ui import Button, Slider, Input, Text, Group

print("Custom colored borders:")
Group([
    Button(label="Red Button", border="3px solid #ef4444"),
    Slider(value=50, label="Blue Slider", border="2px solid #3b82f6", grow=1),
    Input(placeholder="Green input", border="2px solid #22c55e", grow=1),
    Text(content="Dashed purple", border="2px dashed #a855f7", width="100%", align_h="center"),
])`
    },

    // --- Component States ---
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

<br />

## 🎉 Part 1 Complete!

You've learned about all available components and how to configure, style, and size them.

**Continue to Part 2** to learn about:
- Building layouts with Group
- Creating forms with deferred submission
- Interactive communication patterns
- Displaying UI elements anywhere in your code

<br />

| Next Steps |
|------------|
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** → Layouts, forms, and communication |
| **[API Reference](?open=tutorial_api)** → Complete component reference |

<br />`
    }
];
