// Python bootstrap executed in the Pyodide worker at startup. Sets up
// context-aware stream routing, cell execution, and dependency analysis.
export const INIT_CODE = `
import sys
import io
import contextvars
import ast
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

# Completion filtering configuration
# This can be customized for different filtering strategies (basic, AI-based, etc.)
_completion_filters = {
    "show_private": False,      # Show private/internal members (starting with _)
    "show_dunder": False,        # Show dunder methods (__init__, __str__, etc.)
    "max_results": 100,          # Maximum number of completions to return
    "use_cache": True,           # Cache dir() results for performance
}

# Cache for dir() results to avoid repeated introspection on large modules
_dir_cache = {}

# Pre-computed completions for builtins + embedded modules (pynote_ui).
# These never change during a session, so we build once and reuse.
_builtins_cache = None  # Will be dict: name -> {"label": str, "type": str}

def _build_builtins_cache():
    """
    Build a cache of completion items for builtins and embedded modules.
    Called lazily on first global-scope completion request.
    Includes: dir(builtins) + dir(pynote_ui) with pre-computed type info.
    """
    global _builtins_cache
    import builtins, inspect
    cache = {}

    # --- builtins ---
    for name in dir(builtins):
        obj = getattr(builtins, name, None)
        cache[name] = {"label": name, "type": _classify(obj, inspect)}

    # --- embedded modules (pynote_ui) ---
    try:
        import pynote_ui
        # Add the module name itself
        cache["pynote_ui"] = {"label": "pynote_ui", "type": "module"}
        for name in dir(pynote_ui):
            obj = getattr(pynote_ui, name, None)
            cache[name] = {"label": name, "type": _classify(obj, inspect)}
    except ImportError:
        pass

    _builtins_cache = cache

def _classify(obj, inspect):
    """Classify an object into a completion type string."""
    if obj is None:
        return "variable"
    if inspect.ismodule(obj):
        return "module"
    if inspect.isclass(obj):
        return "class"
    if inspect.isfunction(obj) or inspect.isbuiltin(obj) or inspect.ismethod(obj) or callable(obj):
        return "function"
    return "variable"

def configure_completions(**kwargs):
    """
    Configure completion filtering behavior.
    
    Args:
        show_private: Include private members (starting with single _)
        show_dunder: Include dunder methods (starting with __)
        max_results: Maximum number of completions to return
        use_cache: Enable caching of dir() results
    """
    _completion_filters.update(kwargs)
    
def clear_completion_cache():
    """
    Clear the completion cache. 
    Call this only on kernel restart, not after normal cell execution.
    The cache naturally stays in sync with the runtime since all cells share the same namespace.
    """
    global _builtins_cache
    _dir_cache.clear()
    _builtins_cache = None

def _filter_completions(items, partial, parent_obj=None):
    """
    Filter and rank completion items based on configuration.
    This function is designed to be easily replaceable with AI-based filtering.
    
    Args:
        items: List of attribute names from dir()
        partial: The partial text being completed
        parent_obj: The parent object (for type checking, future AI features)
    
    Returns:
        Filtered and sorted list of completion items
    """
    filtered = []
    
    for name in items:
        # Skip if doesn't match partial
        if not name.startswith(partial):
            continue
            
        # Apply filters based on configuration
        if name.startswith('__'):
            if not _completion_filters["show_dunder"]:
                continue
        elif name.startswith('_'):
            if not _completion_filters["show_private"]:
                continue
        
        filtered.append(name)
    
    # Sort: exact match first, then alphabetically
    filtered.sort(key=lambda x: (x != partial, x.lower()))
    
    # Limit results
    max_results = _completion_filters["max_results"]
    if max_results and len(filtered) > max_results:
        filtered = filtered[:max_results]
    
    return filtered

def get_completions(code, offset):
    """
    Simple completion based on runtime introspection with configurable filtering.
    """
    try:
        # Get the word ending at offset
        line_start = code.rfind('\\n', 0, offset) + 1
        line = code[line_start:offset]
        
        # Simple tokenization to find the object to inspect
        # e.g. "import np; np.li" -> we want to complete "np.li"
        # We walk back from end to find start of identifier
        import re
        match = re.search(r'([a-zA-Z_][a-zA-Z0-9_.]*)$', line)
        if not match:
            return []
            
        text = match.group(1)
        
        # Split into parent and partial child
        if '.' in text:
            parts = text.split('.')
            parent_name = '.'.join(parts[:-1])
            partial = parts[-1]
            
            # Evaluate parent
            try:
                parent = eval(parent_name, globals())
            except:
                return []
            
            # Get attributes (with caching for performance)
            use_cache = _completion_filters["use_cache"]
            cache_key = parent_name
            
            if use_cache and cache_key in _dir_cache:
                all_attrs = _dir_cache[cache_key]
            else:
                all_attrs = dir(parent)
                if use_cache:
                    _dir_cache[cache_key] = all_attrs
            
            # Filter using configurable filter function
            filtered = _filter_completions(all_attrs, partial, parent)
            
            # Build completion items with type info
            import inspect
            result = []
            for n in filtered:
                try:
                    attr = getattr(parent, n, None)
                    if attr is not None:
                        # Determine type using inspect module (check module first)
                        if inspect.ismodule(attr):
                            item_type = "module"
                        elif inspect.isclass(attr):
                            item_type = "class"
                        elif inspect.isfunction(attr) or inspect.isbuiltin(attr) or inspect.ismethod(attr):
                            item_type = "function"
                        elif callable(attr):
                            item_type = "function"
                        else:
                            item_type = "property"
                        result.append({"label": n, "type": item_type})
                    else:
                        result.append({"label": n, "type": "property"})
                except:
                    result.append({"label": n, "type": "property"})
            return result
        else:
            # Global scope completion
            partial = text
            
            # Lazily build the builtins+embedded-modules cache
            if _builtins_cache is None:
                _build_builtins_cache()
            
            # --- Cached builtins: just filter the pre-computed items ---
            result = []
            for name, item in _builtins_cache.items():
                if not name.startswith(partial):
                    continue
                if name.startswith('__'):
                    if not _completion_filters["show_dunder"]:
                        continue
                elif name.startswith('_'):
                    if not _completion_filters["show_private"]:
                        continue
                result.append(item)
            
            # --- User globals: inspect fresh (these change on every cell run) ---
            import inspect
            seen = set(item["label"] for item in result)
            user_names = [k for k in globals().keys() if k not in _builtins_cache]
            filtered_user = _filter_completions(user_names, partial)
            for n in filtered_user:
                if n in seen:
                    continue
                try:
                    obj = globals().get(n)
                    result.append({"label": n, "type": _classify(obj, inspect)})
                except:
                    result.append({"label": n, "type": "variable"})
            
            # Sort and limit
            result.sort(key=lambda x: (x["label"] != partial, x["label"].lower()))
            max_results = _completion_filters["max_results"]
            if max_results and len(result) > max_results:
                result = result[:max_results]
            
            return result
    except Exception:
        return []

def get_hover_help(code, offset):
    """
    Get docstring and type info for tooltip.
    """
    try:
        # Similar logic to find the full identifier under cursor
        line_start = code.rfind('\\n', 0, offset) + 1
        line_end = code.find('\\n', offset)
        if line_end == -1: line_end = len(code)
        
        line = code[line_start:line_end]
        col = offset - line_start
        
        # Expand word at cursor (identifiers including dots)
        import re
        import inspect
        # Find all identifiers in the line
        for match in re.finditer(r'[a-zA-Z_][a-zA-Z0-9_.]*', line):
            if match.start() <= col <= match.end():
                word = match.group(0)
                try:
                    obj = eval(word, globals())
                    doc = obj.__doc__ or ""
                    
                    # Determine proper type using inspect module
                    # Check module FIRST before class (some edge cases)
                    if inspect.ismodule(obj):
                        obj_type = "module"
                    elif inspect.isclass(obj):
                        obj_type = "class"
                    elif inspect.isfunction(obj) or inspect.isbuiltin(obj) or inspect.ismethod(obj):
                        obj_type = "function"
                    elif callable(obj):
                        obj_type = "callable"
                    else:
                        # Fall back to type name for instances
                        obj_type = type(obj).__name__
                    
                    # Smart stripping
                    # 1. Strip leading whitespace
                    doc = "\\n".join([l.strip() for l in doc.split('\\n')])
                    # 2. Limit length (first 300 chars or first paragraph)
                    if "\\n\\n" in doc:
                        doc = doc.split("\\n\\n")[0]
                    if len(doc) > 300:
                        doc = doc[:297] + "..."
                        
                    return {
                        "type": obj_type,
                        "doc": doc,
                        "found": True
                    }
                except:
                    pass
        return {"found": False}
    except:
        return {"found": False}

def lint_code_with_defs(code, extract_defs):
    """
    Parse code and extract syntax errors and optionally definitions.
    """
    diagnostics = []
    definitions = []
    
    try:
        tree = ast.parse(code)
        
        if extract_defs:
            # Extract definitions (naive top-level)
            for node in tree.body:
                target_infos = []
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            target_infos.append((target.id, target.lineno, target.col_offset))
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    target_infos.append((node.name, node.lineno, node.col_offset))
                elif isinstance(node, ast.AnnAssign):
                     if isinstance(node.target, ast.Name):
                         target_infos.append((node.target.id, node.target.lineno, node.target.col_offset))
                         
                for name, line, col in target_infos:
                    definitions.append({"name": name, "line": line, "col": col})
                    
    except SyntaxError as e:
        # lineno is 1-based, offset is 1-based column
        lineno = e.lineno or 1
        col = (e.offset or 1) - 1
        diagnostics = [{"line": lineno, "col": col, "message": e.msg}]
    except Exception:
        pass
        
    return {"diagnostics": diagnostics, "definitions": definitions}

async def run_cell_code(code, cell_id):
    token = current_cell_id.set(cell_id)
    # Also set StateManager context (for UI element registration)
    from pynote_ui import set_current_cell
    set_current_cell(cell_id)
    try:
        # Execute code in the global namespace
        res = await eval_code_async(code, globals=globals())
        
        # Note: We do NOT clear completion cache here because all cells share the same
        # Python runtime/namespace. The cache remains valid across cell executions.
        # The cache will naturally update when variables are redefined (next dir() call).
        # Only clear cache on kernel restart or manual clear_completion_cache() call.
        
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
        # Clear cell context after execution. However, components created in callbacks
        # will inherit their parent component's cell_id (captured during on_update registration),
        # so lazy-loaded components still register to the correct cell.
        from pynote_ui import set_current_cell
        set_current_cell(None)

import ast

def analyze_cell_dependencies(code):
    """
    Static analysis to extract variable definitions and references from Python code.
    Used for reactive execution mode (Marimo-style DAG).
    
    Returns: {"definitions": [...], "references": [...]}
    
    - definitions: variables assigned/defined in this cell (targets of assignment)
    - references: variables read but not defined in this cell (free variables)
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        # If code has syntax errors, return empty sets
        return {"definitions": [], "references": []}
    
    definitions = set()
    references = set()
    
    # Collect all assigned names (definitions)
    for node in ast.walk(tree):
        # Regular assignments: x = ...
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    definitions.add(target.id)
                elif isinstance(target, ast.Tuple) or isinstance(target, ast.List):
                    for elt in target.elts:
                        if isinstance(elt, ast.Name):
                            definitions.add(elt.id)
        # Augmented assignments: x += ...
        elif isinstance(node, ast.AugAssign):
            if isinstance(node.target, ast.Name):
                definitions.add(node.target.id)
        # Named expressions (walrus): (x := ...)
        elif isinstance(node, ast.NamedExpr):
            if isinstance(node.target, ast.Name):
                definitions.add(node.target.id)
        # For loops: for x in ...
        elif isinstance(node, ast.For):
            if isinstance(node.target, ast.Name):
                definitions.add(node.target.id)
            elif isinstance(node.target, ast.Tuple) or isinstance(node.target, ast.List):
                for elt in node.target.elts:
                    if isinstance(elt, ast.Name):
                        definitions.add(elt.id)
        # With statements: with ... as x
        elif isinstance(node, ast.With):
            for item in node.items:
                if item.optional_vars and isinstance(item.optional_vars, ast.Name):
                    definitions.add(item.optional_vars.id)
        # Exception handlers: except E as e
        elif isinstance(node, ast.ExceptHandler):
            if node.name:
                definitions.add(node.name)
        # Function definitions: def foo(...)
        elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
            definitions.add(node.name)
        # Class definitions: class Foo(...)
        elif isinstance(node, ast.ClassDef):
            definitions.add(node.name)
        # Import: import x, import x as y
        elif isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname if alias.asname else alias.name.split('.')[0]
                definitions.add(name)
        # Import from: from x import y, from x import y as z
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name == '*':
                    continue  # Can't track star imports
                name = alias.asname if alias.asname else alias.name
                definitions.add(name)
    
    # Collect all referenced names (loads)
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            references.add(node.id)
    
    # References are only those NOT defined locally
    # Also exclude Python builtins
    builtins = set(dir(__builtins__)) if isinstance(__builtins__, dict) else set(dir(__builtins__))
    builtins.update(['__name__', '__doc__', '__package__', '__loader__', '__spec__', 
                     '__annotations__', '__builtins__', '__file__', '__cached__'])
    
    # Local variables that are defined before use within the cell are not external references
    external_references = references - definitions - builtins
    
    # Filter out underscore-prefixed variables (local by convention, like Marimo)
    definitions = {d for d in definitions if not d.startswith('_')}
    external_references = {r for r in external_references if not r.startswith('_')}
    
    return {
        "definitions": list(definitions),
        "references": list(external_references)
    }
`;
