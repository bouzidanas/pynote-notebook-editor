# Builtins Shadow Detection in Completions

**Related:** 2b in `performance-review-action-items.md`

## Problem

The `_builtins_cache` pre-computes type info for `dir(builtins)` + `dir(pynote_ui)` once at first use. If a user shadows a builtin name in their globals (e.g. `list = [1, 2, 3]` or `input = "hello"`), the completion type icon will show the cached builtin type ("class"/"function") instead of the user's actual type ("variable").

The **name still appears** in completions — only the type classification is wrong.

## Current Behavior

```python
# In _build_builtins_cache():
#   list -> {"label": "list", "type": "class"}
#
# User writes: list = [1, 2, 3]
# Completion still shows list as "class" instead of "variable"
```

The global scope path skips names present in `_builtins_cache`, so the user's shadowed version is never re-inspected:
```python
user_names = [k for k in globals().keys() if k not in _builtins_cache]
```

## Fix (when warranted)

In the global scope completion loop, check if any cached builtin name is also in `globals()` and re-classify from the user's version:

```python
for name, item in _builtins_cache.items():
    if name in globals():
        obj = globals()[name]
        result.append({"label": name, "type": _classify(obj, inspect)})
    else:
        result.append(item)
```

This adds one `globals()` dict lookup per cached name (~150 lookups) — cheap, but not free. Could also be done only for the **filtered** matches (names matching the partial), which would typically be <10 lookups.

## Impact

Low. Shadowing builtins is uncommon in practice, and the consequence is purely cosmetic (wrong icon in the autocomplete dropdown). No functional breakage.
