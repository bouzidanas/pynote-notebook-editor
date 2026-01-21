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
        const micropip = pyodide.pyimport("micropip");
        // console.log("Installing pynote_ui...");
        // await micropip.install(self.location.origin + "/packages/pynote_ui-0.1.0-py3-none-any.whl");
        // console.log("pynote_ui installed successfully.");

        // Optimisation: Pre-load pynote_ui directly into FS to skip HTTP/Micropip overhead
        pyodide.FS.mkdir("pynote_ui");
        pyodide.FS.writeFile("pynote_ui/__init__.py", `
from .core import UIElement, StateManager, handle_interaction, set_current_cell, clear_cell, register_comm_target
from .elements import Slider, Text, Group

__all__ = ["UIElement", "StateManager", "handle_interaction", "Slider", "Text", "Group", "set_current_cell", "clear_cell", "register_comm_target"]
`);
        pyodide.FS.writeFile("pynote_ui/core.py", `
import uuid
import json

class StateManager:
    _instances = {}
    _instances_by_cell = {}
    _current_cell_id = None
    _comm_target = None

    @classmethod
    def set_current_cell(cls, cell_id):
        cls._current_cell_id = cell_id

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
        if cls._current_cell_id:
            if cls._current_cell_id not in cls._instances_by_cell:
                cls._instances_by_cell[cls._current_cell_id] = []
            cls._instances_by_cell[cls._current_cell_id].append(instance.id)

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
`);
        pyodide.FS.writeFile("pynote_ui/elements.py", `
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
