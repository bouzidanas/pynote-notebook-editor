from .core import UIElement

class Slider(UIElement):
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider"):
        self._value = value
        self.min = min
        self.max = max
        self.step = step
        self.label = label
        super().__init__(value=value, min=min, max=max, step=step, label=label)

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
    def __init__(self, content=""):
        self._content = content
        super().__init__(content=content)

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = value
        self.send_update(content=value)

class Group(UIElement):
    def __init__(self, children, layout="col", label=None, width="full", align="center", basis=None, shrink=None, grow=None, fill=True):
        self.children = children
        
        # Validation helper
        def validate_list_arg(arg, name):
            if arg:
                if not isinstance(arg, list):
                    print(f"Warning: {name} must be a list.")
                    return None
                if len(arg) > len(children):
                    print(f"Warning: {name} list is longer than children list. Extra values will be ignored.")
            return arg

        basis = validate_list_arg(basis, "basis")
        shrink = validate_list_arg(shrink, "shrink")
        grow = validate_list_arg(grow, "grow")

        super().__init__(
            children=[c.to_json() for c in children], 
            layout=layout, 
            label=label, 
            width=width, 
            align=align,
            basis=basis,
            shrink=shrink,
            grow=grow,
            fill=fill
        )

    @property
    def width(self):
        return self.props.get("width")
    
    @width.setter
    def width(self, value):
        self.send_update(width=value)

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
    def fill(self):
        return self.props.get("fill")
    
    @fill.setter
    def fill(self, value):
        self.send_update(fill=value)


