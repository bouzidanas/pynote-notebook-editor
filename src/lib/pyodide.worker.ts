// @ts-ignore
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs";

let pyodide: any = null;

const INIT_CODE = `
import sys
import io
import contextvars
from pyodide.code import eval_code_async

# Context variable to track which cell is currently executing
current_cell_id = contextvars.ContextVar("current_cell_id", default=None)

# Callback to JS
_publish_stream_callback = None

def register_stream_callback(cb):
    global _publish_stream_callback
    _publish_stream_callback = cb

class ContextAwareOutput(io.TextIOBase):
    def __init__(self, name):
        self.name = name

    def write(self, s):
        cell_id = current_cell_id.get()
        if _publish_stream_callback and cell_id:
            _publish_stream_callback(cell_id, self.name, s)
        return len(s)

sys.stdout = ContextAwareOutput("stdout")
sys.stderr = ContextAwareOutput("stderr")

async def run_cell_code(code, cell_id):
    token = current_cell_id.set(cell_id)
    # Also set StateManager context (for UI element registration)
    from pynote_ui import set_current_cell
    set_current_cell(cell_id)
    try:
        # Execute code in the global namespace
        res = await eval_code_async(code, globals=globals())
        
        # Auto-wrap lists of UIElements into a Group
        if isinstance(res, list) and res:
            # Check if likely a list of UI elements (duck typing)
            if all(hasattr(x, '_repr_mimebundle_') for x in res):
                try:
                    from pynote_ui.elements import Group
                    return Group(res)
                except ImportError:
                    pass
        return res
    except Exception:
        import traceback
        import sys
        
        exc_type, exc_value, exc_tb = sys.exc_info()
        tb_list = traceback.extract_tb(exc_tb)
        
        filtered_tb = []
        for frame in tb_list:
            # Filter out Pyodide internal frames and our wrapper
            if "_pyodide/_base.py" in frame.filename:
                continue
            if frame.name == "run_cell_code":
                continue
            filtered_tb.append(frame)
            
        generated_tb = "Traceback (most recent call last):\\n" + \\
            "".join(traceback.format_list(filtered_tb)) + \\
            "".join(traceback.format_exception_only(exc_type, exc_value))
            
        return { "__pynote_error__": generated_tb }
    finally:
        current_cell_id.reset(token)
`;

