import type { CellData } from "../../store";

export const tutorialReactiveCells: CellData[] = [
    // Table of contents (with modified "you are here")
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI Part 1](?open=tutorial_ui_part1)** | Components, colors, sizes, and states |
| **[Interactive UI Part 2](?open=tutorial_ui_part2)** | Layout, sizing, borders, and display functions |
| **[Interactive UI Part 3](?open=tutorial_ui_part3)** | Forms, file uploads, and advanced patterns |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts |
| **[Reactive Execution](?open=tutorial_reactive)** | Automatic cell propagation based on dependencies *(you are here)* |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |

---`
    },

    // ============================================================================
    // INTRODUCTION TO REACTIVE EXECUTION
    // ============================================================================
    {
        id: "tut-react-intro",
        type: "markdown",
        content: `# Reactive Execution Mode

**Reactive Execution** is a powerful feature that automatically re-runs cells when their dependencies change.

## How It Works

When you run a cell in Reactive mode, PyNote:

1. **Analyzes** the cell to find which variables it **defines** and **references**
2. **Builds a dependency graph** (a DAG) of all cells
3. **Automatically runs** all cells that depend on the cell you just ran

This keeps your notebook **always consistent** — no more stale outputs!

## Enabling Reactive Mode

Click the **Kernel menu** (top right) and select **Reactive** under the Execution section.

> ⚡ **Try it now!** Enable Reactive mode before continuing with this tutorial.`
    },

    // ============================================================================
    // PART 1: BASIC DEPENDENCY CHAIN
    // ============================================================================
    {
        id: "tut-react-part1",
        type: "markdown",
        content: `## Part 1: Basic Dependency Chain

Let's start with a simple example. We'll create three cells where each depends on the previous one.

