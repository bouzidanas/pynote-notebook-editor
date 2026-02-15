import type { CellData } from "../store";

export const tutorialUIPart2Cells: CellData[] = [
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
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions *(you are here)* |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

---`
    },

    // ============================================================================
    // INTERACTIVE UI - PART 2: Layout & Appearance
    // ============================================================================
    {
        id: "tut-ui-part2-intro",
        type: "markdown",
        content: `# Interactive UI Part 2: Layout, Sizing & Appearance

Now that you know the individual components, let's learn how to arrange them into structured interfaces and customize their appearance.

**In this part**, you'll learn about:
- Building layouts with Group (rows, columns, nesting)
- Flex sizing with \`grow\` and \`shrink\`
- Width, height, and dimension control
- Gap and padding
- Overflow handling
- Border customization
- Hide/Show visibility control
- Displaying UI elements anywhere with \`display()\` and \`print_md()\``
    },

    // ============================================================================
    // GROUP BASICS
    // ============================================================================
    {
        id: "tut-ui-group-basics",
        type: "markdown",
        content: "## Group: Layout Container\n\n`Group` arranges child components in rows or columns. Groups are essential for building structured interfaces and can be nested for complex layouts."
    },
    {
        id: "tut-demo-group-basic",
        type: "code",
        content: `from pynote_ui import Button, Group

# Column layout (default)
Group([
    Button(label="First"),
    Button(label="Second"),
    Button(label="Third"),
], label="Column Layout", border=True)`
    },
    {
        id: "tut-demo-group-basic2",
        type: "code",
        content: `from pynote_ui import Button, Group

# Row layout
Group([
    Button(label="First"),
    Button(label="Second"),
    Button(label="Third"),
], layout="row", label="Row Layout", border=True)`
    },

    // ============================================================================
    // ALIGNMENT
    // ============================================================================
    {
        id: "tut-ui-alignment",
        type: "markdown",
        content: "## Alignment\n\nThe `align` parameter controls how children are positioned along the **cross axis**:\n- In **rows**: controls vertical alignment\n- In **columns**: controls horizontal alignment\n\nValues: `\"start\"`, `\"center\"` (default), `\"end\"`, `\"stretch\"`"
    },
    {
        id: "tut-demo-alignment",
        type: "code",
        content: `from pynote_ui import Button, Group

# Row with different vertical alignments
Group([
    Button(label="Start", height=30),
    Button(label="Center", height=50),
    Button(label="End", height=40),
], layout="row", align="start", label="Align: Start", border=True, height=80)`
    },
    {
        id: "tut-demo-alignment2",
        type: "code",
        content: `from pynote_ui import Button, Group

Group([
    Button(label="Start", height=30),
    Button(label="Center", height=50),
    Button(label="End", height=40),
], layout="row", align="center", label="Align: Center", border=True, height=80)`
    },
    {
        id: "tut-demo-alignment3",
        type: "code",
        content: `from pynote_ui import Button, Group

# Column with horizontal alignment
Group([
    Button(label="Start"),
    Button(label="Center"),
    Button(label="End"),
], align="start", label="Align: Start (column)", border=True)`
    },
    {
        id: "tut-demo-alignment4",
        type: "code",
        content: `from pynote_ui import Button, Group

Group([
    Button(label="Start"),
    Button(label="Center"),
    Button(label="End"),
], align="center", label="Align: Center (column)", border=True)`
    },

    // ============================================================================
    // NESTED GROUPS
    // ============================================================================
    {
        id: "tut-ui-nested",
        type: "markdown",
        content: "## Nested Groups\n\nGroups can be nested to create complex layouts. Remember:\n- `layout` controls the direction of **direct children**\n- `align` controls cross-axis alignment\n- Child groups can have different layouts"
    },
    {
        id: "tut-demo-nested",
        type: "code",
        content: `from pynote_ui import Button, Text, Group

# Build a working calculator with nested Groups
calc_display = Text(content="0", width="100%", align_h="right", size="xl")

# Calculator state
calc_state = {"current": "0", "previous": "", "operation": None, "new_number": True}

def handle_number(data):
    """Handle number button clicks - uses data['label'] to identify which button"""
    num = data["label"]
    if calc_state["new_number"]:
        calc_state["current"] = num
        calc_state["new_number"] = False
    else:
        if calc_state["current"] == "0":
            calc_state["current"] = num
        else:
            calc_state["current"] += num
    calc_display.content = calc_state["current"]

def handle_decimal(data):
    """Handle decimal point"""
    if "." not in calc_state["current"]:
        calc_state["current"] += "."
        calc_display.content = calc_state["current"]

def handle_operation(data):
    """Handle operation buttons - uses data['label'] to identify the operation"""
    calc_state["previous"] = calc_state["current"]
    calc_state["operation"] = data["label"]
    calc_state["new_number"] = True

def handle_equals(data):
    """Calculate result"""
    if calc_state["operation"] and calc_state["previous"]:
        a = float(calc_state["previous"])
        b = float(calc_state["current"])
        if calc_state["operation"] == "+":
            result = a + b
        elif calc_state["operation"] == "-":
            result = a - b
        elif calc_state["operation"] == "×":
            result = a * b
        elif calc_state["operation"] == "÷":
            result = a / b if b != 0 else "Error"
        else:
            result = b
        calc_display.content = str(result)
        calc_state["current"] = str(result)
        calc_state["operation"] = None
        calc_state["new_number"] = True

def handle_square(data):
    """Square the current number"""
    num = float(calc_state["current"])
    result = num ** 2
    calc_display.content = str(result)
    calc_state["current"] = str(result)
    calc_state["new_number"] = True

def handle_clear(data):
    """Clear calculator state"""
    calc_state["current"] = "0"
    calc_state["previous"] = ""
    calc_state["operation"] = None
    calc_state["new_number"] = True
    calc_display.content = "0"

# Create buttons - using shared handlers, buttons identified by their label
# Row 1: 7, 8, 9, ^2, C
btn_7 = Button(label="7", grow=1)
btn_7.on_update(handle_number)
btn_8 = Button(label="8", grow=1)
btn_8.on_update(handle_number)
btn_9 = Button(label="9", grow=1)
btn_9.on_update(handle_number)
btn_square = Button(label="^2", color="info", background="color-mix(in srgb, var(--accent), transparent 90%)", grow=1)
btn_square.on_update(handle_square)
btn_clear = Button(label="C", color="error", background="color-mix(in srgb, var(--error), transparent 66%)", grow=1)
btn_clear.on_update(handle_clear)

buttons_row1 = Group([btn_7, btn_8, btn_9, btn_square, btn_clear], layout="row")

# Row 2: 4, 5, 6, ×, +
btn_4 = Button(label="4", grow=1)
btn_4.on_update(handle_number)
btn_5 = Button(label="5", grow=1)
btn_5.on_update(handle_number)
btn_6 = Button(label="6", grow=1)
btn_6.on_update(handle_number)
btn_mult = Button(label="×", color="info", background="color-mix(in srgb, var(--accent), transparent 90%)", grow=1)
btn_mult.on_update(handle_operation)
btn_plus = Button(label="+", color="info", background="color-mix(in srgb, var(--accent), transparent 90%)", grow=1)
btn_plus.on_update(handle_operation)

buttons_row2 = Group([btn_4, btn_5, btn_6, btn_mult, btn_plus], layout="row")

# Row 3: 1, 2, 3, ÷, -
btn_1 = Button(label="1", grow=1)
btn_1.on_update(handle_number)
btn_2 = Button(label="2", grow=1)
btn_2.on_update(handle_number)
btn_3 = Button(label="3", grow=1)
btn_3.on_update(handle_number)
btn_div = Button(label="÷", color="info", background="color-mix(in srgb, var(--accent), transparent 90%)", grow=1)
btn_div.on_update(handle_operation)
btn_minus = Button(label="-", color="info", background="color-mix(in srgb, var(--accent), transparent 90%)", grow=1)
btn_minus.on_update(handle_operation)

buttons_row3 = Group([btn_1, btn_2, btn_3, btn_div, btn_minus], layout="row")

# Row 4: 0, ., = (with = having grow=4)
btn_0 = Button(label="0", grow=1)
btn_0.on_update(handle_number)
btn_decimal = Button(label=".", grow=1)
btn_decimal.on_update(handle_decimal)
btn_equals = Button(label="=", color="primary", background="color-mix(in srgb, var(--primary), transparent 80%)",grow=4)
btn_equals.on_update(handle_equals)

buttons_row4 = Group([btn_0, btn_decimal, btn_equals], layout="row")

# All button rows in vertical layout
button_grid = Group([
    buttons_row1,
    buttons_row2,
    buttons_row3,
    buttons_row4,
])

# Outer group arranges display and buttons vertically
Group([
    calc_display,
    button_grid,
], label="Working Calculator", border=True, gap=2)`
    },

    // ============================================================================
    // FLEX SIZING
    // ============================================================================
    {
        id: "tut-ui-flex",
        type: "markdown",
        content: `## Space Sharing with \`grow\`

By default, components take their **natural size** (just enough for their content). Use \`grow\` to make them expand and share available space:

- **No \`grow\`** (default): Component takes only the space it needs
- **\`grow=1\`**: Component expands to fill available space
- **\`grow=2\`, \`grow=3\`**, etc.: Takes proportionally more space

The \`shrink\` parameter controls whether a component can shrink below its natural size (\`shrink=0\` prevents shrinking).`
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

    // ============================================================================
    // DIMENSIONS
    // ============================================================================
    {
        id: "tut-ui-dimensions",
        type: "markdown",
        content: `## Width & Height

All components accept \`width\` and \`height\` parameters:
- **Numbers** are treated as pixels: \`width=200\` → 200px
- **Strings** are used as-is: \`width="50%"\`, \`width="10rem"\`
- By default, these set **minimum** dimensions (component can grow)
- Use \`force_dimensions=True\` for **exact** dimensions (component is fixed)`
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

    // ============================================================================
    // GAP AND PADDING
    // ============================================================================
    {
        id: "tut-ui-gap-padding",
        type: "markdown",
        content: `## Gap and Padding

### \`gap\`
Controls spacing **between** children:
- Numbers use Tailwind spacing scale: \`gap=1\` → 0.25rem, \`gap=3\` → 0.75rem
- Strings are used as-is: \`gap="1rem"\`, \`gap="20px"\`
- Default: \`gap=3\`

### \`padding\`
Controls spacing **inside** the container:
- Numbers → pixels: \`padding=16\` → 16px
- Strings → CSS values: \`padding="1rem"\`
- Default: Automatic based on label/border`
    },
    {
        id: "tut-demo-gap",
        type: "code",
        content: `from pynote_ui import Button, Group

print("Small gap (gap=1):")
Group([
    Button(label="A"),
    Button(label="B"),
    Button(label="C"),
], layout="row", gap=1, border=True)`
    },
    {
        id: "tut-demo-gap2",
        type: "code",
        content: `from pynote_ui import Button, Group

print("Large gap (gap=6):")
Group([
    Button(label="A"),
    Button(label="B"),
    Button(label="C"),
], layout="row", gap=6, border=True)`
    },
    {
        id: "tut-demo-padding",
        type: "code",
        content: `from pynote_ui import Button, Group

print("Custom padding:")
Group([
    Button(label="Lots of padding around me"),
], border=True, padding=32)`
    },

    // ============================================================================
    // OVERFLOW
    // ============================================================================
    {
        id: "tut-ui-overflow",
        type: "markdown",
        content: `## Overflow Handling

Control what happens when content exceeds container size:
- \`overflow="visible"\` — Content overflows container (default)
- \`overflow="hidden"\` — Content is clipped
- \`overflow="scroll"\` — Scrollbars appear
- \`overflow="auto"\` — Scrollbars appear only when needed
- \`overflow="scroll-x"\` — Horizontal scroll only
- \`overflow="scroll-y"\` — Vertical scroll only`
    },
    {
        id: "tut-demo-overflow",
        type: "code",
        content: `from pynote_ui import Button, Group

# Fixed height container with vertical scroll
Group([
    Button(label="Item 1"),
    Button(label="Item 2"),
    Button(label="Item 3"),
    Button(label="Item 4"),
    Button(label="Item 5"),
    Button(label="Item 6"),
], height=200, overflow="scroll-y", label="Scrollable (200px)", border=True)`
    },

    // ============================================================================
    // BORDERS
    // ============================================================================
    {
        id: "tut-ui-borders",
        type: "markdown",
        content: `## Border Customization

All components support a \`border\` parameter:
- **\`border=True\`** — Default border (2px foreground color)
- **\`border=False\`** or **\`border="none"\`** — No border
- **Preset names**: \`"primary"\`, \`"secondary"\`, \`"accent"\`, etc. → Creates \`2px solid <theme-color>\` border
- **Custom colors**: \`"#00ff00"\`, \`"rgb(255,0,0)"\` → Creates \`2px solid <color>\` border
- **Full CSS**: \`"3px dashed red"\`, \`"1px dotted rgba(0,0,0,0.3)"\` → Complete control`
    },
    {
        id: "tut-demo-borderless",
        type: "code",
        content: `from pynote_ui import Button, Input, Select, Group

print("Borderless components:")
Group([
    Button(label="No Border", border=False),
    Input(placeholder="No border input", border=False, grow=1),
    Select(choices=["A", "B", "C"], value="A", border=False, grow=1),
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

    // --- Interactive Border Demo ---
    {
        id: "tut-ui-border-interactive",
        type: "markdown",
        content: "### Interactive Border Demo\n\nTry this interactive demo to see all border options in action on every component type!"
    },
    {
        id: "tut-demo-border-interactive",
        type: "code",
        content: `from pynote_ui import *

# Border options to demonstrate
border_options = [
    "True",
    "False", 
    "primary",
    "#00ff00",
    "3px dashed red",
    "1px dotted rgba(0,0,0,0.3)"
]

# Controls
border_label = Text(content="border = ", width="fit-content", border=False)
border_select = Select(
    choices=border_options,
    value="True",
    width="fit-content"
)

# Convert string values to actual border values
def get_border_value(option):
    if option == "True":
        return True
    elif option == "False":
        return False
    else:
        return option

# Create all components with initial border
initial_border = True

# Column 1 components
slider = Slider(min=0, max=100, value=50, label="Slider", border=initial_border, width="100%")
text = Text(content="Text Component", border=initial_border, width="100%", align_h="center")
input_box = Input(placeholder="Input field", border=initial_border, width="100%")
select = Select(choices=["Option A", "Option B", "Option C"], value="Option A", border=initial_border, width="100%")

# Column 2 components
textarea = Textarea(placeholder="Textarea field", rows=3, border=initial_border, width="100%")
toggle = Toggle(checked=True, label="Toggle", border=initial_border, width="100%")
checkbox = Checkbox(checked=True, label="Checkbox", border=initial_border, width="100%")
button = Button(label="Button", color="primary", border=initial_border, width="100%")

# Layout: Two columns in a row
col1 = Group([slider, text, input_box, select], border=False, grow=1)
col2 = Group([textarea, toggle, checkbox, button], border=False, grow=1)
components_row = Group([col1, col2], layout="row", border=initial_border, gap=4)

# Update all borders when selection changes
def update_borders(data):
    border_value = get_border_value(data['value'])
    
    # Update all components
    slider.send_update(border=border_value)
    text.send_update(border=border_value)
    input_box.send_update(border=border_value)
    select.send_update(border=border_value)
    textarea.send_update(border=border_value)
    toggle.send_update(border=border_value)
    checkbox.send_update(border=border_value)
    button.send_update(border=border_value)
    
    # Update outer container
    components_row.send_update(border=border_value)

border_select.on_update(update_borders)

# Display everything
Group([
    Group([border_label, border_select], layout="row", border=False, gap=2),
    components_row
], gap=4, border=False)`
    },

    // ============================================================================
    // HIDE / SHOW
    // ============================================================================
    {
        id: "tut-ui-hide-show-intro",
        type: "markdown",
        content: `## Hide and Show Components

All UI components support \`.hide()\` and \`.show()\` methods for reactive visibility control. This is perfect for:
- Showing results only after form submission
- Conditional UI based on user actions
- Progressive disclosure patterns

Components can also start hidden with \`hidden=True\` parameter.`
    },
    {
        id: "tut-demo-hide-show",
        type: "code",
        content: `from pynote_ui import Button, Text, Group

# Create components (result starts hidden)
show_btn = Button(label="Show Secret", color="primary")
hide_btn = Button(label="Hide Secret", color="secondary")
secret = Text(content="🎉 You found the secret message!", hidden=True, color="success")

# Button callbacks
def show_secret(data):
    secret.show()

def hide_secret(data):
    secret.hide()

show_btn.on_update(show_secret)
hide_btn.on_update(hide_secret)

Group([
    Group([show_btn, hide_btn], layout="row"),
    secret
], border=True, label="Toggle Visibility")`
    },
    {
        id: "tut-ui-hide-show-note",
        type: "markdown",
        content: "**Try it:** Click \"Show Secret\" to reveal the hidden Text component, then \"Hide Secret\" to hide it again. The `hidden` property is reactive — changes take effect immediately.\n\n**Performance:** Hiding components uses CSS `display: none`, which is extremely efficient. Hidden components maintain their state and can be shown again instantly."
    },

    // ============================================================================
    // DISPLAY FUNCTIONS
    // ============================================================================
    {
        id: "tut-ui-display",
        type: "markdown",
        content: `## Displaying UI Anywhere: \`display()\`

By default, UI components only render when they're the **last expression** in a cell. The \`display()\` function lets you output components **at any point** during execution.

**Signature:** \`display(*elements, inline=False, gap=1)\`
- \`inline=False\` (default): Each element on its own line
- \`inline=True\`: Elements on the same line
- \`gap\`: Spacing between elements`
    },
    {
        id: "tut-demo-display",
        type: "code",
        content: `from pynote_ui import Slider, Text, Button, display

print("Setting up controls...")

display_vol_slider = Slider(value=75, label="Volume", width="100%")
display_status = Text(content="Volume: 75%")
display_reset_btn = Button(label="Reset")

def update_display_volume(data):
    display_status.content = f"Volume: {int(data['value'])}%"

def reset_display_volume(data):
    display_vol_slider.value = 50
    display_status.content = "Volume: 50%"

display_vol_slider.on_update(update_display_volume)
display_reset_btn.on_update(reset_display_volume)

# Display components inline
display(display_vol_slider, display_status, display_reset_btn)

print("☝️ Components displayed inline in the output")`
    },

    // --- Print with UI ---
    {
        id: "tut-ui-print",
        type: "markdown",
        content: "### Using `print()` with UI Elements\n\nFor convenience, you can also use Python's built-in `print()` function or f-strings to display widgets:"
    },
    {
        id: "tut-demo-print",
        type: "code",
        content: `from pynote_ui import Slider, Text

volume = Slider(value=75, min=0, max=100, label="🔊 Volume", width="100%")
vol_text = Text(content="75%")

def update_vol(data):
    vol_text.content = f"{int(data['value'])}%"
volume.on_update(update_vol)

# F-strings work and maintain interactivity!
print(f"Volume: {volume} Level: {vol_text}")`
    },

    // --- Print Markdown ---
    {
        id: "tut-ui-print-md",
        type: "markdown",
        content: "## Rich Output: `print_md()`\n\n`print_md()` outputs formatted Markdown that looks like markdown cells. You can embed interactive components using f-strings!"
    },
    {
        id: "tut-demo-print-md",
        type: "code",
        content: `from pynote_ui import print_md, Slider, Text

brightness = Slider(value=75, label="Brightness", width="100%")
brightness_val = Text(content="75%")

def update_brightness(data):
    brightness_val.content = f"{int(data['value'])}%"

brightness.on_update(update_brightness)

print_md(f"""
## Display Settings

Adjust the screen brightness:

{brightness}

**Current value:** {brightness_val}

---

*Interactive components work inside markdown!*
""")`
    },
    {
        id: "tut-ui-printmd-note",
        type: "markdown",
        content: "**Note:** `print_md()` handles its own content processing, so components embedded within markdown may appear differently compared to standalone components. This is because markdown content flows as inline/block text.\n\nPass `styled=False` for a monospace look that matches stdout instead of prose styling."
    },

    // --- Next Steps ---
    {
        id: "tut-ui-part2-next",
        type: "markdown",
        content: `---

## 🎉 Part 2 Complete!

You now know how to build structured layouts and customize component appearance.

**Continue to Part 3** to learn about:
- Forms with deferred submission
- File uploads with drag & drop
- Cross-cell communication patterns
- The \`.options()\` method for clean configuration
- Real-world example: Settings Panel

| Next Steps | |
|------------|---|
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete component reference |

<br />`
    }
];