async function initPyodide() {
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/"
        });
        await pyodide.loadPackage("micropip");
        // const micropip = pyodide.pyimport("micropip");
        // console.log("Installing pynote_ui...");
        // await micropip.install(self.location.origin + "/packages/pynote_ui-0.1.0-py3-none-any.whl");
        // console.log("pynote_ui installed successfully.");

        // Optimisation: Pre-load pynote_ui directly into FS to skip HTTP/Micropip overhead
        pyodide.FS.mkdir("pynote_ui");
        pyodide.FS.writeFile("pynote_ui/__init__.py", `
from .core import (
    UIElement, StateManager, handle_interaction, set_current_cell, clear_cell, 
    register_comm_target, display, print_md,
    MARKER_UI_START, MARKER_UI_END, 
    MARKER_MD_STYLED_START, MARKER_MD_STYLED_END,
    MARKER_MD_PLAIN_START, MARKER_MD_PLAIN_END
)
from .elements import Slider, Text, Group
from . import oplot, uplot, fplot

__all__ = [
    "UIElement", "StateManager", "handle_interaction", 
    "Slider", "Text", "Group", 
    "oplot", "uplot", "fplot",
    "set_current_cell", "clear_cell", "register_comm_target",
    "display", "print_md",
    "MARKER_UI_START", "MARKER_UI_END",
    "MARKER_MD_STYLED_START", "MARKER_MD_STYLED_END",
    "MARKER_MD_PLAIN_START", "MARKER_MD_PLAIN_END"
]
`);
        pyodide.FS.writeFile("pynote_ui/core.py", `
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
        cls._instances[instance.id] = instance
        cell_id = _current_cell_id.get()
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
                # Fallback or error logging if needed
                pass

class UIElement:
    def __init__(self, **kwargs):
        self.id = str(uuid.uuid4())
        self.props = kwargs
        self._on_update = None
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
        self._on_update = callback

    def handle_interaction(self, data):
        """Override in subclasses to handle updates from frontend"""
        if self._on_update:
            self._on_update(data)
    
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
`);
        pyodide.FS.writeFile("pynote_ui/elements.py", `
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
            # Use float if step is a float, otherwise preserve original type
            if isinstance(self.step, float):
                self._value = float(data["value"])
            else:
                self._value = type(self._value)(data["value"])
            # Update internal props to match current state
            self.props["value"] = self._value
        super().handle_interaction(data)

class Text(UIElement):
    def __init__(self, content="", width=None, height=None, grow=None, shrink=None, force_dimensions=False, align_h="left", align_v="top"):
        self._content = content
        super().__init__(
            content=content,
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
`);
        pyodide.FS.writeFile("pynote_ui/oplot.py", `
"""
Observable Plot-based plotting functions.

Observable Plot supports many mark types for creating rich visualizations:
- line, lineX, lineY: connected lines
- dot: scatter plots
- bar, barX, barY: bar charts  
- area, areaX, areaY: filled areas
- rect, rectX, rectY: rectangles (histograms, heatmaps)
- cell: categorical heatmaps
- rule: reference lines
- text: labels
- box, boxX, boxY: boxplots
- density: smooth density estimation
- contour: contour lines
- And many more!

This module provides convenient high-level functions for common plot types.
"""

from .core import UIElement

class Plot(UIElement):
    """
    General-purpose plotting using Observable Plot.
    
    Exposes the full flexibility of Observable Plot mark types and options.
    
    Args:
        data: List of dicts, e.g., [{"x": 1, "y": 2}, {"x": 2, "y": 4}, ...]
        
        # Required/Primary
        mark: Mark type - "line", "lineX", "lineY", "dot", "bar", "barY", "barX", 
              "area", "areaY", "areaX", "rect", "rectY", "rectX", "cell", "rule", 
              "ruleX", "ruleY", "text", "boxX", "boxY", "density", etc.
        
        # Position channels (most marks)
        x, y: Column names or values for position
        x1, x2, y1, y2: Explicit bounds for rect/area marks
        
        # Visual encoding channels
        fill: Column or color for fill (can vary per point)
        stroke: Column or color for stroke (can vary per point)
        opacity: Column or value for opacity
        strokeWidth: Column or value for stroke width
        fillOpacity: Column or value for fill opacity
        strokeOpacity: Column or value for stroke opacity
        
        # Dot-specific
        r: Column or value for radius/size (dot marks)
        symbol: Column or symbol type - "circle", "square", "diamond", "triangle", etc.
        
        # Series grouping
        z: Column for grouping into separate series (line, area marks)
        
        # Scale customization
        xLabel, yLabel: Axis labels
        xDomain, yDomain: Explicit scale domains [min, max]
        xType, yType: Scale type - "linear", "log", "sqrt", "pow", "time", "utc", 
                      "band", "point", "ordinal"
        
        # Transforms
        sort: Column or {channel: "x", order: "ascending"} for sorting
        filter: Function to filter data points
        bin: Binning specification for histograms
        thresholds: Number of bins or bin edges
        interval: Time/numeric interval for regularization ("day", "hour", 1, etc.)
        reduce: Reducer function for binning - "count", "sum", "mean", "median", etc.
        curve: Interpolation curve - "linear", "step", "step-before", "step-after", 
               "basis", "cardinal", "catmull-rom", "monotone-x", "monotone-y", "natural"
        
        # Mark styling
        marker: Add markers to line endpoints - "dot", "arrow", "circle", etc.
        inset: Spacing between bars/rects (number in pixels)
        insetTop, insetRight, insetBottom, insetLeft: Individual insets
        
        # Chart appearance (app-specific)
        title: Chart title
        width: Chart width - number (pixels), "full", or "100%" (default: "full")
        height: Chart height in pixels (default: 380)
        grid: Show grid - True (y-axis), "both", "x", "y", False
        border: Show border (default: True)
        borderRadius: Border radius
        
        # Layout (app-specific)
        grow, shrink: Flex properties for responsive sizing
        force_dimensions: Override flex with fixed dimensions
        
        # Style customization (all optional, override defaults)
        titleStyle: Title text style dict
        xLabelStyle, yLabelStyle: Axis label style dicts
        tickStyle: Tick/number label style dict
        gridStyle: Grid line style dict
        axisStyle: Axis line style dict
        
        # Advanced: Any other Observable Plot option
        **kwargs: Any additional Observable Plot options are passed through
    """
    def __init__(
        self,
        data,
        # Position channels (most accept None, making them optional)
        x=None,
        y=None,
        # Mark type
        mark="line",
        # Visual encoding channels
        color=None,  # legacy: maps to fill or stroke
        fill=None,
        stroke=None,
        opacity=None,
        strokeWidth=None,
        fillOpacity=None,
        strokeOpacity=None,
        # Dimension channels
        size=None,  # legacy: maps to r for dots
        r=None,
        symbol=None,
        # Series grouping
        series=None,  # legacy: maps to z
        z=None,
        # Position bounds (for rect/area marks)
        x1=None, x2=None, y1=None, y2=None,
        # Scale options
        xLabel=None,
        yLabel=None,
        xDomain=None,
        yDomain=None,
        xType=None,
        yType=None,
        # Transforms
        sort=None,
        filter=None,
        bin=None,
        thresholds=None,
        interval=None,
        reduce=None,
        curve=None,
        # Mark styling
        marker=None,
        inset=None,
        insetTop=None,
        insetRight=None,
        insetBottom=None,
        insetLeft=None,
        # Grid & margins
        grid=None,
        marginTop=None,
        marginRight=None,
        marginBottom=None,
        marginLeft=None,
        # Chart appearance (app-specific)
        width="full",
        height=380,
        title=None,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts (app-specific)
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        # Layout (app-specific)
        grow=None,
        shrink=None,
        force_dimensions=False,
        # Pass-through for any other Observable Plot options
        **kwargs
    ):
        # Convert numpy arrays to lists if needed
        if hasattr(data, 'tolist'):
            data = data.tolist()
        elif isinstance(data, list) and len(data) > 0:
            # Convert any numpy values in dicts
            data = [
                {k: (v.item() if hasattr(v, 'item') else v) for k, v in row.items()}
                if isinstance(row, dict) else row
                for row in data
            ]
        
        self._data = data
        
        # Handle legacy parameters: map old names to new channels
        if series is not None and z is None:
            z = series
        if size is not None and r is None:
            r = size
        
        # Pass all parameters to parent UIElement
        super().__init__(
            data=data,
            x=x,
            y=y,
            x1=x1,
            x2=x2,
            y1=y1,
            y2=y2,
            mark=mark,
            color=color,
            fill=fill,
            stroke=stroke,
            opacity=opacity,
            strokeWidth=strokeWidth,
            fillOpacity=fillOpacity,
            strokeOpacity=strokeOpacity,
            size=size,
            r=r,
            symbol=symbol,
            series=series,
            z=z,
            xLabel=xLabel,
            yLabel=yLabel,
            xDomain=xDomain,
            yDomain=yDomain,
            xType=xType,
            yType=yType,
            sort=sort,
            filter=filter,
            bin=bin,
            thresholds=thresholds,
            interval=interval,
            reduce=reduce,
            curve=curve,
            marker=marker,
            inset=inset,
            insetTop=insetTop,
            insetRight=insetRight,
            insetBottom=insetBottom,
            insetLeft=insetLeft,
            grid=grid,
            width=width,
            height=height,
            marginTop=marginTop,
            marginRight=marginRight,
            marginBottom=marginBottom,
            marginLeft=marginLeft,
            title=title,
            border=border,
            borderWidth=borderWidth,
            borderRadius=borderRadius,
            borderColor=borderColor,
            titleStyle=titleStyle,
            xLabelStyle=xLabelStyle,
            yLabelStyle=yLabelStyle,
            tickStyle=tickStyle,
            gridStyle=gridStyle,
            axisStyle=axisStyle,
            grow=grow,
            shrink=shrink,
            force_dimensions=force_dimensions,
            **kwargs  # Pass through any additional Observable Plot options
        )

    @property
    def data(self):
        return self._data

    @data.setter
    def data(self, value):
        if hasattr(value, 'tolist'):
            value = value.tolist()
        self._data = value
        self.send_update(data=value)


# =============================================================================
# Convenience Functions for Common Plot Types
# =============================================================================

def scatter(data, x=None, y=None, fill=None, stroke=None, r=None, symbol=None, 
            opacity=None, title=None, **kwargs):
    """Create a scatter plot (dot mark)."""
    return Plot(data, x=x, y=y, mark="dot", fill=fill, stroke=stroke, r=r, 
                symbol=symbol, opacity=opacity, title=title, **kwargs)

def line(data, x=None, y=None, stroke=None, z=None, curve="linear", 
         marker=None, strokeWidth=None, title=None, **kwargs):
    """Create a line plot."""
    return Plot(data, x=x, y=y, mark="line", stroke=stroke, z=z, curve=curve,
                marker=marker, strokeWidth=strokeWidth, title=title, **kwargs)

def area(data, x=None, y=None, y1=None, y2=None, fill=None, z=None, 
         curve="linear", title=None, **kwargs):
    """Create an area chart."""
    return Plot(data, x=x, y=y, y1=y1, y2=y2, mark="areaY", fill=fill, z=z, 
                curve=curve, title=title, **kwargs)

def bar(data, x=None, y=None, fill=None, sort=None, orientation="vertical", 
        inset=0, title=None, **kwargs):
    """Create a bar chart."""
    mark = "barY" if orientation == "vertical" else "barX"
    return Plot(data, x=x, y=y, mark=mark, fill=fill, sort=sort, inset=inset, 
                title=title, **kwargs)

def histogram(data, x=None, y=None, bins=None, fill=None, 
              stat="count", orientation="vertical", title=None, **kwargs):
    """
    Create a histogram using rectY/rectX with binning.
    
    Args:
        bins: Number of bins (int) or explicit bin edges (list)
        stat: Statistic - "count", "proportion", "percent", "density", "sum", "mean", etc.
    """
    mark = "rectY" if orientation == "vertical" else "rectX"
    # Map user-friendly names to Observable Plot's internal names
    return Plot(data, x=x, y=y, mark=mark, fill=fill, thresholds=bins, 
                reduce=stat, title=title, **kwargs)

def boxplot(data, x=None, y=None, fill=None, orientation="vertical", title=None, **kwargs):
    """Create a box plot."""
    mark = "boxY" if orientation == "vertical" else "boxX"
    return Plot(data, x=x, y=y, mark=mark, fill=fill, title=title, **kwargs)

def heatmap(data, x=None, y=None, fill=None, stroke=None, inset=0.5, title=None, **kwargs):
    """Create a heatmap."""
    return Plot(data, x=x, y=y, mark="cell", fill=fill, stroke=stroke, 
                inset=inset, title=title, **kwargs)

def density(data, x=None, y=None, fill=None, stroke=None, 
            thresholds=None, bandwidth=None, title=None, **kwargs):
    """Create a smooth density contour plot."""
    return Plot(data, x=x, y=y, mark="density", fill=fill, stroke=stroke, 
                thresholds=thresholds, bandwidth=bandwidth, title=title, **kwargs)

def rule(data=None, x=None, y=None, stroke="currentColor", strokeWidth=1, 
         strokeDasharray="4 2", title=None, **kwargs):
    """Create reference lines."""
    return Plot(data, x=x, y=y, mark="rule", stroke=stroke, strokeWidth=strokeWidth,
                strokeDasharray=strokeDasharray, title=title, **kwargs)
`);
        pyodide.FS.writeFile("pynote_ui/uplot.py", `
from .core import UIElement

class TimeSeries(UIElement):
    """
    High-performance time-series plotting using uPlot.
    
    Optimized for large datasets (100k+ points). Uses canvas rendering
    for maximum performance and minimal memory usage.
    
    Args:
        data: Either uPlot format [[timestamps], [values], ...] or 
              simplified format {"x": [...], "y": [...], "y2": [...]}
        series: List of series configs [{"label": "...", "stroke": "#color"}, ...]
        xLabel, yLabel: Axis labels
        xType: "time" (default, Unix timestamps) or "numeric"
        title: Chart title
        width: Chart width - number (pixels), "full", or "100%" (default: fills container)
        height: Chart height in pixels (default: 350)
        legend: Show legend (default: True)
        cursor: Show cursor crosshairs (default: True)
        zoom: Enable zoom on drag (default: True)
        border: Show border (default: True)
        borderRadius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        titleStyle: dict - Title text style
        xLabelStyle: dict - X-axis label style
        yLabelStyle: dict - Y-axis label style
        tickStyle: dict - Tick/number label style
        gridStyle: dict - Grid line style
        axisStyle: dict - Axis line style
    
    Example:
        import numpy as np
        from pynote_ui.uplot import TimeSeries
        import time
        
        # 10,000 points - renders instantly!
        n = 10000
        now = int(time.time())
        timestamps = list(range(now - n, now))
        values = np.cumsum(np.random.randn(n)).tolist()
        
        TimeSeries(
            data={"x": timestamps, "y": values},
            xType="time",
            title="Random Walk",
            width="full",
            titleStyle={"fontSize": "18px", "color": "#333"}
        )
    """
    def __init__(
        self,
        data,
        series=None,
        xLabel=None,
        yLabel=None,
        y2Label=None,
        xType="time",
        xRange=None,
        yRange=None,
        width="full",
        height=350,
        legend=True,
        cursor=True,
        zoom=True,
        title=None,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        grow=None,
        shrink=None,
        force_dimensions=False
    ):
        # Convert data format
        self._data = self._normalize_data(data)
        
        super().__init__(
            data=self._data,
            series=series,
            xLabel=xLabel,
            yLabel=yLabel,
            y2Label=y2Label,
            xType=xType,
            xRange=xRange,
            yRange=yRange,
            width=width,
            height=height,
            legend=legend,
            cursor=cursor,
            zoom=zoom,
            title=title,
            border=border,
            borderWidth=borderWidth,
            borderRadius=borderRadius,
            borderColor=borderColor,
            titleStyle=titleStyle,
            xLabelStyle=xLabelStyle,
            yLabelStyle=yLabelStyle,
            tickStyle=tickStyle,
            gridStyle=gridStyle,
            axisStyle=axisStyle,
            grow=grow,
            shrink=shrink,
            force_dimensions=force_dimensions
        )

    def _normalize_data(self, data):
        """Convert various data formats to serializable format."""
        if isinstance(data, dict):
            # Convert numpy arrays in dict values
            return {
                k: (v.tolist() if hasattr(v, 'tolist') else list(v))
                for k, v in data.items()
            }
        elif isinstance(data, (list, tuple)):
            # uPlot format: [[x], [y1], [y2], ...]
            return [
                (arr.tolist() if hasattr(arr, 'tolist') else list(arr))
                for arr in data
            ]
        return data

    @property
    def data(self):
        return self._data

    @data.setter
    def data(self, value):
        self._data = self._normalize_data(value)
        self.send_update(data=self._data)
`);
        pyodide.FS.writeFile("pynote_ui/fplot.py", `
from .core import UIElement

class Chart(UIElement):
    """
    Specialized charts using Frappe Charts.
    
    Covers chart types not well-suited for line/scatter plots:
    pie, donut, percentage bars, heatmaps.
    
    Args:
        type: Chart type - "pie", "donut", "percentage", "heatmap", "bar", "line"
        data: Data format depends on type:
            - pie/donut/percentage: {"labels": [...], "values": [...]}
            - heatmap: {"dataPoints": {"timestamp": count, ...}}
            - bar/line: {"labels": [...], "datasets": [{"values": [...]}, ...]}}
        title: Chart title
        colors: Custom color palette (optional, auto-generated from theme accent)
        width: Chart width - number (pixels), "full", or "100%" (default: fills container)
        height: Chart height in pixels (default: 300)
        border: Show border (default: True)
        borderRadius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        titleStyle: dict - Title text style
        xLabelStyle: dict - X-axis label style
        yLabelStyle: dict - Y-axis label style
        tickStyle: dict - Tick/number label style
        gridStyle: dict - Grid line style
        axisStyle: dict - Axis line style
        
    Type-specific options:
        - maxSlices: For pie/donut, max number of slices before "Other"
        - countLabel: For heatmap, label for count values
        - barOptions: {"spaceRatio": 0.4, "stacked": False}
        - lineOptions: {"dotSize": 4, "regionFill": False, "spline": False}
    
    Example:
        from pynote_ui.fplot import Chart
        
        # Pie chart with custom title style
        Chart(
            type="pie",
            data={"labels": ["A", "B", "C"], "values": [40, 35, 25]},
            title="Distribution",
            width="full",
            titleStyle={"fontSize": "20px", "fontWeight": "bold"}
        )
        
        # Bar chart with custom grid
        Chart(
            type="bar",
            data={
                "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "datasets": [{"name": "Sales", "values": [10, 20, 15, 25, 30]}]
            },
            title="Weekly Sales",
            gridStyle={"stroke": "#ddd"}
        )
    """
    def __init__(
        self,
        type,
        data,
        title=None,
        width="full",
        height=300,
        colors=None,
        maxSlices=None,
        countLabel=None,
        discreteDomains=True,
        barOptions=None,
        lineOptions=None,
        axisOptions=None,
        tooltipOptions=None,
        animate=True,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        grow=None,
        shrink=None,
        force_dimensions=False
    ):
        self._data = self._normalize_data(data)
        self._type = type
        
        super().__init__(
            type=type,
            data=self._data,
            title=title,
            width=width,
            height=height,
            colors=colors,
            maxSlices=maxSlices,
            countLabel=countLabel,
            discreteDomains=discreteDomains,
            barOptions=barOptions,
            lineOptions=lineOptions,
            axisOptions=axisOptions,
            tooltipOptions=tooltipOptions,
            animate=animate,
            border=border,
            borderWidth=borderWidth,
            borderRadius=borderRadius,
            borderColor=borderColor,
            titleStyle=titleStyle,
            xLabelStyle=xLabelStyle,
            yLabelStyle=yLabelStyle,
            tickStyle=tickStyle,
            gridStyle=gridStyle,
            axisStyle=axisStyle,
            grow=grow,
            shrink=shrink,
            force_dimensions=force_dimensions
        )

    def _normalize_data(self, data):
        """Convert numpy arrays to lists."""
        if isinstance(data, dict):
            result = {}
            for k, v in data.items():
                if hasattr(v, 'tolist'):
                    result[k] = v.tolist()
                elif isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                    # datasets array
                    result[k] = [
                        {dk: (dv.tolist() if hasattr(dv, 'tolist') else dv) 
                         for dk, dv in d.items()}
                        for d in v
                    ]
                else:
                    result[k] = v
            return result
        return data

    @property
    def data(self):
        return self._data

    @data.setter
    def data(self, value):
        self._data = self._normalize_data(value)
        self.send_update(data=self._data)

    @property
    def type(self):
        return self._type
`);

        await pyodide.runPythonAsync(INIT_CODE);

        // Register stream callback
        const register_cb = pyodide.globals.get("register_stream_callback");
        register_cb((id: string, stream: string, text: string) => {
            postMessage({ id, type: stream, content: text });
        });
        register_cb.destroy();

        // Register comm target
        const pkg = pyodide.pyimport("pynote_ui");
        pkg.register_comm_target((uid: string, data: any) => {
            const jsData = data.toJs({ dict_converter: Object.fromEntries });
            postMessage({ type: "component_update", uid, data: jsData });
        });
        pkg.destroy();

        postMessage({ type: "ready" });
    } catch (e) {
        postMessage({ type: "error", error: String(e) });
    }
}

