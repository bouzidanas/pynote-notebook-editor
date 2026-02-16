import type { CellData } from "../../store";

export const tutorialUICells: CellData[] = [
    // Table of contents (with modified "you are here")
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
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Interactive UI (Legacy)](?open=tutorial_ui)** | Original combined UI tutorial *(you are here)* |
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

    // --- Section: Size Presets ---
    {
        id: "tut-ui-sizes",
        type: "markdown",
        content: "## Size Presets\n\nAll components support a `size` parameter with presets: `\"xs\"`, `\"sm\"`, `\"md\"` (default), `\"lg\"`, `\"xl\"`. This affects padding, font sizes, and for Slider, the track and thumb sizes.\n\nUse the Select below to see how different sizes look on Slider and Text:"
    },
    {
        id: "tut-demo-sizes",
        type: "code",
        content: "from pynote_ui import Slider, Text, Select, Group\n\n# Components with dynamic size - start at 'md'\nsize_slider = Slider(value=50, label=\"Sample Slider\", size=\"md\", grow=1)\nsize_text = Text(content=\"Sample Text Display\", size=\"md\", grow=1)\n\n# Size selector with placeholder\nsize_select = Select(\n    choices=[\"xs\", \"sm\", \"md\", \"lg\", \"xl\"],\n    placeholder=\"Choose a size\",\n    color=\"primary\"\n)\n\n# Status text\ncurrent_size = Text(content=\"Select a size to update all components\", size=\"sm\")\n\ndef on_size_change(data):\n    new_size = data['value']\n    current_size.content = f\"Current size: {new_size}\"\n    # Update all components dynamically\n    size_slider.size = new_size\n    size_text.size = new_size\n    size_select.size = new_size\n\nsize_select.on_update(on_size_change)\n\nGroup([\n    Group([Text(content=\"Select size:\", size=\"sm\"), size_select], layout=\"row\", align=\"center\"),\n    size_slider,\n    size_text,\n    current_size\n], layout=\"col\", label=\"Size Presets Demo\", border=True, gap=2)"
    },
    {
        id: "tut-ui-sizes-examples",
        type: "markdown",
        content: "### Size Comparison\n\nHere's a visual comparison of all size presets:"
    },
    {
        id: "tut-demo-sizes-all",
        type: "code",
        content: "from pynote_ui import Slider, Text, Group\n\n# Show all size presets side by side\nGroup([\n    Group([\n        Text(content=\"XS\", size=\"xs\"),\n        Slider(value=25, label=\"Extra Small\", size=\"xs\", grow=1)\n    ], layout=\"row\", align=\"center\"),\n    Group([\n        Text(content=\"SM\", size=\"sm\"),\n        Slider(value=40, label=\"Small\", size=\"sm\", grow=1)\n    ], layout=\"row\", align=\"center\"),\n    Group([\n        Text(content=\"MD\", size=\"md\"),\n        Slider(value=55, label=\"Medium (default)\", size=\"md\", grow=1)\n    ], layout=\"row\", align=\"center\"),\n    Group([\n        Text(content=\"LG\", size=\"lg\"),\n        Slider(value=70, label=\"Large\", size=\"lg\", grow=1)\n    ], layout=\"row\", align=\"center\"),\n    Group([\n        Text(content=\"XL\", size=\"xl\"),\n        Slider(value=85, label=\"Extra Large\", size=\"xl\", grow=1)\n    ], layout=\"row\", align=\"center\"),\n], layout=\"col\", label=\"All Sizes\", border=True, gap=1)"
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
        id: "tut-ui-forms-intro",
        type: "markdown",
        content: "## Form Components\n\nPyNote includes a variety of interactive form components including buttons, inputs, selects, textareas, toggles, and checkboxes. All components support consistent sizing via `width`, `height`, `grow`, and `shrink` parameters."
    },

    // --- Button ---
    {
        id: "tut-ui-button",
        type: "markdown",
        content: "### Button\n\nButtons trigger actions when clicked. They support colors (`primary`, `secondary`, `accent`, `info`, `success`, `warning`, `error`), styles (`outline`, `dash`, `soft`, `ghost`, `link`), and sizes (`xs`, `sm`, `md`, `lg`, `xl`)."
    },
    {
        id: "tut-demo-button",
        type: "code",
        content: "from pynote_ui import Button, Text, Group\n\n# Create counter components\ncount_text = Text(content=\"Count: 0\", grow=1)\ncount = 0\n\ndef increment(data):\n    global count\n    count += 1\n    count_text.content = f\"Count: {count}\"\n\ndef decrement(data):\n    global count\n    count -= 1\n    count_text.content = f\"Count: {count}\"\n\ndef reset(data):\n    global count\n    count = 0\n    count_text.content = f\"Count: {count}\"\n\ndec_btn = Button(label=\"-\", color=\"error\", style=\"outline\")\ninc_btn = Button(label=\"+\", color=\"success\", style=\"outline\")\nreset_btn = Button(label=\"Reset\", color=\"warning\", style=\"soft\")\n\ndec_btn.on_update(decrement)\ninc_btn.on_update(increment)\nreset_btn.on_update(reset)\n\nGroup([\n    Group([dec_btn, count_text, inc_btn], layout=\"row\", align=\"center\"),\n    reset_btn\n], layout=\"col\", label=\"Counter\", border=True)"
    },

    // --- Select ---
    {
        id: "tut-ui-select",
        type: "markdown",
        content: "### Select\n\nSelect dropdowns let users pick from a list of options. Options can be simple strings or `{label, value}` dicts for different display/stored values."
    },
    {
        id: "tut-demo-select",
        type: "code",
        content: "from pynote_ui import Select, Text, Group\n\nlang_output = Text(content=\"Selected: None\")\n\nlang_select = Select(\n    choices=[\"Python\", \"JavaScript\", \"TypeScript\", \"Rust\", \"Go\"],\n    placeholder=\"Choose a language\",\n    color=\"primary\",\n    grow=1\n)\n\ndef on_lang_change(data):\n    lang_output.content = f\"Selected: {data['value']}\"\nlang_select.on_update(on_lang_change)\n\nGroup([lang_select, lang_output], layout=\"col\", label=\"Favorite Language\", border=True)"
    },

    // --- Input ---
    {
        id: "tut-ui-input",
        type: "markdown",
        content: "### Input\n\nText inputs for single-line text entry. Supports various input types: `text`, `password`, `email`, `number`, `search`, `tel`, `url`."
    },
    {
        id: "tut-demo-input",
        type: "code",
        content: "from pynote_ui import Input, Text, Group\n\ngreet_output = Text(content=\"Hello, stranger!\")\n\nname_input = Input(\n    value=\"\",\n    placeholder=\"Enter your name\",\n    color=\"primary\",\n    grow=1\n)\n\ndef on_name_change(data):\n    name = data['value'].strip()\n    if name:\n        greet_output.content = f\"Hello, {name}!\"\n    else:\n        greet_output.content = \"Hello, stranger!\"\nname_input.on_update(on_name_change)\n\nGroup([name_input, greet_output], layout=\"col\", label=\"Greeting\", border=True)"
    },

    // --- Textarea ---
    {
        id: "tut-ui-textarea",
        type: "markdown",
        content: "### Textarea\n\nMulti-line text input. The `rows` parameter controls the visible height."
    },
    {
        id: "tut-demo-textarea",
        type: "code",
        content: "from pynote_ui import Textarea, Text, Group\n\nchar_count = Text(content=\"Characters: 0\")\n\nnotes_area = Textarea(\n    value=\"\",\n    placeholder=\"Write your notes here...\",\n    rows=4,\n    color=\"secondary\",\n    grow=1\n)\n\ndef on_text_change(data):\n    char_count.content = f\"Characters: {len(data['value'])}\"\nnotes_area.on_update(on_text_change)\n\nGroup([notes_area, char_count], layout=\"col\", label=\"Notes\", border=True)"
    },

    // --- Toggle ---
    {
        id: "tut-ui-toggle",
        type: "markdown",
        content: "### Toggle\n\nSwitch-style toggles for on/off states. Access the state via `.checked` property."
    },
    {
        id: "tut-demo-toggle",
        type: "code",
        content: "from pynote_ui import Toggle, Text, Group\n\nstatus_text = Text(content=\"Dark mode: OFF\")\n\ndark_toggle = Toggle(\n    checked=False,\n    label=\"Dark Mode\",\n    color=\"primary\"\n)\n\ndef on_toggle_change(data):\n    status = \"ON\" if data['checked'] else \"OFF\"\n    status_text.content = f\"Dark mode: {status}\"\ndark_toggle.on_update(on_toggle_change)\n\nGroup([dark_toggle, status_text], layout=\"col\", label=\"Settings\", border=True)"
    },

    // --- Checkbox ---
    {
        id: "tut-ui-checkbox",
        type: "markdown",
        content: "### Checkbox\n\nCheckboxes for boolean selections. Works like Toggle but with a checkbox appearance."
    },
    {
        id: "tut-demo-checkbox",
        type: "code",
        content: "from pynote_ui import Checkbox, Text, Group\n\nterms_text = Text(content=\"Please agree to terms\")\n\nterms_check = Checkbox(\n    checked=False,\n    label=\"I agree to the terms\",\n    color=\"success\"\n)\n\ndef on_check_change(data):\n    if data['checked']:\n        terms_text.content = \"Thank you for agreeing!\"\n    else:\n        terms_text.content = \"Please agree to terms\"\nterms_check.on_update(on_check_change)\n\nGroup([terms_check, terms_text], layout=\"col\", label=\"Terms\", border=True)"
    },

    // --- Combined Form Example ---
    {
        id: "tut-ui-form-combined",
        type: "markdown",
        content: "### Building a Complete Form\n\nCombine all form components to build interactive interfaces:"
    },
    {
        id: "tut-demo-form-combined",
        type: "code",
        content: "from pynote_ui import Input, Select, Textarea, Toggle, Checkbox, Button, Text, Group, display\n\n# Form fields\nname_field = Input(placeholder=\"Your name\", grow=1)\nemail_field = Input(placeholder=\"Email\", input_type=\"email\", grow=1)\nrole_select = Select(\n    choices=[\"Developer\", \"Designer\", \"Manager\", \"Other\"],\n    placeholder=\"Select role\",\n    grow=1\n)\nbio_area = Textarea(placeholder=\"Tell us about yourself...\", rows=3, grow=1)\nnewsletter_toggle = Toggle(label=\"Subscribe to newsletter\", color=\"primary\")\nterms_checkbox = Checkbox(label=\"I accept the terms of service\", color=\"success\")\nsubmit_btn = Button(label=\"Submit\", color=\"primary\", style=\"soft\", disabled=True)\nresult_text = Text(content=\"\")\n\n# Enable submit only when terms are checked\ndef on_terms_change(data):\n    submit_btn.disabled = not data['checked']\nterms_checkbox.on_update(on_terms_change)\n\n# Handle submit\ndef on_submit(data):\n    result_text.content = f\"Submitted: {name_field.value} ({email_field.value})\"\nsubmit_btn.on_update(on_submit)\n\n# Layout the form\nGroup([\n    Group([name_field, email_field], layout=\"row\"),\n    role_select,\n    bio_area,\n    newsletter_toggle,\n    terms_checkbox,\n    submit_btn,\n    result_text\n], layout=\"col\", label=\"Registration Form\", border=True, gap=2)"
    },

    // --- Border Styling ---
    {
        id: "tut-ui-borders",
        type: "markdown",
        content: "## Border Styling\n\nAll components support a `border` prop that accepts CSS border strings. You can remove borders entirely with `border=\"none\"` or apply custom styles like `border=\"3px solid red\"`."
    },

    // --- Borderless Example ---
    {
        id: "tut-ui-borders-none",
        type: "markdown",
        content: "### Borderless Components\n\nCreate a clean, minimal look by removing all borders:"
    },
    {
        id: "tut-demo-borders-none",
        type: "code",
        content: `from pynote_ui import Button, Slider, Input, Select, Textarea, Toggle, Checkbox, Text, Group

# All components with no borders (border=False for special cleanup)
borderless_slider = Slider(value=50, label="Volume", border=False, grow=1)
borderless_input = Input(value="No borders", placeholder="Type here...", border=False, grow=1)
borderless_select = Select(
    choices=["Option 1", "Option 2", "Option 3"],
    value="Option 1",
    border=False,
    grow=1
)
borderless_textarea = Textarea(value="Minimalist design", rows=2, border=False, grow=1)
borderless_toggle = Toggle(checked=True, label="Enable feature", border=False)
borderless_checkbox = Checkbox(checked=False, label="I agree", border=False)
borderless_button = Button(label="Click Me", color="primary", border=False)
borderless_text = Text(content="Clean text display", border=False, width="100%", align_h="center")

# Group them in a borderless container
Group([
    borderless_slider,
    Group([borderless_input, borderless_select], layout="row"),
    borderless_textarea,
    Group([borderless_toggle, borderless_checkbox], layout="row"),
    borderless_button,
    borderless_text
], layout="col", border=False, gap=3, padding=16)`
    },

    // --- Colored Borders Example ---
    {
        id: "tut-ui-borders-colored",
        type: "markdown",
        content: "### Custom Colored Borders\n\nAdd visual hierarchy and emphasis with custom border colors:"
    },
    {
        id: "tut-demo-borders-colored",
        type: "code",
        content: `from pynote_ui import Button, Slider, Input, Select, Textarea, Toggle, Checkbox, Text, Group

# Each component with a different colored border
red_slider = Slider(value=75, label="Red Slider", border="3px solid #ef4444", grow=1)
blue_input = Input(value="Blue input", placeholder="Type here...", border="2px solid #3b82f6", grow=1)
green_select = Select(
    choices=["Green", "Forest", "Lime"],
    value="Green",
    border="2px solid #22c55e",
    grow=1
)
purple_textarea = Textarea(value="Purple textarea", rows=2, border="2px solid #a855f7", grow=1)
orange_toggle = Toggle(checked=True, label="Orange toggle", border="2px solid #f97316")
pink_checkbox = Checkbox(checked=False, label="Pink checkbox", border="2px solid #ec4899")
yellow_button = Button(label="Yellow Button", border="3px solid #eab308")
cyan_text = Text(content="Cyan text box", border="2px dashed #06b6d4", width="100%", align_h="center")

# Group with indigo border
Group([
    red_slider,
    Group([blue_input, green_select], layout="row"),
    purple_textarea,
    Group([orange_toggle, pink_checkbox], layout="row", align="center"),
    yellow_button,
    cyan_text
], layout="col", border="3px solid #6366f1", label="Colorful Borders", gap=2)`
    },

    // --- Next Steps ---
    {
        id: "tut-ui-next",
        type: "markdown",
        content: `---

<br />

## 🎉 Interactive UI Complete!

You now know how to build reactive interfaces with \`pynote_ui\`. Continue your learning:

<br />

| Next Tutorial | What You'll Learn |
|---------------|-------------------|
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Updated tutorial with all components, colors, sizes, and states |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Create beautiful visualizations with Observable Plot, uPlot, and Frappe |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

<br />

Or go back to **[Quick Start](?open=tutorial)** to review the basics.`
    }
];
