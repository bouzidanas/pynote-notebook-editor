# Namespace Collision Pitfalls in PyNote

## Problem Summary

**Symptom**: Interactive UI components (buttons, sliders, etc.) become unresponsive after running "Run All Cells", but work correctly when running cells individually.

**Root Cause**: All cells in PyNote share the same Python global namespace. When later cells redefine variables that earlier cells' callbacks depend on, those callbacks break.

---

## Why This Happens

### Shared Global Namespace
Unlike some notebook systems that isolate cells, PyNote intentionally shares a single Python runtime across all cells. This allows:
- Variables defined in one cell to be used in another
- Cross-cell interactivity (e.g., slider in Cell 1 controlling text in Cell 2)
- Efficient memory usage (no duplicate imports/data)

However, this creates a **hidden dependency problem**: callbacks capture variables by name, not by value.

### Example Flow

```python
# Cell 1: Create calculator
display = Text(content="0")  # Variable 'display' created

def on_click(data):
    display.content = "9"  # Callback references 'display' by NAME
    
button.on_update(on_click)
```

```python
# Cell 2: Later cell imports display function
from pynote_ui import display  # ❌ Overwrites the 'display' variable!

display(some_widget)  # Now 'display' is a function, not a Text object
```

**When callback runs**: `on_click()` tries to access `display.content`, but `display` is now a function → `AttributeError: 'function' object has no attribute 'content'`

---

## Common Collision Cases

### Case 1: Reserved Function Names

Variables that conflict with commonly imported functions:

```python
# ❌ BAD: 'display' conflicts with pynote_ui.display()
display = Text("Hello")

# ❌ BAD: 'input' conflicts with built-in
input = Input(placeholder="Name")

# ❌ BAD: 'open' conflicts with built-in
open = Button(label="Open")

# ✅ GOOD: Use descriptive prefixes
calc_display = Text("Hello")
name_input = Input(placeholder="Name")
open_button = Button(label="Open")
```

**Common PyNote names to avoid**:
- `display` - Function to render UI elements immediately
- `print` - Built-in (usually safe, but avoid in callbacks)
- `input` - Built-in input function
- `open` - Built-in file operation

### Case 2: Variable Reuse Across Cells

Using the same variable name for different purposes:

```python
# Cell 1: Counter
counter = Text(content="0")
value = 0

def increment(data):
    global value
    value += 1
    counter.content = str(value)  # References 'counter' and 'value'

button.on_update(increment)
```

```python
# Cell 2: Temperature converter
value = 32  # ❌ Overwrites 'value' from Cell 1!

# Now Cell 1's increment() callback will modify Cell 2's value variable
```

**When Cell 1's button is clicked after "Run All Cells"**: The callback modifies Cell 2's `value` instead of its own counter, causing incorrect behavior.

---

## Why "Run All Cells" Triggers This

### Single Cell Execution
```
1. Run Cell 1 → display = Text(...)
2. Click button → callback sees correct 'display'
✅ Works!
```

### Run All Cells
```
1. Run Cell 1 → display = Text(...)
2. Run Cell 2 → display = function  (overwrites!)
3. Run Cell 3 → value = 42  (overwrites!)
...
N. Click button → callback sees wrong 'display' / 'value'
❌ Broken!
```

The cells execute in rapid sequence, with later cells overwriting earlier variables **before** any user interaction occurs.

---

## Detection Strategy

### Symptoms to Watch For
1. ✅ Component works when cell runs individually
2. ❌ Component unresponsive after "Run All Cells"
3. ❌ Console shows `AttributeError` or unexpected type errors
4. ❌ Errors mention 'function' when expecting object, or vice versa

### Quick Test
```python
# Add to suspicious callbacks:
def on_click(data):
    import js
    js.console.log(f"Variable type: {type(display)}")  # Should be Text, not function
    js.console.log(f"Variable value: {display}")
    display.content = "clicked"
```

If type is unexpected, you have a collision!

---

## Prevention Best Practices

### 1. Use Descriptive Prefixes
```python
# ✅ GOOD: Clear, specific names
calc_display = Text("0")
user_input = Input(placeholder="Name")
submit_button = Button(label="Submit")
slider_value = 50
```

### 2. Namespace Your Variables
```python
# ✅ GOOD: Group related variables in objects
class CalcState:
    def __init__(self):
        self.display = Text("0")
        self.current = "0"
        self.operation = None

calc = CalcState()

def on_click(data):
    calc.display.content = "9"  # ✅ No collision possible!
```

### 3. Check for Reserved Names
Before naming variables in cells with callbacks:

