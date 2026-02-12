import type { CellData } from "../store";

export const tutorialUIPart3Cells: CellData[] = [
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
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, colors, sizes, and states |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns *(you are here)* |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

<br />

---`
    },

    // ============================================================================
    // INTERACTIVE UI - PART 3: Forms, Uploads & Advanced
    // ============================================================================
    {
        id: "tut-ui-part3-intro",
        type: "markdown",
        content: `# Interactive UI Part 3: Forms, Uploads & Advanced Patterns

This final UI tutorial covers forms with deferred submission, file uploads, cross-cell communication, and advanced configuration patterns.

**In this part**, you'll learn about:
- Creating forms with deferred submission
- Button types and form submission
- File uploads with drag & drop
- Cross-cell communication
- The \`.options()\` method for clean configuration
- Building real-world interfaces`
    },

    // ============================================================================
    // FORM INTRODUCTION
    // ============================================================================
    {
        id: "tut-ui-form-intro",
        type: "markdown",
        content: `## Form: Deferred Submission

\`Form\` is a special container that **defers communication** with Python until a submit button is clicked. This is perfect for collecting multiple inputs before processing.

**How it works:**
1. Place any components inside Form (Input, Select, Checkbox, Toggle, Slider, etc.)
2. Add a Button with \`button_type="submit"\`
3. When the submit button is clicked, the Form:
   - Collects all child values into a dictionary
   - Sends the dict to Python (accessible via \`form.value\`)
   - Updates each child component individually

**Result:** Python can access values via:
- \`form.value\` — Dictionary of all values
- Individual components — \`input.value\`, \`checkbox.checked\`, \`slider.value\`, etc.`
    },

    // --- Basic Form ---
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
        content: "**Try it:** Type in the inputs above. Notice that Python doesn't receive updates until you click Submit. After submitting, both `name_input.value` and `email_input.value` are populated!\n\n**Notice:** The result Text starts `hidden=True` and only appears when `result.show()` is called after submission."
    },

    // --- Form Value Dict ---
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
role = Select(choices=["User", "Admin", "Guest"], placeholder="Select role", grow=1)
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
        content: `## Button Types

Buttons support a \`button_type\` parameter:
- \`"default"\` — Normal button (triggers immediately)
- \`"primary"\` — Styled primary button (always filled background)
- \`"submit"\` — Submit button (triggers form submission when inside Form)

Note: \`button_type\` is different from the \`style\` parameter (outline, soft, etc.)`
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
    choices=["USA", "UK", "Canada", "Australia", "Other"],
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

    // ============================================================================
    // UPLOAD COMPONENT
    // ============================================================================
    {
        id: "tut-ui-upload-intro",
        type: "markdown",
        content: `## Upload: Drag & Drop File Upload

The \`Upload\` component provides a **drag & drop** file upload area. Files can be uploaded immediately (standalone) or deferred until form submission (inside a Form).

**Key features:**
- Drag & drop or click-to-browse
- Multi-file support
- Success/error status indicators
- File removal (before and after upload)
- Works standalone (immediate) or inside Form (deferred)
- Supports all shared styling props (color, size, border, background)`
    },

    // --- Standalone Upload ---
    {
        id: "tut-ui-upload-standalone",
        type: "markdown",
        content: "### Standalone Upload (Immediate Mode)\n\nWhen used outside a Form, files are sent to Python immediately after dropping. Access uploaded files via `uploader.files` — a dictionary mapping filenames to their raw bytes."
    },
    {
        id: "tut-demo-upload-standalone",
        type: "code",
        content: `from pynote_ui import *

# --- Standalone Upload (immediate mode) ---
uploader = Upload(label="Drop files here", width="100%")

status_text = Text(content="No files uploaded yet.", border=False)

def on_upload(data):
    if not uploader.files:
        status_text.content = "No files uploaded yet."
        return
    nl = chr(10)
    lines = []
    for name, raw in uploader.files.items():
        try:
            text = raw.decode("utf-8")
        except Exception:
            text = repr(raw[:100])
        preview = text[:300] + ("..." if len(text) > 300 else "")
        lines.append(f"**{name}** ({len(raw)} bytes)")
        lines.append(preview)
    status_text.content = (nl * 2).join(lines)

uploader.on_update(on_upload)

Group([
    Text(content="Standalone Upload (immediate)", border=False, size="lg"),
    uploader,
    status_text
], gap=3, border=True, label="Immediate Mode")`
    },

    // --- Upload inside Form ---
    {
        id: "tut-ui-upload-form",
        type: "markdown",
        content: "### Upload inside a Form (Deferred Mode)\n\nWhen placed inside a `Form`, files are **not sent to Python** until the form is submitted. This lets users add/remove files before committing."
    },
    {
        id: "tut-demo-upload-form",
        type: "code",
        content: `from pynote_ui import *

# --- Upload inside a Form (deferred mode) ---
form_upload = Upload(label="Attach files", width="100%")
submit_btn = Button(label="Submit Form", button_type="submit", color="primary", width="100%")
form_status = Text(content="Add files and click Submit.", border=False)

def on_submit(data):
    if not form_upload.files:
        form_status.content = "Form submitted with no files."
        return
    nl = chr(10)
    lines = []
    for name, raw in form_upload.files.items():
        try:
            text = raw.decode("utf-8")
        except Exception:
            text = repr(raw[:100])
        preview = text[:300] + ("..." if len(text) > 300 else "")
        lines.append(f"**{name}** ({len(raw)} bytes)")
        lines.append(preview)
    form_status.content = (nl * 2).join(lines)

submit_btn.on_update(on_submit)

Form([
    form_upload,
    submit_btn,
    form_status
], label="Deferred Upload (Form)", border=True, gap=3)`
    },

    // ============================================================================
    // CROSS-CELL COMMUNICATION
    // ============================================================================
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
        content: `## Communication Patterns

Here are common patterns for building interactive interfaces:

### 1. Immediate Updates (Normal Components)
Components outside Forms update Python immediately:
\`\`\`python
input.on_update(callback)  # Called on every keystroke
\`\`\`

### 2. Deferred Updates (Inside Forms)
Components inside Forms defer updates until submit:
\`\`\`python
form = Form([input, submit_button])
# input only updates Python after submit clicked
\`\`\`

### 3. Bidirectional Sync
Python can update component state:
\`\`\`python
slider.value = 75  # Updates UI immediately
\`\`\`

### 4. Cross-Cell Communication
Components created in one cell can be used in others:
\`\`\`python
# Cell 1
control = Slider(...)

# Cell 2
control.on_update(callback)  # Works!
\`\`\``
    },

    // ============================================================================
    // .OPTIONS() METHOD
    // ============================================================================
    {
        id: "tut-ui-options-intro",
        type: "markdown",
        content: `## The \`.options()\` Method

The \`.options()\` method provides a clean way to configure styling **after** component creation. This separates data from presentation and is great for conditional or programmatic styling.

\`\`\`python
# Old way — everything in the constructor
slider = Slider(value=50, label="Volume", width="100%", color="primary", size="lg")

# New way — separate data from styling
slider = Slider(value=50)
slider.options(label="Volume", width="100%", color="primary", size="lg")

# Or chained
slider = Slider(value=50).options(label="Volume", width="100%", color="primary", size="lg")
\`\`\`

Both approaches work! Use whichever is clearer for your use case.`
    },
    {
        id: "tut-demo-options",
        type: "code",
        content: `from pynote_ui import Slider, Button, Text, Group, Select

# Create components with minimal initialization
volume = Slider(value=50)
theme = Select(choices=["Default", "Dark", "Light"], value="Default")
status = Text(content="Ready")
apply_btn = Button(label="Apply Settings")

# Use .options() to configure styling after creation
volume.options(label="Volume Control", width="100%", color="primary", size="lg")
theme.options(width="100%", color="secondary", size="lg")
status.options(width="100%", border="2px solid blue", size="lg")
apply_btn.options(color="success", width="100%")

def apply_settings(data):
    status.content = f"Applied! Volume: {int(volume.value)}, Theme: {theme.value}"
    # Can also chain .options() calls
    status.options(color="success", border="2px solid green")

apply_btn.on_update(apply_settings)

Group([
    volume,
    theme,
    status,
    apply_btn
], label=".options() Method Demo", border=True, gap=2)`
    },

    // ============================================================================
    // REAL-WORLD EXAMPLE
    // ============================================================================
    {
        id: "tut-ui-real-world",
        type: "markdown",
        content: "## Real-World Example: Settings Panel\n\nLet's put it all together with a realistic settings panel that combines most of the concepts from all three parts:"
    },
    {
        id: "tut-demo-real-world",
        type: "code",
        content: `from pynote_ui import Group, Slider, Select, Toggle, Button, Text

# Create settings controls
volume = Slider(value=70, label="Volume", grow=1, width="100%")
quality = Select(
    choices=["Low", "Medium", "High", "Ultra"],
    value="High",
    grow=1, width="100%"
)
auto_play = Toggle(label="Auto-play next video", checked=True, width="100%", reverse=True, spaced=True)
subtitles = Toggle(label="Show subtitles", checked=False, width="100%", reverse=True, spaced=True)

save_btn = Button(label="Save Settings", color="primary", background="primary")
settings_reset_btn = Button(label="Reset to Defaults", style="outline")

status_text = Text(content="", hidden=True)

def save_settings(data):
    status_text.content = f"✅ Saved: Volume {int(volume.value)}%, Quality: {quality.value}"
    status_text.show()

def reset_settings(data):
    volume.value = 70
    quality.value = "High"
    auto_play.checked = True
    subtitles.checked = False
    status_text.hide()

save_btn.on_update(save_settings)
settings_reset_btn.on_update(reset_settings)

# Build the interface
Group([
    Group([
        Text(content="VOLUME", size="sm", width="100%", border=False),
        volume
    ]),
    Group([
        Text(content="QUALITY", size="sm", width="100%", border=False),
        quality
    ]),
    Group([auto_play, subtitles]),
    Group([save_btn, settings_reset_btn], layout="row"),
    status_text
], label="Video Settings", border=True, gap=3)`
    },

    // --- Next Steps ---
    {
        id: "tut-ui-part3-next",
        type: "markdown",
        content: `---

<br />

## 🎉 Interactive UI Complete!

You now know how to build complete reactive interfaces with PyNote!

**What you learned across all three parts:**
- **Part 1:** All available components, colors, sizes, and states
- **Part 2:** Layout with Group, sizing, borders, and display functions
- **Part 3:** Forms, file uploads, cross-cell communication, and advanced patterns

<br />

| Continue Learning |
|-------------------|
| **[Charts & Plotting](?open=tutorial_charts)** → Create beautiful visualizations |
| **[Reactive Execution](?open=tutorial_reactive)** → Automatic cell propagation |
| **[API Reference](?open=tutorial_api)** → Complete component reference |

<br />

Happy coding! 🐍`
    }
];
