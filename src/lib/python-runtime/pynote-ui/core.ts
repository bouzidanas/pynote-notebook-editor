// Embedded source for pynote_ui/core.py.
export const PYNOTE_UI_CORE_PY = `
import uuid
import json
import sys
from contextvars import ContextVar

# Context variable to track which cell is currently executing (for UI element ownership)
# This is separate from the stream routing contextvar in INIT_CODE, but serves a similar purpose
_current_cell_id = ContextVar("pynote_ui_cell_id", default=None)

# Control character markers for stdout rendering
# Using ASCII control char (STX) that users can't accidentally type
# Self-closing pattern: \\x02TYPE\\x02content\\x02/TYPE\\x02
MARKER_UI_START = "\x02PYNOTE_UI\x02"
MARKER_UI_END = "\x02/PYNOTE_UI\x02"
MARKER_MD_STYLED_START = "\x02PYNOTE_MD_STYLED\x02"
MARKER_MD_STYLED_END = "\x02/PYNOTE_MD_STYLED\x02"
MARKER_MD_PLAIN_START = "\x02PYNOTE_MD_PLAIN\x02"
MARKER_MD_PLAIN_END = "\x02/PYNOTE_MD_PLAIN\x02"

class StateManager:
    _instances = {}
    _instances_by_cell = {}
    _comm_target = None

    @classmethod
    def set_current_cell(cls, cell_id):
        _current_cell_id.set(cell_id)

    @classmethod
    def clear_cell(cls, cell_id):
        if cell_id in cls._instances_by_cell:
            for uid in cls._instances_by_cell[cell_id]:
                if uid in cls._instances:
                    del cls._instances[uid]
            del cls._instances_by_cell[cell_id]

    @classmethod
    def register(cls, instance):
        cell_id = _current_cell_id.get()
        cls._instances[instance.id] = instance
        if cell_id:
            if cell_id not in cls._instances_by_cell:
                cls._instances_by_cell[cell_id] = []
            cls._instances_by_cell[cell_id].append(instance.id)

    @classmethod
    def get(cls, uid):
        return cls._instances.get(uid)
    
    @classmethod
    def update(cls, uid, data):
        instance = cls.get(uid)
        if instance:
            instance.handle_interaction(data)
            return True
        return False
    
    @classmethod
    def register_comm_target(cls, callback):
        cls._comm_target = callback
    
    @classmethod
    def send_update(cls, uid, data):
        if cls._comm_target:
            try:
                cls._comm_target(uid, data)
            except Exception as e:
                print(f"[StateManager] ERROR sending update: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"[StateManager] WARNING: No comm target registered!")

class UIElement:
    def __init__(self, **kwargs):
        self.id = str(uuid.uuid4())
        self.props = kwargs
        self._on_update = None
        self._hidden = kwargs.get('hidden', False)
        # Capture the cell_id at creation time for proper cleanup
        self._cell_id = _current_cell_id.get()
        StateManager.register(self)

    def to_json(self):
        return {
            "id": self.id,
            "type": self.__class__.__name__,
            "props": self.props
        }

    def _repr_mimebundle_(self, include=None, exclude=None):
        return {
            "application/vnd.pynote.ui+json": self.to_json()
        }

    def __str__(self):
        """Return marked string for print() support."""
        payload = json.dumps(self.to_json())
        return f"{MARKER_UI_START}{payload}{MARKER_UI_END}"

    def __repr__(self):
        """Return a readable representation for debugging."""
        return f"<{self.__class__.__name__} id={self.id}>"

    def on_update(self, callback):
        """Register callback. Context is preserved for lazy-component creation."""
        # Store the callback directly - context restoration happens in handle_interaction
        self._on_update = callback

    @property
    def hidden(self):
        """Get visibility state (True = hidden, False = visible)."""
        return self._hidden

    @hidden.setter
    def hidden(self, value):
        """Set visibility state."""
        self._hidden = value
        self.send_update(hidden=value)

    def hide(self):
        """Hide this component (display: none)."""
        self.hidden = True

    def show(self):
        """Show this component."""
        self.hidden = False

    def handle_interaction(self, data):
        """Override in subclasses to handle updates from frontend"""
        if self._on_update:
            # Restore cell context for this callback's execution
            # This allows lazy-loaded components to register to the correct cell
            token = _current_cell_id.set(self._cell_id)
            try:
                self._on_update(data)
            finally:
                _current_cell_id.reset(token)
    
    def send_update(self, **kwargs):
        """Send property updates to the frontend"""
        self.props.update(kwargs)
        StateManager.send_update(self.id, kwargs)

def handle_interaction(uid, data):
    return StateManager.update(uid, data)

def set_current_cell(cell_id):
    StateManager.set_current_cell(cell_id)

def clear_cell(cell_id):
    StateManager.clear_cell(cell_id)

def register_comm_target(callback):
    StateManager.register_comm_target(callback)

def display(*elements, inline=False, gap=1):
    """Display one or more UI elements in the output immediately.
    
    This allows showing UI elements at any point during cell execution,
    not just as the final result.
    
    Args:
        *elements: UI elements to display
        inline: If True, display elements on the same line. Default False (separate lines).
        gap: Spacing between elements. For inline, number of spaces. For separate lines, number of blank lines. Default 1.
    
    Usage:
        slider = Slider(value=50)
        display(slider)  # Shows on its own line
        
        # Multiple elements on separate lines (default):
        display(slider1, slider2, text)
        
        # Multiple elements on the same line:
        display(slider1, slider2, inline=True)
        
        # Custom spacing:
        display(a, b, gap=3)  # 3 blank lines between
        display(a, b, inline=True, gap=4)  # 4 spaces between
    """
    elements = list(elements)
    if not inline and elements:
        elements.insert(0, '')  # Newline at beginning
        elements.append('')     # Newline at end

    for i, element in enumerate(elements):
        if hasattr(element, 'to_json'):
            payload = json.dumps(element.to_json())
            sys.stdout.write(f"{MARKER_UI_START}{payload}{MARKER_UI_END}")
            # Add separator after each element except the last
            if i < len(elements) - 1:
                if inline:
                    sys.stdout.write(" " * gap)  # Horizontal spacing
                else:
                    print("\\n" * gap, end="")  # Vertical spacing (gap blank lines)
            elif not inline:
                print()  # Final newline for non-inline
        else:
            # Fallback for non-UI elements
            print(element)

def print_md(content, styled=True):
    """Print markdown content with full formatting.
    
    Outputs markdown that will be rendered with the same styling as markdown
    cells, including theme colors, typography, and spacing. Supports embedded
    UI elements via f-strings.
    
    Args:
        content: Markdown string (can be an f-string with UI elements)
        styled: If True (default), renders with prose styling matching markdown cells.
                If False, renders with monospace stdout-like appearance.
    
    Usage:
        print_md("# Hello World")
        print_md("**Bold** and *italic* text")
        
        # With UI elements:
        slider = Slider(value=50)
        print_md(f"## Controls\\n\\nAdjust value: {slider}\\n\\n**Done!**")
        
        # Plain style (monospace):
        print_md("# Results", styled=False)
    """
    if styled:
        sys.stdout.write(f"{MARKER_MD_STYLED_START}{content}{MARKER_MD_STYLED_END}")
    else:
        sys.stdout.write(f"{MARKER_MD_PLAIN_START}{content}{MARKER_MD_PLAIN_END}")
`;