**Instructions:**
1. Make sure **Reactive mode** is enabled
2. Run **Cell 1** (defines \`x\`)
3. Watch as Cells 2 and 3 automatically run!`
    },
    {
        id: "tut-react-chain1",
        type: "code",
        content: `# Cell 1: Define the base variable
x = 10
print(f"x = {x}")`
    },
    {
        id: "tut-react-chain2",
        type: "code",
        content: `# Cell 2: Depends on x
y = x * 2
print(f"y = x * 2 = {y}")`
    },
    {
        id: "tut-react-chain3",
        type: "code",
        content: `# Cell 3: Depends on y (which depends on x)
z = y + 5
print(f"z = y + 5 = {z}")`
    },
    {
        id: "tut-react-chain-note",
        type: "markdown",
        content: `### What Just Happened?

When you ran Cell 1:
- PyNote detected that Cell 2 **references** \`x\` (which Cell 1 **defines**)
- PyNote detected that Cell 3 **references** \`y\` (which Cell 2 **defines**)
- All three cells ran in the correct order: 1 → 2 → 3

**Now try this:** Change \`x = 10\` to \`x = 100\` and run Cell 1 again. Watch the values cascade!`
    },

    // ============================================================================
    // PART 2: DIAMOND DEPENDENCIES
    // ============================================================================
    {
        id: "tut-react-part2",
        type: "markdown",
        content: `## Part 2: Diamond Dependencies

Real notebooks often have more complex dependency patterns. Here's a "diamond" pattern where one variable feeds into two separate calculations, which then combine.

\`\`\`
      [base]
       / \\
   [left] [right]
       \\ /
     [result]
\`\`\`

Run the first cell and watch all four execute in the right order!`
    },
    {
        id: "tut-react-diamond1",
        type: "code",
        content: `# The base value - try changing this!
base = 100
print(f"base = {base}")`
    },
    {
        id: "tut-react-diamond2",
        type: "code",
        content: `# Left branch: divide by 4
left = base / 4
print(f"left = base / 4 = {left}")`
    },
    {
        id: "tut-react-diamond3",
        type: "code",
        content: `# Right branch: divide by 2
right = base / 2
print(f"right = base / 2 = {right}")`
    },
    {
        id: "tut-react-diamond4",
        type: "code",
        content: `# Combine both branches
result = left + right
print(f"result = left + right = {result}")`
    },
    {
        id: "tut-react-diamond-note",
        type: "markdown",
        content: `### Topological Ordering

Notice that PyNote ran the cells in the correct **topological order**:
1. First \`base\` (no dependencies)
2. Then \`left\` and \`right\` (both depend only on \`base\`)  
3. Finally \`result\` (depends on both \`left\` and \`right\`)

This ordering is computed automatically using a **Directed Acyclic Graph (DAG)**.`
    },

    // ============================================================================
    // PART 3: ISOLATED CELLS
    // ============================================================================
    {
        id: "tut-react-part3",
        type: "markdown",
        content: `## Part 3: Isolated Cells Don't Propagate

Not every cell depends on others. Independent cells won't be affected when you run unrelated code.`
    },
    {
        id: "tut-react-iso1",
        type: "code",
        content: `# This cell defines 'alpha'
alpha = 42
print(f"alpha = {alpha}")`
    },
    {
        id: "tut-react-iso2",
        type: "code",
        content: `# This cell defines 'beta' - completely independent!
beta = 99
print(f"beta = {beta}")`
    },
    {
        id: "tut-react-iso-note",
        type: "markdown",
        content: `**Try it:** Run the \`alpha\` cell. Notice that the \`beta\` cell does **not** run because it has no dependency on \`alpha\`.

This is the beauty of reactive execution — it's **surgical**. Only the cells that actually need to update will run.`
    },

    // ============================================================================
    // PART 4: PRACTICAL EXAMPLE - DATA PIPELINE
    // ============================================================================
    {
        id: "tut-react-part4",
        type: "markdown",
        content: `## Part 4: Practical Example — Data Pipeline

Here's a realistic example: a mini data processing pipeline where changing the source data automatically updates all downstream transformations and visualizations.`
    },
    {
        id: "tut-react-data1",
        type: "code",
        content: `# Step 1: Raw data (change these values!)
raw_data = [10, 25, 30, 45, 50, 60, 75, 80, 95, 100]
print(f"Raw data: {raw_data}")`
    },
    {
        id: "tut-react-data2",
        type: "code",
        content: `# Step 2: Filter values above threshold
threshold = 40
filtered = [x for x in raw_data if x > threshold]
print(f"Filtered (>{threshold}): {filtered}")`
    },
    {
        id: "tut-react-data3",
        type: "code",
        content: `# Step 3: Calculate statistics
import statistics

stats = {
    "count": len(filtered),
    "mean": statistics.mean(filtered) if filtered else 0,
    "max": max(filtered) if filtered else 0,
    "min": min(filtered) if filtered else 0,
}
print(f"Statistics: {stats}")`
    },
    {
        id: "tut-react-data4",
        type: "code",
        content: `# Step 4: Generate summary report
report = f"""
📊 Data Pipeline Report
========================
Input:     {len(raw_data)} values
Threshold: {threshold}
Filtered:  {stats['count']} values passed
Mean:      {stats['mean']:.1f}
Range:     {stats['min']} - {stats['max']}
"""
print(report)`
    },
    {
        id: "tut-react-data-note",
        type: "markdown",
        content: `### Try These Experiments

1. **Change the raw data:** Edit \`raw_data\` in Step 1 and run it. Watch the entire pipeline update!

2. **Change the threshold:** Edit \`threshold = 40\` to \`threshold = 70\` and run Step 2. Only Steps 2-4 will re-run (Step 1 is unaffected).

3. **Mixed dependencies:** Notice how Step 4 depends on variables from multiple earlier cells (\`raw_data\`, \`threshold\`, and \`stats\`).`
    },

    // ============================================================================
    // PART 5: UNDERSCORE CONVENTION
    // ============================================================================
    {
        id: "tut-react-part5",
        type: "markdown",
        content: `## Part 5: Local Variables with Underscore

PyNote treats variables starting with \`_\` (underscore) as **local** to the cell. They won't create dependencies.

This is useful for temporary variables you don't want to propagate.`
    },
    {
        id: "tut-react-local-base",
        type: "code",
        content: `# First, define a public variable
base_number = 100
print(f"base_number = {base_number}")`
    },
    {
        id: "tut-react-local1",
        type: "code",
        content: `# Using local variable (_temp) alongside public variable
_temp = 999  # Local - no dependencies created
result_a = base_number + 1
print(f"_temp = {_temp}, result_a = {result_a}")`
    },
    {
        id: "tut-react-local2",
        type: "code",
        content: `# This cell depends on base_number only
result_b = base_number + 2
print(f"result_b = {result_b}")`
    },
    {
        id: "tut-react-local-note",
        type: "markdown",
        content: `**Key insight:** When you re-run a cell, **all downstream cells that reference its defined variables are re-run**, regardless of whether the values actually changed.

**Try it:**
1. Run all three cells above (if not already run)
2. Clear the output of the third cell
3. Edit the second cell to change **only** \`_temp = 999\` to \`_temp = 1\` 
4. Re-run the second cell

**What happens:** The third cell **WILL run** because you re-executed a cell that defines \`result_a\`, which the dependency graph shows.

**Why underscore variables matter:** While you can't prevent downstream cells from running when you re-execute a cell, underscore variables prevent cells from becoming downstream in the first place. The third cell does NOT depend on \`_temp\`, so if you had a cell that only read \`_temp\`, it wouldn't have been added to the dependency graph at all.

**Better demonstration:** Create a new cell after the second cell with just \`print(_temp)\`. You'll get the value of \`_temp\`, but when you change the value of \`_temp\` in the second cell and rerun the cell, notice that the value printed by the cell you just created does not update to display the new value.`
    },

    // ============================================================================
    // PART 6: COMPARING EXECUTION MODES
    // ============================================================================
    {
        id: "tut-react-part6",
        type: "markdown",
        content: `## Part 6: Execution Modes Compared

PyNote offers four execution modes. Here's when to use each:

| Mode | Behavior | Best For |
|------|----------|----------|
| **Sequential** | Cells run one at a time, in queue order | Predictable, ordered execution |
| **Hybrid** | Can run non-adjacent cells in parallel | Balanced performance |
| **Concurrent** | All cells can run simultaneously | Maximum speed (careful with order!) |
| **Reactive** | Auto-runs dependent cells | Data pipelines, exploration |

### When to Use Reactive Mode

✅ **Great for:**
- Exploratory data analysis
- Parameter tuning (change one value, see all effects)
- Building data pipelines
- Teaching/demonstrations

⚠️ **Be careful with:**
- Long-running cells (they'll re-run automatically)
- Cells with side effects (file writes, API calls)
- Very large dependency graphs`
    },

    // --- Next Steps ---
    {
        id: "tut-react-next",
        type: "markdown",
        content: `---

## 🎉 Reactive Execution Complete!

You now understand how PyNote's reactive execution mode works:

- **Dependency Analysis**: PyNote analyzes which variables each cell defines and references
- **DAG Construction**: A directed graph determines execution order
- **Automatic Propagation**: Running a cell triggers all its dependents
- **Local Variables**: Use \`_underscore\` prefix for cell-local variables

| Next Tutorial | What You'll Learn |
|---------------|-------------------|
| **[API Reference](?open=tutorial_api)** | Complete reference for all components |

Happy coding! 🐍⚡`
    }
];
