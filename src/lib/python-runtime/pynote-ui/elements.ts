// Embedded source for pynote_ui/elements.py.
export const PYNOTE_UI_ELEMENTS_PY = `
from .core import UIElement

class Slider(UIElement):
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider", size=None,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, color=None, hidden=False):
        self._value = value
        self._size = size
        self.min = min
        self.max = max
        self.step = step
        self.label = label
        super().__init__(
            value=value, min=min, max=max, step=step, label=label, size=size,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, color=color, hidden=hidden
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

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self

class Text(UIElement):
    def __init__(self, content="", size=None, width=None, height=None, grow=None, shrink=None, force_dimensions=False, align_h="left", align_v="top", border=True, background=True, color=None, hidden=False, markdown=False):
        self._content = content
        self._size = size
        self._markdown = markdown
        super().__init__(
            content=content, size=size,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions,
            align_h=align_h, align_v=align_v, border=border, background=background, color=color, hidden=hidden,
            markdown=markdown
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

    @property
    def markdown(self):
        return self._markdown

    @markdown.setter
    def markdown(self, value):
        self._markdown = value
        self.send_update(markdown=value)

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self

class Group(UIElement):
    def __init__(self, children, layout="col", label=None, width="full", height=None, align="center", grow=None, shrink=None, border=False, background=True, padding=None, gap=None, overflow=None, force_dimensions=False, hidden=False, wrap=False):
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
            force_dimensions=force_dimensions,
            hidden=hidden,
            wrap=wrap
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

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Form(UIElement):
    def __init__(self, children, layout="col", label=None, width="full", height=None, align="center", grow=None, shrink=None, border=True, background=True, padding=None, gap=None, overflow=None, force_dimensions=False, hidden=False):
        self.children = children
        self._value = {}  # Dictionary of child values
        
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
            force_dimensions=force_dimensions,
            hidden=hidden
        )

    @property
    def value(self):
        """Get the collected form values (populated after submit)."""
        return self._value

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

    def handle_interaction(self, data):
        """Handle form submission."""
        if data.get("submitted"):
            # Update internal value dictionary
            self._value = data.get("values", {})
        super().handle_interaction(data)

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Button(UIElement):
    def __init__(self, label="Button", button_type=None, color=None, style=None, size=None, disabled=False, loading=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False,
                 align_h="center", align_v="center", border=True, background=True, hidden=False):
        self._label = label
        self._disabled = disabled
        self._loading = loading
        self._size = size
        super().__init__(
            label=label, button_type=button_type, color=color, style=style, size=size, disabled=disabled, loading=loading,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions,
            align_h=align_h, align_v=align_v, border=border, background=background, hidden=hidden
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
            pass
        super().handle_interaction(data)

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Select(UIElement):
    def __init__(self, choices=None, value=None, placeholder="Select an option", color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, hidden=False, clearable=False):
        if choices is None:
            choices = []
        self._value = value
        self._choices = choices
        self._disabled = disabled
        self._size = size
        super().__init__(
            options=choices, value=value, placeholder=placeholder, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, hidden=hidden, clearable=clearable
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

    @property
    def choices(self):
        return self._choices

    @choices.setter
    def choices(self, new_choices):
        self._choices = new_choices
        self.send_update(options=new_choices)

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

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Input(UIElement):
    def __init__(self, value="", placeholder="", input_type="text", color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, hidden=False):
        self._value = value
        self._disabled = disabled
        self._size = size
        super().__init__(
            value=value, placeholder=placeholder, input_type=input_type, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, hidden=hidden
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

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Textarea(UIElement):
    def __init__(self, value="", placeholder="", rows=4, color=None, size=None, disabled=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, hidden=False):
        self._value = value
        self._disabled = disabled
        self._size = size
        super().__init__(
            value=value, placeholder=placeholder, rows=rows, color=color, size=size, disabled=disabled,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, hidden=hidden
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

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Toggle(UIElement):
    def __init__(self, checked=False, label=None, color=None, size=None, disabled=False,
                 align=None, spaced=False, reverse=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, hidden=False):
        self._checked = checked
        self._disabled = disabled
        self._size = size
        super().__init__(
            checked=checked, label=label, color=color, size=size, disabled=disabled,
            align=align, spaced=spaced, reverse=reverse,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, hidden=hidden
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
        # Handle both "checked" (normal) and "value" (from Form submission)
        if "checked" in data:
            self._checked = data["checked"]
            self.props["checked"] = self._checked
        elif "value" in data:
            self._checked = data["value"]
            self.props["checked"] = self._checked
        super().handle_interaction(data)

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self


class Checkbox(UIElement):
    def __init__(self, checked=False, label=None, color="primary", size=None, disabled=False,
                 align=None, spaced=False, reverse=False,
                 width=None, height=None, grow=None, shrink=None, force_dimensions=False, border=True, background=True, hidden=False):
        self._checked = checked
        self._disabled = disabled
        self._size = size
        super().__init__(
            checked=checked, label=label, color=color, size=size, disabled=disabled,
            align=align, spaced=spaced, reverse=reverse,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions, border=border, background=background, hidden=hidden
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
        # Handle both "checked" (normal) and "value" (from Form submission)
        if "checked" in data:
            self._checked = data["checked"]
            self.props["checked"] = self._checked
        elif "value" in data:
            self._checked = data["value"]
            self.props["checked"] = self._checked
        super().handle_interaction(data)

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self

class Upload(UIElement):
    def __init__(self, accept=None, max_size=None, label="Upload", dir=None, color=None, size=None,
                 disabled=False, width=None, height=None, grow=None, shrink=None,
                 force_dimensions=False, border=True, background=True, hidden=False):
        self._files = {}
        self._workspace_paths = {}
        self._disabled = disabled
        self._size = size
        super().__init__(
            accept=accept, max_size=max_size, label=label, dir=dir, color=color, size=size,
            disabled=disabled, width=width, height=height, grow=grow, shrink=shrink,
            force_dimensions=force_dimensions, border=border, background=background, hidden=hidden
        )

    @property
    def files(self):
        return dict(self._files)

    @property
    def workspace_paths(self):
        return dict(self._workspace_paths)

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

    def _safe_workspace_name(self, name):
        name = str(name or "unknown").replace("\\\\", "/").split("/")[-1].strip()
        return name or "unknown"

    def _workspace_dir(self):
        from pathlib import Path

        raw = str(self.props.get("dir") or "/workspace").strip().replace("\\\\", "/")
        if not raw:
            raw = "/workspace"
        if not raw.startswith("/"):
            raw = f"/workspace/{raw}"

        parts = []
        for segment in raw.split("/"):
            if not segment or segment == ".":
                continue
            if segment == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(segment)

        normalized = "/" + "/".join(parts)
        if normalized != "/workspace" and not normalized.startswith("/workspace/"):
            raise ValueError("Upload destination must stay inside /workspace")

        path = Path(normalized)
        if not path.exists() or not path.is_dir():
            raise FileNotFoundError(f"Upload destination does not exist: {normalized}")
        return path

    def _workspace_path_for(self, key):
        safe_name = self._safe_workspace_name(key)
        return self._workspace_dir() / safe_name

    def _persist_to_workspace(self, key, raw):
        path = self._workspace_path_for(key)
        path.write_bytes(raw)
        self._workspace_paths[key] = str(path)

    def _remove_from_workspace(self, key):
        from pathlib import Path

        path_str = self._workspace_paths.pop(key, None)
        if not path_str:
            path_str = str(self._workspace_path_for(key))

        path = Path(path_str)
        if path.exists() and path.is_file():
            path.unlink()

    def handle_interaction(self, data):
        import base64
        action = data.get("action") if hasattr(data, "get") else None

        if action == "upload":
            status = {}
            files_list = data.get("files", [])
            if hasattr(files_list, "to_py"):
                files_list = files_list.to_py()
            for f in files_list:
                if hasattr(f, "to_py"):
                    f = f.to_py()
                key = f.get("key", f.get("name", "unknown"))
                try:
                    raw = base64.b64decode(f.get("data_base64", ""))
                    max_size = self.props.get("max_size")
                    if max_size and len(raw) > max_size:
                        status[key] = f"error:File exceeds max size ({max_size} bytes)"
                    else:
                        self._files[key] = raw
                        self._persist_to_workspace(key, raw)
                        status[key] = "success"
                except Exception as e:
                    status[key] = f"error:{e}"
            self.send_update(upload_status=status)
            super().handle_interaction(data)

        elif action == "remove":
            key = data.get("key", "")
            self._files.pop(key, None)
            self._remove_from_workspace(key)
            self.send_update(upload_status={key: "removed"})
            super().handle_interaction(data)

        elif data.get("value") is not None:
            value = data.get("value")
            if hasattr(value, "to_py"):
                value = value.to_py()
            status = {}
            if isinstance(value, list):
                for f in value:
                    if hasattr(f, "to_py"):
                        f = f.to_py()
                    key = f.get("key", f.get("name", "unknown"))
                    try:
                        raw = base64.b64decode(f.get("data_base64", ""))
                        max_size = self.props.get("max_size")
                        if max_size and len(raw) > max_size:
                            status[key] = f"error:File exceeds max size ({max_size} bytes)"
                        else:
                            self._files[key] = raw
                            self._persist_to_workspace(key, raw)
                            status[key] = "success"
                    except Exception as e:
                        status[key] = f"error:{e}"
            self.send_update(form_upload_status=status)
            super().handle_interaction(data)

        else:
            super().handle_interaction(data)

    def options(self, **kwargs):
        """Update component properties after initialization"""
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.send_update(**kwargs)
        return self
`;
