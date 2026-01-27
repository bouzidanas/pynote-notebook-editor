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
from .elements import Slider, Text, Group, Plot, TimeSeries, Chart

__all__ = [
    "UIElement", "StateManager", "handle_interaction", 
    "Slider", "Text", "Group", "Plot", "TimeSeries", "Chart",
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


# =============================================================================
# Chart Components
# =============================================================================

class Plot(UIElement):
    """
    General-purpose plotting using Observable Plot.
    
    Supports: line, dot (scatter), bar, area, cell, rect charts.
    
    Args:
        data: List of dicts, e.g., [{"x": 1, "y": 2}, {"x": 2, "y": 4}, ...]
        x: Column name for x-axis
        y: Column name for y-axis
        mark: Chart type - "line", "dot", "bar", "barY", "barX", "area", "areaY", "cell", "rect"
        color: Column name for color encoding (optional)
        stroke: Static stroke color (optional, defaults to theme accent)
        fill: Static fill color (optional)
        series: Column name for series grouping (optional)
        title: Chart title (optional)
        width: Chart width - number (pixels), "full", or "100%" (default: 600)
        height: Chart height in pixels (default: 380)
        grid: Show grid lines (default: True for y-axis)
        xLabel, yLabel: Axis labels
        xType, yType: Axis type - "linear", "log", "time", "band", "point"
        border: Show border (default: True)
        borderRadius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        titleStyle: dict - Title text style, e.g., {"fontSize": "18px", "fontWeight": "bold"}
        xLabelStyle: dict - X-axis label style
        yLabelStyle: dict - Y-axis label style  
        tickStyle: dict - Tick/number label style
        gridStyle: dict - Grid line style
        axisStyle: dict - Axis line style
    
    Example:
        import numpy as np
        from pynote_ui import Plot
        
        x = np.linspace(0, 10, 100)
        data = [{"x": xi, "y": np.sin(xi)} for xi in x]
        Plot(data, x="x", y="y", mark="line", title="Sine Wave")
        
        # Full width plot with custom title
        Plot(data, x="x", y="y", width="full",
             titleStyle={"fontSize": "20px", "fontWeight": "bold"})
    """
    def __init__(
        self,
        data,
        x,
        y,
        mark="line",
        color=None,
        size=None,
        opacity=None,
        fill=None,
        stroke=None,
        series=None,
        xLabel=None,
        yLabel=None,
        xDomain=None,
        yDomain=None,
        xType=None,
        yType=None,
        grid=None,
        width=600,
        height=380,
        marginTop=None,
        marginRight=None,
        marginBottom=None,
        marginLeft=None,
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
        super().__init__(
            data=data,
            x=x,
            y=y,
            mark=mark,
            color=color,
            size=size,
            opacity=opacity,
            fill=fill,
            stroke=stroke,
            series=series,
            xLabel=xLabel,
            yLabel=yLabel,
            xDomain=xDomain,
            yDomain=yDomain,
            xType=xType,
            yType=yType,
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
            force_dimensions=force_dimensions
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
        from pynote_ui import TimeSeries
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
            titleStyle={"fontSize": "18px"}
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
            - bar/line: {"labels": [...], "datasets": [{"values": [...]}, ...]}
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
        from pynote_ui import Chart
        
        # Pie chart with custom title
        Chart(
            type="pie",
            data={"labels": ["A", "B", "C"], "values": [40, 35, 25]},
            title="Distribution",
            width="full",
            titleStyle={"fontSize": "20px", "fontWeight": "bold"}
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
