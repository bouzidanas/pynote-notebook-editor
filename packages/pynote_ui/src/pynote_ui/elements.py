from .core import UIElement

class Slider(UIElement):
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider", width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._value = value
        self.min = min
        self.max = max
        self.step = step
        self.label = label
        super().__init__(
            value=value, min=min, max=max, step=step, label=label,
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
            self._value = type(self._value)(data["value"])
            # Update internal props to match current state
            self.props["value"] = self._value
        super().handle_interaction(data)

class Text(UIElement):
    def __init__(self, content="", width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._content = content
        super().__init__(
            content=content,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
        )

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = value
        self.send_update(content=value)

class Group(UIElement):
    def __init__(self, children, layout="col", label=None, width="full", height=None, align="center", grow=None, shrink=None, border=False, padding=None, force_dimensions=False):
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


