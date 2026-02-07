import type { CellData } from "../store";

export const tutorialUIPart2Cells: CellData[] = [
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
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, styling, sizing, and borders |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layouts, forms, and interactive communication *(you are here)* |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

<br />

---`
    },

    // ============================================================================
    // INTERACTIVE UI - PART 2: Layouts & Interaction
    // ============================================================================
    {
        id: "tut-ui-part2-intro",
        type: "markdown",
        content: "# Interactive UI Part 2: Layouts & Interaction\n\nNow that you understand individual components, let's learn how to build complete interfaces.\n\n**In this part**, you'll learn about:\n- Building layouts with Group\n- Creating forms with deferred submission\n- Interactive communication patterns\n- Displaying UI elements anywhere in code\n- Cross-cell communication"
    },

    // --- Group Basics ---
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

    // --- Alignment ---
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
], align="start", label="Align: Start", border=True)`
    },
    {
        id: "tut-demo-alignment4",
        type: "code",
        content: `from pynote_ui import Button, Group

Group([
    Button(label="Start"),
    Button(label="Center"),
    Button(label="End"),
], align="center", label="Align: Center", border=True)`
    },

    // --- Nested Groups ---
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
btn_square = Button(label="^2", color="info", grow=1)
btn_square.on_update(handle_square)
btn_clear = Button(label="C", color="error", grow=1)
btn_clear.on_update(handle_clear)

buttons_row1 = Group([btn_7, btn_8, btn_9, btn_square, btn_clear], layout="row")

# Row 2: 4, 5, 6, ×, +
btn_4 = Button(label="4", grow=1)
btn_4.on_update(handle_number)
btn_5 = Button(label="5", grow=1)
btn_5.on_update(handle_number)
btn_6 = Button(label="6", grow=1)
btn_6.on_update(handle_number)
btn_mult = Button(label="×", color="primary", grow=1)
btn_mult.on_update(handle_operation)
btn_plus = Button(label="+", color="primary", grow=1)
btn_plus.on_update(handle_operation)

buttons_row2 = Group([btn_4, btn_5, btn_6, btn_mult, btn_plus], layout="row")

# Row 3: 1, 2, 3, ÷, -
btn_1 = Button(label="1", grow=1)
btn_1.on_update(handle_number)
btn_2 = Button(label="2", grow=1)
btn_2.on_update(handle_number)
btn_3 = Button(label="3", grow=1)
btn_3.on_update(handle_number)
btn_div = Button(label="÷", color="primary", grow=1)
btn_div.on_update(handle_operation)
btn_minus = Button(label="-", color="primary", grow=1)
btn_minus.on_update(handle_operation)

buttons_row3 = Group([btn_1, btn_2, btn_3, btn_div, btn_minus], layout="row")

