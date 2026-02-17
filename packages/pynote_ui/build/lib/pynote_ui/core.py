import uuid
import json
import sys

# Control character markers for stdout UI rendering
# Self-closing pattern: \x02TYPE\x02content\x02/TYPE\x02
MARKER_UI_START = "\x02PYNOTE_UI\x02"
MARKER_UI_END = "\x02/PYNOTE_UI\x02"

# Markdown output markers (self-closing)
MARKER_MD_STYLED_START = "\x02PYNOTE_MD_STYLED\x02"
MARKER_MD_STYLED_END = "\x02/PYNOTE_MD_STYLED\x02"
MARKER_MD_PLAIN_START = "\x02PYNOTE_MD_PLAIN\x02"
MARKER_MD_PLAIN_END = "\x02/PYNOTE_MD_PLAIN\x02"

class StateManager:
    """Internal state management for UI components (do not use directly).
    
    Tracks all active UI components, their lifecycle, and handles communication
    between Python and the frontend. Components are automatically registered
    when created and cleaned up when cells are re-executed.
    """
    _instances = {}
    _instances_by_cell = {}
    _current_cell_id = None
    _comm_target = None

    @classmethod
    def set_current_cell(cls, cell_id):
        """Set the currently executing cell ID for component tracking."""
        print(f"[StateManager] set_current_cell: {cell_id}")
        cls._current_cell_id = cell_id

    @classmethod
    def clear_cell(cls, cell_id):
        """Clear all components associated with a cell (called when cell is re-run)."""
        print(f"[StateManager] clear_cell: {cell_id}")
        if cell_id in cls._instances_by_cell:
            count = len(cls._instances_by_cell[cell_id])
            print(f"[StateManager] Clearing {count} components from cell {cell_id}")
            for uid in cls._instances_by_cell[cell_id]:
                if uid in cls._instances:
                    del cls._instances[uid]
            del cls._instances_by_cell[cell_id]

    @classmethod
    def register(cls, instance):
        """Register a component instance with the state manager."""
        print(f"[StateManager] Registering {instance.__class__.__name__} {instance.id[:8]} to cell {cls._current_cell_id}")
        cls._instances[instance.id] = instance
        if cls._current_cell_id:
            if cls._current_cell_id not in cls._instances_by_cell:
                cls._instances_by_cell[cls._current_cell_id] = []
            cls._instances_by_cell[cls._current_cell_id].append(instance.id)

    @classmethod
    def get(cls, uid):
        """Get a component instance by its unique ID."""
        return cls._instances.get(uid)
    
    @classmethod
    def update(cls, uid, data):
        """Handle interaction data from frontend for a component."""
        instance = cls.get(uid)
        if instance:
            instance.handle_interaction(data)
            return True
        else:
            print(f"[StateManager] WARNING: Interaction for unknown component {uid[:8]}")
            print(f"[StateManager] Known components: {list(cls._instances.keys())[:5]}")
        return False
    
    @classmethod
    def register_comm_target(cls, callback):
        """Register the communication callback for sending updates to frontend."""
        cls._comm_target = callback
    
    @classmethod
    def send_update(cls, uid, data):
        """Send component state updates to the frontend."""
        print(f"[StateManager] send_update called: uid={uid[:8]}, data={data}")
        if cls._comm_target:
            try:
                cls._comm_target(uid, data)
                print(f"[StateManager] Update sent successfully")
            except Exception as e:
                print(f"[StateManager] ERROR sending update: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"[StateManager] WARNING: No comm target registered!")

class UIElement:
    """Base class for all interactive UI components.
    
    UIElement provides the foundation for all UI components with automatic
    state synchronization, event handling, and lifecycle management. Component
    state is automatically tracked and updated in real-time as users interact.
    
    All UI components inherit from this class and share common functionality:
    - Automatic registration and cleanup
    - Real-time bidirectional updates
    - Event callbacks via on_update()
    - Property getters/setters for reactive updates
    
    Subclasses should implement handle_interaction() to process frontend events.
    """
    def __init__(self, **kwargs):
        """Initialize a UI component with properties.
        
        Args:
            **kwargs: Component-specific properties (varies by component type)
        """
        self.id = str(uuid.uuid4())
        self.props = kwargs
        self._on_update = None
        self._auto_displayed = False
        StateManager.register(self)

    def to_json(self):
        """Serialize component to JSON for frontend rendering."""
        return {
            "id": self.id,
            "type": self.__class__.__name__,
            "props": self.props
        }

    def _repr_mimebundle_(self, include=None, exclude=None):
        """IPython display protocol for rich output.
        
        Returns empty dict if the element was already auto-displayed via stdout,
        preventing duplicate rendering when used as the last expression in a cell.
        """
        if self._auto_displayed:
            return {}
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
        """Register a callback function to be called when component is interacted with.
        
        Args:
            callback: Function that receives interaction data dict
        
        Example:
            def handle_click(data):
                print(f"Button clicked: {data}")
            
            btn = Button(label="Click me")
            btn.on_update(handle_click)
        """
        self._on_update = callback

    def handle_interaction(self, data):
        """Handle interaction events from frontend. Override in subclasses."""
        if self._on_update:
            self._on_update(data)
    
    def send_update(self, **kwargs):
        """Send property updates to the frontend for real-time UI refresh.
        
        Args:
            **kwargs: Properties to update in the frontend
        """
        self.props.update(kwargs)
        StateManager.send_update(self.id, kwargs)
    
    def hide(self):
        """Hide this component (set hidden=True)."""
        self.send_update(hidden=True)
    
    def show(self):
        """Show this component (set hidden=False)."""
        self.send_update(hidden=False)

def handle_interaction(uid, data):
    """Internal function to route interactions to components (do not call directly)."""
    return StateManager.update(uid, data)

def set_current_cell(cell_id):
    """Internal function to set current cell context (do not call directly)."""
    StateManager.set_current_cell(cell_id)

def clear_cell(cell_id):
    """Internal function to clear cell components (do not call directly)."""
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
                    for _ in range(gap):
                        print()  # Vertical spacing (gap blank lines)
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
        print_md(f"## Controls\n\nAdjust value: {slider}\n\n**Done!**")
        
        # Plain style (monospace):
        print_md("# Results", styled=False)
    """
    if styled:
        sys.stdout.write(f"{MARKER_MD_STYLED_START}{content}{MARKER_MD_STYLED_END}")
    else:
        sys.stdout.write(f"{MARKER_MD_PLAIN_START}{content}{MARKER_MD_PLAIN_END}")
