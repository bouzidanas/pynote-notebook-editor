from .core import UIElement

class Slider(UIElement):
    """Interactive slider for numeric input within a range.
    
    A draggable slider component that lets users select numeric values. Updates
    in real-time as the user drags the handle. Great for adjusting parameters,
    settings, and continuous values.
    
    Args:
        value: Initial/current value (default: 0)
        min: Minimum value (default: 0)
        max: Maximum value (default: 100)
        step: Increment step size (default: 1)
        label: Label text displayed above slider
        size: Size preset ('xs', 'sm', 'md', 'lg')
        color: Color theme ('primary', 'secondary', 'accent', 'success', 'warning', 'error')
        width, height: CSS dimension strings ('100px', '50%')
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        value: Get/set current value (triggers update when set)
        size: Get/set size preset
    
    Example:
        volume = Slider(value=75, min=0, max=100, label="Volume")
        print(volume.value)  # 75
        volume.value = 50    # Updates UI immediately
    """
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider", size=None,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, color=None):
        self._value = value
        self._size = size
        self.min = min
        self.max = max
        self.step = step
        self.label = label
        super().__init__(
            value=value, min=min, max=max, step=step, label=label, size=size,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, color=color
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if "value" in data:
            # Use float if step is a float, otherwise preserve original type
            if isinstance(self.step, float):
                self._value = float(data["value"])
            else:
                self._value = type(self._value)(data["value"])
            # Update internal props to match current state
            self.props["value"] = self._value
        super().handle_interaction(data)

class Text(UIElement):
    """Display dynamic text content that can be updated programmatically.
    
    A simple text display component for showing strings, formatted text, or dynamic
    content that changes based on user interactions or computations. Supports alignment
    and styling options.
    
    Args:
        content: Text string to display (can be updated dynamically)
        size: Size preset ('xs', 'sm', 'md', 'lg')
        color: Color theme ('primary', 'secondary', 'accent', etc.)
        align_h: Horizontal alignment ('left', 'center', 'right')
        align_v: Vertical alignment ('top', 'center', 'bottom')
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
        hidden: Start hidden (use .show() to reveal)
    
    Properties:
        content: Get/set displayed text
        size: Get/set size preset
    
    Example:
        status = Text(content="Ready", color="success")
        status.content = "Processing..."  # Updates immediately
        status.hide()  # Hide component
        status.show()  # Show component
    """
    def __init__(self, content="", size=None, width=None, height=None, grow=None, shrink=None, force_dimensions=False, align_h="left", align_v="top", border=True, background=True, color=None):
        self._content = content
        self._size = size
        super().__init__(
            content=content, size=size,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions,
            align_h=align_h, align_v=align_v, border=border, background=background, color=color
        )

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = value
        self.send_update(content=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

class Group(UIElement):
    """Layout container for arranging multiple UI components.
    
    Groups multiple components together in rows or columns with flexible layout options.
    Perfect for creating forms, control panels, and complex UI arrangements. Supports
    flexbox-style alignment and spacing.
    
    Args:
        children: List of UI components to group together
        layout: Layout direction ('row' or 'col', default: 'col')
        label: Optional label shown above the group
        width: Width ('full', '100px', '50%', default: 'full')
        height: Height (CSS dimension string)
        align: Alignment ('start', 'center', 'end', 'stretch')
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: False)
        padding: Internal padding (0-4)
        gap: Spacing between children (0-4)
        overflow: Overflow behavior ('scroll', 'hidden', 'auto')
    
    Properties:
        width, height, align, layout, label: All dynamically updatable
        grow, shrink, border, padding, gap, overflow: All dynamically updatable
    
    Example:
        # Horizontal group of inputs
        name = Input(placeholder="Name")
        email = Input(placeholder="Email")
        row = Group([name, email], layout="row", gap=2)
        
        # Vertical group with border
        controls = Group([slider1, slider2, button], 
                        layout="col", border=True, label="Controls")
    """
    def __init__(self, children, layout="col", label=None, width="full", height=None, align="center", grow=None, shrink=None, border=False, background=True, padding=None, gap=None, overflow=None, force_dimensions=False):
        self.children = children

        super().__init__(
            children=[c.to_json() for c in children], 
            layout=layout, 
            label=label, 
            width=width,
            height=height,
            align=align,
            grow=grow,
            shrink=shrink,
            border=border,
            background=background,
            padding=padding,
            gap=gap,
            overflow=overflow,
            force_dimensions=force_dimensions
        )

    @property
    def width(self):
        return self.props.get("width")
    
    @width.setter
    def width(self, value):
        self.send_update(width=value)

    @property
    def height(self):
        return self.props.get("height")
    
    @height.setter
    def height(self, value):
        self.send_update(height=value)

    @property
    def align(self):
        return self.props.get("align")
    
    @align.setter
    def align(self, value):
        self.send_update(align=value)

    @property
    def layout(self):
        return self.props.get("layout")
    
    @layout.setter
    def layout(self, value):
        self.send_update(layout=value)
        
    @property
    def label(self):
        return self.props.get("label")
    
    @label.setter
    def label(self, value):
        self.send_update(label=value)

    @property
    def grow(self):
        return self.props.get("grow")
    
    @grow.setter
    def grow(self, value):
        self.send_update(grow=value)

    @property
    def shrink(self):
        return self.props.get("shrink")
    
    @shrink.setter
    def shrink(self, value):
        self.send_update(shrink=value)

    @property
    def border(self):
        return self.props.get("border")
    
    @border.setter
    def border(self, value):
        self.send_update(border=value)

    @property
    def padding(self):
        return self.props.get("padding")
    
    @padding.setter
    def padding(self, value):
        self.send_update(padding=value)

    @property
    def gap(self):
        return self.props.get("gap")
    
    @gap.setter
    def gap(self, value):
        self.send_update(gap=value)

    @property
    def overflow(self):
        return self.props.get("overflow")
    
    @overflow.setter
    def overflow(self, value):
        self.send_update(overflow=value)


class Button(UIElement):
    """Clickable button with customizable styling and loading states.
    
    Interactive button component that triggers callbacks when clicked. Supports
    disabled and loading states for async operations. Use button_type='submit'
    inside Form components for form submission.
    
    Args:
        label: Button text
        color: Color theme ('primary', 'secondary', 'accent', 'success', 'warning', 'error')
        style: Style variant ('outline', 'ghost', 'link')
        size: Size preset ('xs', 'sm', 'md', 'lg')
        disabled: Disabled state (default: False)
        loading: Show loading spinner (default: False)
        button_type: Button type ('button' or 'submit' for forms)
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        label: Get/set button text
        disabled: Get/set disabled state
        loading: Get/set loading state
        size: Get/set size preset
    
    Example:
        def handle_click(data):
            print("Button clicked!")
            btn.loading = True  # Show loading state
        
        btn = Button(label="Submit", color="primary")
        btn.on_update(handle_click)
    """
    def __init__(self, label="Button", color=None, style=None, size=None, disabled=False, loading=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True):
        self._label = label
        self._disabled = disabled
        self._loading = loading
        self._size = size
        super().__init__(
            label=label, color=color, style=style, size=size, disabled=disabled, loading=loading,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background
        )

    @property
    def label(self):
        return self._label

    @label.setter
    def label(self, value):
        self._label = value
        self.send_update(label=value)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    @property
    def loading(self):
        return self._loading

    @loading.setter
    def loading(self, value):
        self._loading = value
        self.send_update(loading=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if data.get("clicked"):
            # Clicked state is passed to callback
            pass
        super().handle_interaction(data)


class Select(UIElement):
    """Dropdown selection menu with multiple options.
    
    A dropdown component for selecting from a list of options. Updates immediately
    when user makes a selection. Options can be strings or dicts with label/value pairs.
    
    Args:
        options: List of options (strings or dicts like [{'label': 'A', 'value': 1}])
        value: Initially selected value
        placeholder: Placeholder text when nothing selected
        color: Color theme ('primary', 'secondary', 'accent', etc.)
        size: Size preset ('xs', 'sm', 'md', 'lg')
        disabled: Disabled state (default: False)
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        value: Get/set selected value
        options: Get/set available options
        disabled: Get/set disabled state
        size: Get/set size preset
    
    Example:
        country = Select(options=["USA", "UK", "Canada"], placeholder="Country")
        print(country.value)  # Selected value
        country.value = "UK"  # Set selection programmatically
    """
    def __init__(self, options=None, value=None, placeholder="Select an option", color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True):
        if options is None:
            options = []
        self._value = value
        self._options = options
        self._disabled = disabled
        self._size = size
        super().__init__(
            options=options, value=value, placeholder=placeholder, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

    @property
    def options(self):
        return self._options

    @options.setter
    def options(self, new_options):
        self._options = new_options
        self.send_update(options=new_options)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if "value" in data:
            self._value = data["value"]
            self.props["value"] = self._value
        super().handle_interaction(data)


class Input(UIElement):
    """Single-line text input field with validation support.
    
    A text input component for capturing short text, emails, passwords, numbers, etc.
    Supports HTML5 input types for validation. Updates in real-time as user types
    (unless inside a Form, which defers updates until submit).
    
    Args:
        value: Initial/current value
        placeholder: Placeholder text
        input_type: HTML input type ('text', 'email', 'password', 'number', 'tel', 'url')
        color: Color theme
        size: Size preset ('xs', 'sm', 'md', 'lg')
        disabled: Disabled state (default: False)
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        value: Get/set input value
        disabled: Get/set disabled state
        size: Get/set size preset
    
    Example:
        email = Input(placeholder="Email", input_type="email")
        print(email.value)  # Get current value
        email.value = "test@example.com"  # Set value programmatically
    """
    def __init__(self, value="", placeholder="", input_type="text", color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True):
        self._value = value
        self._disabled = disabled
        self._size = size
        super().__init__(
            value=value, placeholder=placeholder, input_type=input_type, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if "value" in data:
            self._value = data["value"]
            self.props["value"] = self._value
        super().handle_interaction(data)


class Textarea(UIElement):
    """Multi-line text input for longer content.
    
    A textarea component for capturing multi-line text like comments, descriptions,
    or code snippets. Auto-resizes based on rows parameter. Updates in real-time
    (unless inside a Form).
    
    Args:
        value: Initial/current value
        placeholder: Placeholder text
        rows: Number of visible text rows (default: 4)
        color: Color theme
        size: Size preset ('xs', 'sm', 'md', 'lg')
        disabled: Disabled state (default: False)
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        value: Get/set textarea value
        disabled: Get/set disabled state
        size: Get/set size preset
    
    Example:
        bio = Textarea(placeholder="Tell us about yourself...", rows=5)
        print(bio.value)  # Get current value
        bio.value = "New content"  # Set value programmatically
    """
    def __init__(self, value="", placeholder="", rows=4, color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True):
        self._value = value
        self._disabled = disabled
        self._size = size
        super().__init__(
            value=value, placeholder=placeholder, rows=rows, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if "value" in data:
            self._value = data["value"]
            self.props["value"] = self._value
        super().handle_interaction(data)


class Toggle(UIElement):
    """Toggle switch for boolean on/off states.
    
    An animated toggle switch component for binary choices. Updates immediately
    when clicked. Great for settings and feature flags.
    
    Args:
        checked: Initial checked state (default: False)
        label: Label text displayed next to toggle
        color: Color theme ('primary', 'secondary', 'accent', 'success', 'warning', 'error')
        size: Size preset ('xs', 'sm', 'md', 'lg')
        disabled: Disabled state (default: False)
        align: Horizontal alignment ('left', 'center', 'right') - only affects layout when spaced=False
        spaced: Space-between layout (toggle and label at opposite ends) (default: False)
        reverse: Reverse element order (label to right of toggle) (default: False)
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        checked: Get/set checked state
        disabled: Get/set disabled state
        size: Get/set size preset
    
    Example:
        notifications = Toggle(label="Enable notifications", checked=True)
        print(notifications.checked)  # True
        notifications.checked = False  # Programmatically update
    """
    def __init__(self, checked=False, label=None, color=None, size=None, disabled=False,
                 align=None, spaced=False, reverse=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True):
        self._checked = checked
        self._disabled = disabled
        self._size = size
        super().__init__(
            checked=checked, label=label, color=color, size=size, disabled=disabled,
            align=align, spaced=spaced, reverse=reverse,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background
        )

    @property
    def checked(self):
        return self._checked

    @checked.setter
    def checked(self, value):
        self._checked = value
        self.send_update(checked=value)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if "checked" in data:
            self._checked = data["checked"]
            self.props["checked"] = self._checked
        super().handle_interaction(data)


class Checkbox(UIElement):
    """Checkbox for boolean selections and multi-select lists.
    
    A checkbox component for binary selections or use in lists of options.
    Updates immediately when clicked. Often used in forms for terms acceptance
    or multi-select scenarios.
    
    Args:
        checked: Initial checked state (default: False)
        label: Label text displayed next to checkbox
        color: Color theme ('primary', 'secondary', 'accent', 'success', 'warning', 'error')
        size: Size preset ('xs', 'sm', 'md', 'lg')
        disabled: Disabled state (default: False)
        align: Horizontal alignment ('left', 'center', 'right') - only affects layout when spaced=False
        spaced: Space-between layout (checkbox and label at opposite ends) (default: False)
        reverse: Reverse element order (label to right of checkbox) (default: False)
        width, height: CSS dimension strings
        grow, shrink: Flexbox grow/shrink factors
        border: Show border (default: True)
    
    Properties:
        checked: Get/set checked state
        disabled: Get/set disabled state
        size: Get/set size preset
    
    Example:
        terms = Checkbox(label="I accept terms of service")
        print(terms.checked)  # False
        terms.checked = True  # Programmatically check
    """
    def __init__(self, checked=False, label=None, color="primary", size=None, disabled=False,
                 align=None, spaced=False, reverse=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True):
        self._checked = checked
        self._disabled = disabled
        self._size = size
        super().__init__(
            checked=checked, label=label, color=color, size=size, disabled=disabled,
            align=align, spaced=spaced, reverse=reverse,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background
        )

    @property
    def checked(self):
        return self._checked

    @checked.setter
    def checked(self, value):
        self._checked = value
        self.send_update(checked=value)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, new_size):
        self._size = new_size
        self.send_update(size=new_size)

    def handle_interaction(self, data):
        if "checked" in data:
            self._checked = data["checked"]
            self.props["checked"] = self._checked
        super().handle_interaction(data)

class Form(UIElement):
    """Form container that defers input updates until submission.
    
    A specialized Group-like container that batches all input updates until a submit
    button is clicked. Perfect for traditional forms where you want to collect all
    data at once rather than processing each keystroke. All form inputs become
    available via individual component.value properties or via form.value dict.
    
    Key behavior:
    - Input/Textarea/Select changes are NOT sent to Python until submit
    - After submit, all component values are synchronized
    - Access via individual components (name_input.value) or form.value dict
    - Submit button must have button_type="submit"
    
    Args:
        children: List of UI components (inputs, buttons, etc.)
        label: Optional label shown above the form
        width: Width ('full', '100px', '50%', default: 'full')
        height: Height (CSS dimension string)
        border: Show border (default: True)
        padding: Internal padding (0-4)
        gap: Spacing between children (0-4, default: 2)
    
    Properties:
        value: Dictionary of all form values (readonly, updated after submit)
    
    Example:
        # Create form inputs
        name = Input(placeholder="Name")
        email = Input(placeholder="Email", input_type="email")
        submit = Button(label="Submit", button_type="submit", color="primary")
        
        # Handle submission
        def on_submit(data):
            print(f"Name: {name.value}, Email: {email.value}")
            # Or access via form.value dict
            print(f"Form data: {contact_form.value}")
        
        submit.on_update(on_submit)
        
        # Create form
        contact_form = Form([name, email, submit], 
                           label="Contact Form", border=True)
    """
    def __init__(self, children, label=None, width="full", height=None, border=True, background=True, padding=None, gap=2):
        self.children = children

        super().__init__(
            children=[c.to_json() for c in children], 
            label=label, 
            width=width,
            height=height,
            border=border,
            background=background,
            padding=padding,
            gap=gap
        )

    @property
    def value(self):
        """Get dictionary of all form values (updated after submit)."""
        result = {}
        for child in self.children:
            # Skip non-input components
            if hasattr(child, 'value'):
                # Use component ID or a sanitized name as key
                key = getattr(child, 'placeholder', child.__class__.__name__.lower())
                result[key] = child.value
        return result