# Row 4: 0, ., = (with = having grow=4)
btn_0 = Button(label="0", grow=1)
btn_0.on_update(handle_number)
btn_decimal = Button(label=".", grow=1)
btn_decimal.on_update(handle_decimal)
btn_equals = Button(label="=", color="success", grow=4)
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

    // --- Gap and Padding ---
    {
        id: "tut-ui-gap-padding",
        type: "markdown",
        content: "## Gap and Padding\n\n### `gap`\nControls spacing **between** children:\n- Numbers use Tailwind spacing scale: `gap=1` → 0.25rem, `gap=3` → 0.75rem\n- Strings are used as-is: `gap=\"1rem\"`, `gap=\"20px\"`\n- Default: `gap=3`\n\n### `padding`\nControls spacing **inside** the container:\n- Numbers → pixels: `padding=16` → 16px\n- Strings → CSS values: `padding=\"1rem\"`\n- Default: Automatic based on label/border"
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

    // --- Overflow ---
    {
        id: "tut-ui-overflow",
        type: "markdown",
        content: "## Overflow Handling\n\nControl what happens when content exceeds container size:\n- `overflow=\"visible\"` — Content overflows container (default)\n- `overflow=\"hidden\"` — Content is clipped\n- `overflow=\"scroll\"` — Scrollbars appear\n- `overflow=\"auto\"` — Scrollbars appear only when needed\n- `overflow=\"scroll-x\"` — Horizontal scroll only\n- `overflow=\"scroll-y\"` — Vertical scroll only"
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

    // --- Hide/Show Section ---
    {
        id: "tut-ui-hide-show-intro",
        type: "markdown",
        content: "## Hide and Show Components\n\nAll UI components support `.hide()` and `.show()` methods for reactive visibility control. This is perfect for:\n- Showing results only after form submission\n- Conditional UI based on user actions\n- Progressive disclosure patterns\n\nComponents can also start hidden with `hidden=True` parameter."
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
        content: "**Try it:** Click \"Show Secret\" to reveal the hidden Text component, then \"Hide Secret\" to hide it again. The `hidden` property is reactive - changes take effect immediately.\n\n**Performance:** Hiding components uses CSS `display: none`, which is extremely efficient. Hidden components maintain their state and can be shown again instantly."
    },

    // --- Form Introduction ---
    {
        id: "tut-ui-form-intro",
        type: "markdown",
        content: "## Form: Deferred Submission\n\n`Form` is a special container that **defers communication** with Python until a submit button is clicked. This is perfect for collecting multiple inputs before processing.\n\n**How it works:**\n1. Place any components inside Form (Input, Select, Checkbox, Toggle, Slider, etc.)\n2. Add a Button with `button_type=\"submit\"`\n3. When submit button clicked, Form:\n   - Collects all child values into a dictionary\n   - Sends dict to Python (accessible via `form.value`)\n   - Updates each child component individually\n\n**Result:** Python can access values via:\n- `form.value` — Dictionary of all values\n- Individual components — `input.value`, `checkbox.checked`, `slider.value`, etc."
    },

    // --- Form Basic Example ---
    {
        id: "tut-ui-form-basic",
        type: "markdown",
        content: "### Basic Form Example"
    },
    {
        id: "tut-demo-form-basic",
        type: "code",
        content: `from pynote_ui import Form, Input, Button, Text, Group

# Create form with inputs
name_input = Input(placeholder="Your name", grow=1)
email_input = Input(placeholder="Email", input_type="email", grow=1)
submit_btn = Button(label="Submit", button_type="submit", color="primary")
result = Text(content="", hidden=True)  # Start hidden

# Button callback - called when submit is clicked AND after form processes
def on_submit(data):
    # Access individual component values
    result.content = f"Submitted! Name: {name_input.value}, Email: {email_input.value}"
    result.show()  # Show the result

submit_btn.on_update(on_submit)

# Form defers input updates until submit
contact_form = Form([
    Group([name_input, email_input], layout="row"),
    submit_btn,
    result
], label="Contact Form", border=True)

# Display the form
contact_form`
    },
    {
        id: "tut-ui-form-basic-note",
        type: "markdown",
        content: "**Try it:** Type in the inputs above. Notice that Python doesn't receive updates until you click Submit. After submitting, both `name_input.value` and `email_input.value` are populated!\n\n**Notice:** The result Text starts `hidden=True` and only appears when `result.show()` is called after submission. This creates a cleaner UI than showing empty text boxes. All components support `.hide()` and `.show()` methods for reactive visibility control."
    },

    // --- Form with Value Dict ---
    {
        id: "tut-ui-form-dict",
        type: "markdown",
        content: "### Accessing Form.value Dictionary\n\nYou can also access all values at once via `form.value`:"
    },
    {
        id: "tut-demo-form-dict",
        type: "code",
        content: `from pynote_ui import Form, Input, Select, Checkbox, Button, Text, Group

# Create form components
username = Input(placeholder="Username", grow=1)
role = Select(options=["User", "Admin", "Guest"], placeholder="Select role", grow=1)
agree = Checkbox(label="I agree to terms", checked=False)
submit = Button(label="Register", button_type="submit", color="success")
output = Text(content="", hidden=True)  # Start hidden

def handle_registration(data):
    # Access values two ways:
    # 1. Via form.value dictionary
    print(f"Form values dict: {registration_form.value}")
    
    # 2. Via individual components
    output.content = f"Registered {username.value} as {role.value}. Agreed: {agree.checked}"
    output.show()  # Show the result

submit.on_update(handle_registration)

registration_form = Form([
    Group([username, role], layout="row"),
    agree,
    submit,
    output
], label="Registration Form", border=True)

registration_form`
    },

    // --- Button Types ---
    {
        id: "tut-ui-button-types",
        type: "markdown",
        content: "## Button Types\n\nButtons support a `button_type` parameter:\n- `\"default\"` — Normal button (triggers immediately)\n- `\"primary\"` — Styled primary button (always filled background)\n- `\"submit\"` — Submit button (triggers form submission when inside Form)\n\nNote: `button_type` is different from the `style` parameter (outline, soft, etc.)"
    },
    {
        id: "tut-demo-button-types",
        type: "code",
        content: `from pynote_ui import Button, Group

Group([
    Button(label="Default", button_type="default"),
    Button(label="Primary", button_type="primary"),
    Button(label="Submit (no form)", button_type="submit"),
], layout="row")`
    },

    // --- Complete Form Example ---
    {
        id: "tut-ui-form-complete",
        type: "markdown",
        content: "### Complete Form with All Components"
    },
    {
        id: "tut-demo-form-complete",
        type: "code",
        content: `from pynote_ui import Form, Input, Textarea, Select, Toggle, Checkbox, Button, Text, Group

# Create all form fields
full_name = Input(placeholder="Full name", grow=1)
email = Input(placeholder="Email", input_type="email", grow=1)
country = Select(
    options=["USA", "UK", "Canada", "Australia", "Other"],
    placeholder="Country",
    grow=1
)
bio = Textarea(placeholder="Tell us about yourself...", height="300px", rows=3, grow=1, width="100%")
newsletter = Toggle(label="Subscribe to newsletter", color="primary", border=False)
terms = Checkbox(label="I accept terms of service", color="success", border=False)

# Submit button - initially disabled
registration_submit_btn = Button(
    label="Submit Registration",
    button_type="submit",
    color="primary",
    disabled=True
)

# Result display
result_display = Text(content="", hidden=True)

# Enable submit only when terms checked
def check_terms(data):
    registration_submit_btn.disabled = not data['checked'] or full_name.value == '' or email.value == '' or bio.value == ''

terms.on_update(check_terms)

# Handle submission
def handle_submit(data):
    # Can access via form.value or individual components
    result_display.content = f"✅ Registered {full_name.value} from {country.value}"
    result_display.show()
    print(f"Full form data: {user_form.value}")

registration_submit_btn.on_update(handle_submit)

# Build the form
user_form = Form([
    Group([full_name, email, country], layout="row"),
    bio,
    newsletter,
    terms,
    registration_submit_btn,
    result_display
], label="User Registration", border=True, gap=2)

user_form`
    },

    // --- Display Functions ---
    {
        id: "tut-ui-display",
        type: "markdown",
        content: "## Displaying UI Anywhere: `display()`\n\nBy default, UI components only render when they're the **last expression** in a cell. The `display()` function lets you output components **at any point** during execution.\n\n**Signature:** `display(*elements, inline=False, gap=1)`\n- `inline=False` (default): Each element on its own line\n- `inline=True`: Elements on the same line\n- `gap`: Spacing between elements"
    },
    {
        id: "tut-demo-display",
        type: "code",
        content: `from pynote_ui import Slider, Text, Button, display

print("Setting up controls...")

vol_slider = Slider(value=75, label="Volume", width="100%")
status_text = Text(content="Volume: 75%")
volume_reset_btn = Button(label="Reset")

def update_volume(data):
    status_text.content = f"Volume: {int(data['value'])}%"

def reset_volume(data):
    vol_slider.value = 50
    status_text.content = "Volume: 50%"

vol_slider.on_update(update_volume)
volume_reset_btn.on_update(reset_volume)

# Display components inline
display(vol_slider, status_text, volume_reset_btn)

print("☝️ Components displayed inline in the output")`
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

    // --- Cross-Cell Communication ---
    {
        id: "tut-ui-cross-cell",
        type: "markdown",
        content: "## Cross-Cell Communication\n\nUI components can communicate **across cells** since they persist in Python's memory. This enables powerful multi-cell interfaces.\n\n**Run the cells below in order:**"
    },
    {
        id: "tut-demo-cross-cell1",
        type: "code",
        content: `# Cell 1: Create a shared slider
from pynote_ui import Slider, display

shared_slider = Slider(value=50, label="Shared Slider", width="100%")
display(shared_slider)

print("☝️ This slider will control the text in the next cell")`
    },
    {
        id: "tut-demo-cross-cell2",
        type: "code",
        content: `# Cell 2: Create a text that responds to Cell 1's slider
from pynote_ui import Text, display

response_text = Text(content="Waiting for slider...", width="100%")

def respond_to_slider(data):
    response_text.content = f"Received value {int(data['value'])} from Cell 1!"

# Connect to the slider from Cell 1
shared_slider.on_update(respond_to_slider)

display(response_text)
print("☝️ Now move the slider in Cell 1 - this text updates!")`
    },

    // --- Communication Patterns ---
    {
        id: "tut-ui-patterns",
        type: "markdown",
        content: "## Communication Patterns\n\nHere are common patterns for building interactive interfaces:\n\n### 1. Immediate Updates (Normal Components)\nComponents outside Forms update Python immediately:\n```python\ninput.on_update(callback)  # Called on every keystroke\n```\n\n### 2. Deferred Updates (Inside Forms)\nComponents inside Forms defer updates until submit:\n```python\nform = Form([input, submit_button])\n# input only updates Python after submit clicked\n```\n\n### 3. Bidirectional Sync\nPython can update component state:\n```python\nslider.value = 75  # Updates UI immediately\n```\n\n### 4. Cross-Cell Communication\nComponents created in one cell can be used in others:\n```python\n# Cell 1\ncontrol = Slider(...)\n\n# Cell 2\ncontrol.on_update(callback)  # Works!\n```"
    },

    // --- Real-World Example ---
    {
        id: "tut-ui-real-world",
        type: "markdown",
        content: "## Real-World Example: Settings Panel"
    },
    {
        id: "tut-demo-real-world",
        type: "code",
        content: `from pynote_ui import Group, Slider, Select, Toggle, Button, Text

# Create settings controls
volume = Slider(value=70, label="Volume", grow=1)
quality = Select(
    options=["Low", "Medium", "High", "Ultra"],
    value="High",
    grow=1
)
auto_play = Toggle(label="Auto-play next video", checked=True)
subtitles = Toggle(label="Show subtitles", checked=False)

save_btn = Button(label="Save Settings", color="primary")
settings_reset_btn = Button(label="Reset to Defaults", style="outline")

status_text = Text(content="")

def save_settings(data):
    status_text.content = f"✅ Saved: Volume {int(volume.value)}%, Quality: {quality.value}"

def reset_settings(data):
    volume.value = 70
    quality.value = "High"
    auto_play.checked = True
    subtitles.checked = False
    status_text.content = "↺ Reset to defaults"

save_btn.on_update(save_settings)
settings_reset_btn.on_update(reset_settings)

# Build the interface
Group([
    Group([
        Text(content="Volume", size="sm"),
        volume
    ]),
    Group([
        Text(content="Quality", size="sm"),
        quality
    ]),
    Group([auto_play, subtitles]),
    Group([save_btn, settings_reset_btn], layout="row"),
    status_text
], label="Video Settings", border=True, gap=3)`
    },

    // --- Next Steps ---
    {
        id: "tut-ui-part2-next",
        type: "markdown",
        content: `---

<br />

## 🎉 Interactive UI Complete!

You now know how to build complete reactive interfaces with PyNote!

**What you learned:**
- Building layouts with Group (rows, columns, nesting)
- Creating forms with deferred submission
- Button types and form submission
- Display functions for flexible output
- Cross-cell communication patterns

<br />

| Continue Learning |
|-------------------|
| **[Charts & Plotting](?open=tutorial_charts)** → Create beautiful visualizations |
| **[Reactive Execution](?open=tutorial_reactive)** → Automatic cell propagation |
| **[API Reference](?open=tutorial_api)** → Complete component reference |

<br />`
    }
];