```python
import pynote_ui
import builtins

# Check if name is reserved
name = "display"
if hasattr(pynote_ui, name):
    print(f"⚠️  '{name}' is a pynote_ui function/class!")
if hasattr(builtins, name):
    print(f"⚠️  '{name}' is a Python built-in!")
```

### 4. Avoid Generic Names
```python
# ❌ BAD: Too generic, likely to collide
data = [1, 2, 3]
value = 42
result = Text("...")

# ✅ GOOD: Specific to purpose
temperature_data = [1, 2, 3]
slider_value = 42
calculation_result = Text("...")
```

### 5. One Master Cell per Interactive Widget
If possible, define interactive widgets and their callbacks in a single cell to minimize cross-cell dependencies:

```python
# Cell: Self-contained calculator (no external variables)
class Calculator:
    def __init__(self):
        self.display = Text("0", width="100%", align_h="right", size="xl")
        self.state = {"current": "0", "previous": "", "operation": None}
        
        # All buttons and callbacks defined here
        self.btn_9 = Button(label="9", grow=1)
        self.btn_9.on_update(self.handle_number)
    
    def handle_number(self, data):
        # Only references self, no global variables
        num = data["label"]
        self.state["current"] += num
        self.display.content = self.state["current"]

calc = Calculator()
Group([calc.display, ...])
```

---

## Real-World Example: The Calculator Bug

### Original (Buggy) Code
```python
# Cell: Calculator
from pynote_ui import Button, Text, Group

display = Text(content="0", ...)  # ❌ Generic name

def handle_number(data):
    display.content = data["label"]  # Captures 'display' by name

btn_9 = Button(label="9")
btn_9.on_update(handle_number)
```

```python
# Cell: Later in notebook
from pynote_ui import Text, display  # ❌ Overwrites calculator's 'display'!

some_text = Text("Hello")
display(some_text)  # Now 'display' is a function
```

**Result**: Calculator buttons don't work after "Run All Cells"

### Fixed Code
```python
# Cell: Calculator
from pynote_ui import Button, Text, Group

calc_display = Text(content="0", ...)  # ✅ Specific name

def handle_number(data):
    calc_display.content = data["label"]  # ✅ Won't collide

btn_9 = Button(label="9")
btn_9.on_update(handle_number)
```

```python
# Cell: Later in notebook
from pynote_ui import Text, display

some_text = Text("Hello")
display(some_text)  # ✅ No collision, 'calc_display' is safe
```

---

## Technical Details

### Why Callbacks Are Affected
Python closures capture variables **by reference (name)**, not by value:

```python
x = "original"

def callback():
    print(x)  # Looks up 'x' in global scope when CALLED, not when DEFINED

x = "modified"
callback()  # Prints: "modified"
```

This is standard Python behavior, not a PyNote bug.

### Why Component Registration Still Works
Components register with StateManager **immediately** during cell execution, capturing their cell_id. Only callback execution is delayed.

```python
display = Text("0")  # ✅ Registered immediately to cell "abc123"

# Later, when 'display' is overwritten:
display = function  # Original Text object still exists in StateManager!

# But callback can't find it:
def on_click(data):
    display.content = "9"  # ❌ 'display' now points to function, not Text
```

---

## Debugging Checklist

When interactive components stop working after "Run All Cells":

- [ ] Check if variable names match common functions (`display`, `input`, `open`, etc.)
- [ ] Search for variable name across all cells (Ctrl+F in notebook)
- [ ] Look for imports that might redefine the variable
- [ ] Test cell individually vs. "Run All Cells" to confirm issue
- [ ] Add `type()` logging in callbacks to identify mismatched types
- [ ] Rename variables with descriptive prefixes
- [ ] Reload page and test with "Run All Cells" again

---

## Future Improvements

Potential solutions being considered:

1. **Static Analysis**: Warn about variable name collisions when editing cells
2. **Scoped Imports**: Import statements could be cell-scoped instead of global
3. **Variable Shadowing Detection**: Flag when later cells redefine callback-referenced variables
4. **Documentation**: Better inline warnings about reserved names

For now, following the naming best practices above will prevent these issues entirely.

---

## Summary

**The Rule**: Treat your notebook like a single Python file where all cells execute in sequence. Any variable defined in Cell N can be overwritten by Cell N+1, breaking earlier callbacks.

**The Solution**: Use descriptive, specific variable names that clearly indicate their purpose and won't accidentally collide with built-ins or library functions.

**Remember**: If it works individually but fails on "Run All Cells", suspect namespace collision!
