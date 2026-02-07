# Add `.options()` Configuration Method to All UI Components

## Summary
Introduces a new `.options(**kwargs)` method to all 10 pynote_ui components, providing a cleaner API for post-initialization property updates. Also renames Select component's `options` parameter to `choices` to avoid naming collision.

## Changes

### 1. New `.options()` Method
All components now support the `.options(**kwargs)` method for updating properties after creation:

```python
# Create with minimal config
slider = Slider(value=50)

# Configure styling separately
slider.options(label="Volume", width="100%", color="primary", size="lg")

# Method chaining supported
status = Text(content="Ready").options(border="2px solid blue", size="lg")
```

**Benefits:**
- Separates data/content from styling configuration
- More readable and maintainable code
- Enables method chaining (returns self)
- Cleaner initialization

**Implementation:**
- Added to all 10 components in both `pyodide.worker.ts` and external package (`elements.py`)
- Updates properties via `send_update()` for live reactivity
- Returns self for chaining support

### 2. Select Component Parameter Rename
**Breaking Change (Backward Compatible):**
- Parameter renamed: `options` → `choices`
- Property renamed: `select.options` → `select.choices`
- Internal handling maintains backward compatibility with frontend

```python
# Old (still works internally, but deprecated)
Select(options=["A", "B", "C"])

# New (recommended)
Select(choices=["A", "B", "C"])
```

### 3. Tutorial Updates
- Updated all 13 Select instances across tutorials to use `choices`
- Added comprehensive Test 5 in testing notebook demonstrating `.options()` usage
- Updated API documentation with new method signature

### 4. Bug Fixes
- Removed debug print statements from `StateManager.send_update()` that polluted stdout
- Fixed tutorial examples to use proper Select parameter name

## Components Updated
All 10 components now have `.options()` method:
1. Slider
2. Text  
3. Group
4. Form
5. Button
6. Select
7. Input
8. Textarea
9. Toggle
10. Checkbox

## Files Modified
- `src/lib/pyodide.worker.ts` - Worker implementation (10 components)
- `packages/pynote_ui/src/pynote_ui/elements.py` - External package (10 components)
- `src/lib/tutorials/tutorial-testing.ts` - Added Test 5 + fixed Select usage
- `src/lib/tutorials/tutorial-ui.ts` - Fixed Select parameter names
- `src/lib/tutorials/tutorial-ui-part1.ts` - Fixed Select parameter names
- `src/lib/tutorials/tutorial-ui-part2.ts` - Fixed Select parameter names
- `src/lib/tutorials/tutorial-api.ts` - Updated API docs

## Testing
✅ Test 5 added to testing notebook (`?open=testing`)
✅ All existing tests still pass
✅ Backward compatible (no breaking changes to frontend)
✅ Method chaining verified

## Migration Guide
**For users:**
- Update Select components to use `choices=` instead of `options=`
- Optionally adopt `.options()` method for cleaner code organization

**Example migration:**
```python
# Before
slider = Slider(value=50, label="Volume", width="100%", color="primary", size="lg")

# After
slider = Slider(value=50)
slider.options(label="Volume", width="100%", color="primary", size="lg")
```
