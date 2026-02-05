from .core import UIElement

class Slider(UIElement):
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider", size=None,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._value = value
        self.min = min
        self.max = max
        self.step = step
        self.label = label
        super().__init__(
            value=value, min=min, max=max, step=step, label=label, size=size,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

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
    def __init__(self, content="", size=None, width=None, height=None, grow=None, shrink=None, force_dimensions=False, align_h="left", align_v="top"):
        self._content = content
        super().__init__(
            content=content, size=size,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions,
            align_h=align_h, align_v=align_v
        )

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = value
        self.send_update(content=value)

class Group(UIElement):
    def __init__(self, children, layout="col", label=None, width="full", height=None, align="center", grow=None, shrink=None, border=False, padding=None, gap=None, overflow=None, force_dimensions=False):
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
    def __init__(self, label="Button", color=None, style=None, size=None, disabled=False, loading=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._label = label
        self._disabled = disabled
        self._loading = loading
        super().__init__(
            label=label, color=color, style=style, size=size, disabled=disabled, loading=loading,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
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

    def handle_interaction(self, data):
        if data.get("clicked"):
            # Clicked state is passed to callback
            pass
        super().handle_interaction(data)


class Select(UIElement):
    def __init__(self, options=None, value=None, placeholder="Select an option", color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        if options is None:
            options = []
        self._value = value
        self._options = options
        self._disabled = disabled
        super().__init__(
            options=options, value=value, placeholder=placeholder, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
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

    def handle_interaction(self, data):
        if "value" in data:
            self._value = data["value"]
            self.props["value"] = self._value
        super().handle_interaction(data)


class Input(UIElement):
    def __init__(self, value="", placeholder="", input_type="text", color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._value = value
        self._disabled = disabled
        super().__init__(
            value=value, placeholder=placeholder, input_type=input_type, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
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

    def handle_interaction(self, data):
        if "value" in data:
            self._value = data["value"]
            self.props["value"] = self._value
        super().handle_interaction(data)


class Textarea(UIElement):
    def __init__(self, value="", placeholder="", rows=4, color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._value = value
        self._disabled = disabled
        super().__init__(
            value=value, placeholder=placeholder, rows=rows, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
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

    def handle_interaction(self, data):
        if "value" in data:
            self._value = data["value"]
            self.props["value"] = self._value
        super().handle_interaction(data)


class Toggle(UIElement):
    def __init__(self, checked=False, label=None, color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._checked = checked
        self._disabled = disabled
        super().__init__(
            checked=checked, label=label, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
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

    def handle_interaction(self, data):
        if "checked" in data:
            self._checked = data["checked"]
            self.props["checked"] = self._checked
        super().handle_interaction(data)


class Checkbox(UIElement):
    def __init__(self, checked=False, label=None, color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._checked = checked
        self._disabled = disabled
        super().__init__(
            checked=checked, label=label, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
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

    def handle_interaction(self, data):
        if "checked" in data:
            self._checked = data["checked"]
            self.props["checked"] = self._checked
        super().handle_interaction(data)