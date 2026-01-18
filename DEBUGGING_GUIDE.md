# Debugging & Problem-Solving Guide

## Core Philosophy: Understand, Don't Patch

When encountering bugs or unexpected behavior, resist the urge to immediately add workaround code. Instead, investigate the root cause.

## The Diagnostic Process

### 1. **Compare Working vs Broken Scenarios**
- If feature X works in situation A but fails in situation B, what's different?
- Example: "Clicking the border works fine, but clicking the handle triggers premature effects"
- **Action**: Examine the code differences between the two paths

### 2. **Question Duplicate Logic**
- If the same functionality appears in multiple places, one is likely redundant or conflicting
- Example: `{...sortable.dragActivators}` on both container AND handle
- **Red Flag**: When you see the same props/handlers applied to nested elements

### 3. **Understand Library Behavior**
- Read how the library/framework is designed to work
- Event bubbling, prop spreading, context propagation - these exist for a reason
- **Question**: "Does the child element need its own activators, or does it inherit from parent?"

### 4. **Look for Existing Misconfigurations**
- Bug might be caused by incorrect setup, not missing features
- **Better to fix 1 line** than add 40 lines of compensation code

## Red Flags That Suggest Wrong Approach

- [ ] Adding global state just to track built-in library behavior
- [ ] Creating complex threshold/distance calculations for what should be simple
- [ ] Writing code that "detects" what the library already knows
- [ ] Each fix requires more fixes (cascading patches)
- [ ] Solution involves multiple timers, flags, or tracking variables

## The Right Approach Checklist

- [ ] **Investigate first**: Why does it work here but not there?
- [ ] **Check documentation**: How is this library/feature intended to be used?
- [ ] **Look for redundancy**: Am I doing something twice?
- [ ] **Test hypotheses**: Remove suspected duplicates and see what breaks
- [ ] **Simplify**: Can I solve this by removing code rather than adding it?

## Case Study: Drag Handle Issue

### ❌ Wrong Approach (What We Almost Did)
```tsx
// Added 40+ lines of global tracking
(window as any).isDraggingActive = false;
(window as any).dragStartX/Y = ...;
// Complex distance calculations
if (Math.sqrt(dx*dx + dy*dy) > 5) ...
// Conditional rendering based on custom state
showIndicator() && isDraggingActive()
```

### ✅ Right Approach (What Actually Worked)
```tsx
// Removed ONE duplicate line
// Before: dragActivators on BOTH container and handle
// After: dragActivators ONLY on container (handle inherits)
```

**Result**: 1 line removed > 40+ lines added

## Key Questions to Ask Before Coding

1. "Does this library already handle what I'm trying to manually implement?"
2. "Am I duplicating functionality that exists elsewhere?"
3. "Why does this work in scenario A? What's missing in scenario B?"
4. "Can I fix this by removing/correcting code rather than adding new code?"
5. "If I have to add tracking variables, am I fighting the framework?"

## When to Add Code vs Fix Existing Code

### Add New Code When:
- Implementing genuinely new functionality
- Library doesn't provide needed behavior
- Extending/customizing beyond library's scope

### Fix Existing Code When:
- Something works partially (some clicks yes, others no)
- Similar functionality exists elsewhere
- You're adding "detectors" for states the library manages
- The fix feels like a workaround rather than a solution

## Remember

> **Simple is better than complex.**  
> **Understanding is better than patching.**  
> **One correct line is better than forty workaround lines.**

---

*Created: January 17, 2026*  
*Context: Drag handle interference issue - solved by removing duplicate dragActivators*