async function runCode(id: string, code: string) {
    if (!pyodide) {
        postMessage({ id, type: "error", error: "Kernel not ready" });
        return;
    }

    // We do NOT setStdout here anymore. Python handles context-aware routing.

    try {
        await pyodide.loadPackagesFromImports(code);

        // Call the Python helper function
        const run_cell_code = pyodide.globals.get("run_cell_code");
        const result = await run_cell_code(code, id);
        run_cell_code.destroy();

        // Check for explicit error returned from Python (captured traceback)
        if (result && result.toJs && typeof result.has === "function" && result.has("__pynote_error__")) {
            const errorMsg = result.get("__pynote_error__");
            postMessage({ id, type: "error", error: errorMsg });
            result.destroy();
            return;
        }

        let mimebundle = undefined;
        if (result && result._repr_mimebundle_) {
            try {
                const mb = result._repr_mimebundle_();
                mimebundle = mb.toJs({ dict_converter: Object.fromEntries });
                mb.destroy();
            } catch (e) {
                console.error("Error extracting mimebundle", e);
            }
        }

        postMessage({ id, type: "success", result: result?.toString(), mimebundle });
    } catch (error: any) {
        postMessage({ id, type: "error", error: error.toString() });
    }
}

self.onmessage = async (e) => {
    const { type, id, code } = e.data;

    if (type === "init") {
        await initPyodide();
    } else if (type === "run") {
        // Concurrent execution allowed!
        // We do NOT await here to block the loop, but we handle errors in runCode.
        // However, runCode is async. If we don't await, it runs in background.
        // This is exactly what we want for Hybrid/Concurrent mode.
        runCode(id, code);
    } else if (type === "interaction") {
        const { uid, data } = e.data;
        if (pyodide) {
            try {
                const pkg = pyodide.pyimport("pynote_ui");
                const pyData = pyodide.toPy(data);
                pkg.handle_interaction(uid, pyData);
                pyData.destroy();
                pkg.destroy();
            } catch (err) {
                console.error("Interaction error", err);
            }
        }
    } else if (type === "set_cell_context") {
        if (pyodide) {
            try {
                const pkg = pyodide.pyimport("pynote_ui");
                pkg.set_current_cell(id);
                pkg.destroy();
            } catch (err) {
                console.error("Set cell context error", err);
            }
        }
    } else if (type === "clear_cell_context") {
        if (pyodide) {
            try {
                const pkg = pyodide.pyimport("pynote_ui");
                pkg.clear_cell(id);
                pkg.destroy();
            } catch (err) {
                console.error("Clear cell context error", err);
            }
        }
    }
};