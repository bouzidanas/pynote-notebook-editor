import type { CellData } from "../store";

export const tutorialTestingCells: CellData[] = [
    {
        id: "test-header",
        type: "markdown",
        content: `# 🧪 Testing Ground

This is a hidden testing notebook - accessible only via \`?open=testing\` URL parameter.

Use this to test new features and verify component behavior without exposing incomplete work to users.

---`
    },

    {
        id: "test-border-title",
        type: "markdown",
        content: `## Border Reactivity Test

This demo tests \`send_update()\` for border changes across all component types. It verifies:
- Initial border rendering
- Dynamic border updates from Python
- Various border value formats (boolean, color, CSS string)
- Nested Group border updates`
    },

    {
        id: "test-border-demo",
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

    {
        id: "test-border-notes",
        type: "markdown",
        content: `### Expected Behavior

1. **Initial Render**: All components should display with \`border=True\`
2. **False**: All borders should disappear
3. **primary**: All borders should be primary color
4. **#00ff00**: All borders should be bright green
5. **3px dashed red**: All borders should be thick red dashed lines
6. **1px dotted rgba(0,0,0,0.3)**: All borders should be thin semi-transparent dotted lines

### Testing Checklist

- [ ] Initial render works
- [ ] Changing border value updates all components
- [ ] Re-running cell maintains reactivity 
- [ ] All border value types render correctly
- [ ] Group border updates independently`
    },

    {
        id: "test-size-title",
        type: "markdown",
        content: `---

## Size Reactivity Test

This demo tests \`send_update()\` for size changes across all component types. It verifies:
- Initial size rendering
- Dynamic size updates from Python
- All size presets (xs, sm, md, lg, xl)
- Text scaling and padding adjustments`
    },

    {
        id: "test-size-demo",
        type: "code",
        content: `from pynote_ui import *

# Size options to demonstrate
size_options = ["xs", "sm", "md", "lg", "xl"]

# Controls
size_label = Text(content="size = ", width="fit-content", size="md", border=False)
size_select = Select(
    choices=size_options,
    value="md",
    width="fit-content",
    size="md"
)

# Create all components with initial size
initial_size = "md"

# Column 1 components
size_slider = Slider(min=0, max=100, value=50, label="Slider", size=initial_size, width="100%")
size_text = Text(content="Text Component", size=initial_size, width="100%", align_h="center")
size_input = Input(placeholder="Input field", size=initial_size, width="100%")
size_select_comp = Select(choices=["Option A", "Option B", "Option C"], value="Option A", size=initial_size, width="100%")

# Column 2 components
size_textarea = Textarea(placeholder="Textarea field", rows=3, size=initial_size, width="100%")
size_toggle = Toggle(checked=True, label="Toggle", size=initial_size, width="100%")
size_checkbox = Checkbox(checked=True, label="Checkbox", size=initial_size, width="100%")
size_button = Button(label="Button", color="primary", size=initial_size, width="100%")

# Layout: Two columns in a row
size_col1 = Group([size_slider, size_text, size_input, size_select_comp], border=True, grow=1, label="Column 1")
size_col2 = Group([size_textarea, size_toggle, size_checkbox, size_button], border=True, grow=1, label="Column 2")
size_components_row = Group([size_col1, size_col2], layout="row", border=False, gap=4)

# Update all sizes when selection changes
def update_sizes(data):
    size_value = data['value']
    
    # Update all components
    size_slider.send_update(size=size_value)
    size_text.send_update(size=size_value)
    size_input.send_update(size=size_value)
    size_select_comp.send_update(size=size_value)
    size_textarea.send_update(size=size_value)
    size_toggle.send_update(size=size_value)
    size_checkbox.send_update(size=size_value)
    size_button.send_update(size=size_value)

size_select.on_update(update_sizes)

# Display everything
Group([
    Group([size_label, size_select], layout="row", border=False, gap=2),
    size_components_row
], gap=4, border=False)`
    },

    {
        id: "test-size-notes",
        type: "markdown",
        content: `### Expected Behavior

1. **xs**: Extra small - tiny text and minimal padding
2. **sm**: Small - compact text and padding
3. **md**: Medium - default size (initial render)
4. **lg**: Large - bigger text and padding
5. **xl**: Extra large - maximum text and padding

### Testing Checklist

- [ ] Initial render works at md size
- [ ] Changing size value updates all components
- [ ] Re-running cell maintains reactivity 
- [ ] All size presets render correctly
- [ ] Text scales proportionally with size
- [ ] Padding/spacing adjusts with size`
    },

    {
        id: "test-layout-title",
        type: "markdown",
        content: `---

## Layout Props Test (Toggle/Checkbox)

This demo tests the layout control props for Toggle and Checkbox components:
- **\`reverse\`**: Switches element order (label to right when True) WITHOUT affecting alignment
- **\`align\`**: Horizontal alignment (left/center/right) - only affects layout when spaced=False
- **\`spaced\`**: Space-between layout (elements at opposite ends) - overrides align when True`
    },

    {
        id: "test-layout-demo",
        type: "code",
        content: `from pynote_ui import *

# Control options
align_options = ["left", "center", "right"]
bool_options = ["False", "True"]

# Helper to convert string to bool
def to_bool(val):
    return val == "True"

# Create control selects
align_select = Select(choices=align_options, value="left", width="fit-content")
reverse_select = Select(choices=bool_options, value="False", width="fit-content")
spaced_select = Select(choices=bool_options, value="False", width="fit-content")

# Controls layout
controls_group = Group([
    Text(content="Layout Controls:", width="fit-content", border=False),
    Group([
        Text(content="align = ", width="fit-content", border=False),
        align_select
    ], layout="row", border=False, gap=2),
    Group([
        Text(content="reverse = ", width="fit-content", border=False),
        reverse_select
    ], layout="row", border=False, gap=2),
    Group([
        Text(content="spaced = ", width="fit-content", border=False),
        spaced_select
    ], layout="row", border=False, gap=2)
], border=True, gap=3, label="Controls")

# Test components with initial values
toggle1 = Toggle(checked=True, label="Toggle Switch", align="left", reverse=False, spaced=False, width="100%")
checkbox1 = Checkbox(checked=True, label="Checkbox Item", align="left", reverse=False, spaced=False, width="100%")

# Component display group
components_group = Group([
    toggle1,
    checkbox1
], border=True, gap=3, label="Test Components")

# Update function
def update_layout(data):
    # Get current values from the select components
    align_val = align_select.value
    reverse_val = to_bool(reverse_select.value)
    spaced_val = to_bool(spaced_select.value)
    
    # Update both components
    toggle1.send_update(align=align_val, reverse=reverse_val, spaced=spaced_val)
    checkbox1.send_update(align=align_val, reverse=reverse_val, spaced=spaced_val)

# Attach handlers
align_select.on_update(update_layout)
reverse_select.on_update(update_layout)
spaced_select.on_update(update_layout)

# Display
Group([controls_group, components_group], gap=4, border=False)`
    },

    {
        id: "test-layout-notes",
        type: "markdown",
        content: `### Expected Behavior

**\`reverse\` prop:**
- **False** (default): Toggle/checkbox on left, label on right
- **True**: Label on left, toggle/checkbox on right
- **Important**: Reversing does NOT change alignment! Content stays at left/center/right based on \`align\` prop

**\`align\` prop** (only effective when spaced=False):
- **left** (default): Elements grouped at left side (works with reverse=True or False)
- **center**: Elements centered horizontally (works with reverse=True or False)
- **right**: Elements grouped at right side (works with reverse=True or False)

**\`spaced\` prop:**
- **False** (default): Elements grouped together with align setting
- **True**: Space-between layout - toggle/checkbox and label at opposite ends (overrides align)

### Testing Checklist

- [ ] Initial render shows default layout (left aligned, not reversed, not spaced)
- [ ] Changing align moves content (left/center/right) independently of reverse
- [ ] Changing reverse flips element order WITHOUT changing alignment
- [ ] When spaced=True, align has no effect (space-between overrides)
- [ ] When spaced=False, align works as expected
- [ ] reverse + align combinations work correctly (e.g., reverse=True align=left stays left-aligned)
- [ ] All combinations update reactively
- [ ] Both Toggle and Checkbox behave identically`
    },

    {
        id: "test-background-title",
        type: "markdown",
        content: `---

## Background Reactivity Test

This demo tests \`send_update()\` for background changes across all component types. It verifies:
- Initial background rendering
- Dynamic background updates from Python
- Various background value formats (boolean, color presets, custom colors, gradients)
- Transparency and theme color backgrounds`
    },

    {
        id: "test-background-demo",
        type: "code",
        content: `from pynote_ui import *

# Background options to demonstrate
background_options = [
    "True",
    "False",
    "primary",
    "secondary",
    "#ff6b6b",
    "rgba(100, 200, 255, 0.3)",
    "linear-gradient(90deg, #667eea 0%, #764ba2 100%)"
]

# Controls
bg_label = Text(content="background = ", width="fit-content", border=False, background=False)
bg_select = Select(
    choices=background_options,
    value="True",
    width="fit-content"
)

# Convert string values to actual background values
def get_background_value(option):
    if option == "True":
        return True
    elif option == "False":
        return False
    else:
        return option

# Create all components with initial background
initial_bg = True

# Column 1 components
bg_slider = Slider(min=0, max=100, value=50, label="Slider", background=initial_bg, width="100%")
bg_text = Text(content="Text Component", background=initial_bg, width="100%", align_h="center")
bg_input = Input(placeholder="Input field", background=initial_bg, width="100%")
bg_select_comp = Select(choices=["Option A", "Option B", "Option C"], value="Option A", background=initial_bg, width="100%")

# Column 2 components
bg_textarea = Textarea(placeholder="Textarea field", rows=3, background=initial_bg, width="100%")
bg_toggle = Toggle(checked=True, label="Toggle", background=initial_bg, width="100%")
bg_checkbox = Checkbox(checked=True, label="Checkbox", background=initial_bg, width="100%")
bg_button = Button(label="Button", color="primary", background=initial_bg, width="100%")

# Layout: Two columns in a row
bg_col1 = Group([bg_slider, bg_text, bg_input, bg_select_comp], border=True, background=False, grow=1, label="Column 1")
bg_col2 = Group([bg_textarea, bg_toggle, bg_checkbox, bg_button], border=True, background=False, grow=1, label="Column 2")
bg_components_row = Group([bg_col1, bg_col2], layout="row", border=False, background=initial_bg, gap=4)

# Update all backgrounds when selection changes
def update_backgrounds(data):
    bg_value = get_background_value(data['value'])
    
    # Update all components
    bg_slider.send_update(background=bg_value)
    bg_text.send_update(background=bg_value)
    bg_input.send_update(background=bg_value)
    bg_select_comp.send_update(background=bg_value)
    bg_textarea.send_update(background=bg_value)
    bg_toggle.send_update(background=bg_value)
    bg_checkbox.send_update(background=bg_value)
    bg_button.send_update(background=bg_value)
    
    # Update outer container
    bg_components_row.send_update(background=bg_value)

bg_select.on_update(update_backgrounds)

# Display everything
Group([
    Group([bg_label, bg_select], layout="row", border=False, gap=2),
    bg_components_row
], gap=4, border=False)`
    },

    {
        id: "test-background-notes",
        type: "markdown",
        content: `### Expected Behavior

1. **True**: All components should display with default background color
2. **False**: All backgrounds should be transparent
3. **primary**: All backgrounds should be primary theme color
4. **secondary**: All backgrounds should be secondary theme color
5. **#ff6b6b**: All backgrounds should be coral red
6. **rgba(100, 200, 255, 0.3)**: All backgrounds should be semi-transparent light blue
7. **linear-gradient(...)**: All backgrounds should show purple gradient

### Testing Checklist

- [ ] Initial render works with background=True
- [ ] Changing background value updates all components
- [ ] Re-running cell maintains reactivity 
- [ ] All background value types render correctly (boolean, presets, custom colors, gradients)
- [ ] False creates transparent backgrounds
- [ ] Custom colors (hex, rgba) work as expected
- [ ] CSS gradients apply correctly
- [ ] Group background updates independently`
    },

    // === .options() Method Test ===
    {
        id: "test-options-header",
        type: "markdown",
        content: `## Test 5: \`.options()\` Method

Test the new \`.options()\` method for cleaner post-initialization property updates.`
    },
    {
        id: "test-options-code",
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
    {
        id: "test-options-notes",
        type: "markdown",
        content: `### Expected Behavior

- All components should render with styling applied via \`.options()\`
- Volume slider: labeled, full width, primary color, large
- Theme select: full width, secondary color, large
- Status text: full width, blue border, large
- Apply button: full width, success color
- Clicking Apply should update status text and change border to green

### Benefits of \`.options()\`

1. **Cleaner Code**: Separate data from styling
2. **Method Chaining**: Returns self for chaining calls
3. **Conditional Styling**: Easily apply styles based on logic
4. **Programmatic Configuration**: Perfect for dynamic UIs

**Example Comparison:**

\`\`\`python
# Old way
slider = Slider(value=50, label="Volume", width="100%", color="primary", size="lg")

# New way with .options()
slider = Slider(value=50)
slider.options(label="Volume", width="100%", color="primary", size="lg")

# Or chained
slider = Slider(value=50).options(label="Volume", width="100%", color="primary", size="lg")
\`\`\`

Both ways work! Use whichever is clearer for your use case.`
    }
];
