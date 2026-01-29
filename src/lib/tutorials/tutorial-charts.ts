import type { CellData } from "../store";

export const tutorialChartsCells: CellData[] = [
    // Table of contents
    {
        id: "toc-header",
        type: "markdown",
        content: `# 📚 PyNote Tutorial Series

Welcome! This tutorial is split into focused sections. Click any link below to navigate.

| Section | Description |
|---------|-------------|
| **[Quick Start](?open=tutorial)** | The basics: kernel, cells, outputs, markdown |
| **[Interactive UI](?open=tutorial_ui)** | Sliders, text, groups, layouts, and display functions |
| **[Charts & Plotting](?open=tutorial_charts)** | Observable Plot, uPlot TimeSeries, and Frappe Charts *(you are here)* |
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components |


---`
    },

    // ============================================================================
    // INTERACTIVE CHARTS
    // ============================================================================
    {
        id: "tut-charts-intro",
        type: "markdown",
        content: "# Interactive Charts\n\nPyNote includes three lightweight charting libraries that integrate with `pynote_ui`. Charts are **lazy-loaded** — they only download when you first use them, keeping the app fast.\n\n| Component | Library | Best For | Size |\n|-----------|---------|----------|------|\n| `Plot` | Observable Plot | Flexible, declarative plots with channels, transforms, scales | ~55KB |\n| `TimeSeries` | uPlot | High-performance time series (100K+ points) | ~15KB |\n| `Chart` | Frappe Charts | Pie, donut, percentage charts | ~16KB |\n\nObservable Plot is particularly powerful with support for **15+ mark types**, data **channels** (position, color, size), **transforms** (sort, bin, stack), and smooth **curve interpolation**."
    },

    // --- Section: Basic Plotting ---
    {
        id: "tut-charts-basic",
        type: "markdown",
        content: "## Basic Plotting with `Plot`\n\n`Plot` uses Observable Plot — a modern, declarative charting library. Pass your data as a list of dictionaries and use **channels** to map data columns to visual properties.\n\nYou can also use convenience functions: `scatter()`, `line()`, `area()`, `bar()`, `histogram()`, `boxplot()`, `heatmap()`, `density()`, and `rule()`."
    },
    {
        id: "tut-demo-plot-basic",
        type: "code",
        content: "from pynote_ui.oplot import Plot\nimport numpy as np\n\n# Generate sine wave data\nx = np.linspace(0, 4 * np.pi, 100)\ndata = [{\"x\": xi, \"y\": np.sin(xi)} for xi in x]\n\nPlot(data, x=\"x\", y=\"y\", mark=\"line\", title=\"Sine Wave\")"
    },
    {
        id: "tut-demo-plot-scatter",
        type: "code",
        content: "from pynote_ui.oplot import scatter\nimport numpy as np\n\n# Scatter plot with multiple visual encodings\nnp.random.seed(42)\nn = 50\ndata = [\n    {\n        \"x\": np.random.randn(), \n        \"y\": np.random.randn(), \n        \"size\": np.random.uniform(2, 10),  # Varying size\n        \"category\": \"A\" if i < 25 else \"B\"\n    }\n    for i in range(n)\n]\n\n# Using convenience function with channels\nscatter(\n    data, x=\"x\", y=\"y\", \n    fill=\"category\",  # Color by category\n    r=\"size\",           # Size by data\n    opacity=0.7,\n    title=\"Multi-Channel Scatter\",\n    titleStyle={\"fontSize\": \"18px\", \"color\": \"#8b5cf6\"},\n    gridStyle={\"stroke\": \"#e2e8f0\", \"strokeOpacity\": 0.5}\n)"
    },

    // --- Section: Plot vs Convenience Functions ---
    {
        id: "tut-charts-convenience",
        type: "markdown",
        content: "### `Plot()` vs Convenience Functions\n\nYou have two ways to create plots:\n\n**1. `Plot()` - The General Class**\n- Specify the `mark` type explicitly (`\"line\"`, `\"dot\"`, `\"barY\"`, etc.)\n- Access to all parameters and options\n- Most flexible for any plot type\n\n```python\nPlot(data, x=\"x\", y=\"y\", mark=\"dot\", fill=\"category\")\nPlot(data, x=\"x\", y=\"y\", mark=\"line\", curve=\"catmull-rom\")\n```\n\n**2. Convenience Functions - Specialized Shortcuts**\n- Pre-set mark types: `scatter()`, `line()`, `area()`, `bar()`, `histogram()`, etc.\n- More readable and self-documenting code\n- Still accept `**kwargs` for full flexibility\n\n```python\nscatter(data, x=\"x\", y=\"y\", fill=\"category\")  # Same as Plot with mark=\"dot\"\nline(data, x=\"x\", y=\"y\", curve=\"catmull-rom\")  # Same as Plot with mark=\"line\"\n```\n\n**Under the hood**, convenience functions just call `Plot()` with specific defaults. Use whichever feels clearer for your code!"
    },

    // --- Section: Advanced Plot Features ---
    {
        id: "tut-charts-advanced",
        type: "markdown",
        content: "### Advanced Observable Plot Features\n\nObservable Plot supports powerful features:\n- **Channels**: Map data to visual properties (`fill`, `stroke`, `r`, `symbol`, `opacity`)\n- **Transforms**: Sort, filter, bin data (`sort`, `thresholds`, `reduce`)\n- **Curves**: Smooth interpolation (`curve=\"catmull-rom\"`, `\"basis\"`, `\"step\"`)\n- **Mark Types**: 15+ types including `line`, `dot`, `bar`, `area`, `rect`, `cell`, `rule`, `box`, `density`"
    },
    {
        id: "tut-demo-plot-curves",
        type: "code",
        content: "from pynote_ui.oplot import line\nimport numpy as np\n\n# Demonstrate different curve interpolations\nx = np.linspace(0, 10, 20)  # Only 20 points!\ndata = []\nfor curve_type in [\"linear\", \"step\", \"basis\", \"catmull-rom\"]:\n    data.extend([\n        {\"x\": xi, \"y\": np.sin(xi), \"curve\": curve_type}\n        for xi in x\n    ])\n\n# Use z channel for series grouping\nline(data, x=\"x\", y=\"y\", z=\"curve\", stroke=\"curve\",\n     strokeWidth=2, marker=\"dot\",\n     title=\"Curve Interpolation Comparison\")"
    },
    {
        id: "tut-demo-plot-bar-sorted",
        type: "code",
        content: "from pynote_ui.oplot import bar\nimport numpy as np\n\n# Sorted bar chart with transform\nnp.random.seed(42)\nproducts = [f\"Product {chr(65+i)}\" for i in range(8)]\ndata = [\n    {\"product\": p, \"sales\": int(np.random.uniform(100, 1000))}\n    for p in products\n]\n\n# Sort by descending sales using transform\nbar(data, x=\"product\", y=\"sales\",\n    sort={\"x\": \"-y\"},  # Sort x by negative y (descending)\n    fill=\"#8b5cf6\", inset=4,\n    title=\"Top Products (Auto-Sorted)\")"
    },
    {
        id: "tut-demo-plot-histogram",
        type: "code",
        content: "from pynote_ui.oplot import histogram\nimport numpy as np\n\n# Grouped histogram with binning\nnp.random.seed(42)\ndata = []\nfor sex in [\"Male\", \"Female\"]:\n    heights = np.random.normal(170 if sex == \"Male\" else 165, 8, 200)\n    data.extend([{\"height\": h, \"sex\": sex} for h in heights])\n\nhistogram(data, x=\"height\", fill=\"sex\",\n          bins=30, stat=\"proportion\",\n          title=\"Height Distribution by Sex\",\n          xLabel=\"Height (cm)\",\n          yLabel=\"Proportion\",\n          yDomain=[0, 0.15])"
    },

    // --- Section: Interactive Plot with Slider ---
    {
        id: "tut-charts-interactive",
        type: "markdown",
        content: "## Interactive Charts with UI Controls\n\nThe real power comes from combining charts with `pynote_ui` sliders. When the slider changes, we update the plot's data — the chart re-renders automatically!\n\n**Try it:** Move the frequency slider below to see the sine wave change in real-time."
    },
    {
        id: "tut-demo-plot-interactive",
        type: "code",
        content: "from pynote_ui.oplot import Plot\nfrom pynote_ui import Slider, Group\nimport numpy as np\n\n# Create frequency slider with fine steps for smooth animation\nfreq_slider = Slider(min=1, max=10, value=2, step=0.1, label=\"Frequency\", width=\"100%\")\n\n# Generate initial data\nx = np.linspace(0, 2 * np.pi, 200)\ninitial_data = [{\"x\": xi, \"y\": np.sin(2 * xi)} for xi in x]\n\n# Create the plot (full width)\nwave_plot = Plot(\n    initial_data, \n    x=\"x\", y=\"y\", \n    mark=\"line\",\n    title=\"Interactive Sine Wave\",\n    width=\"full\",\n    yDomain=[-1.5, 1.5]  # Fix y-axis so it doesn't jump around\n)\n\n# Update plot when slider changes\ndef update_wave(data):\n    freq = data[\"value\"]\n    new_data = [{\"x\": xi, \"y\": np.sin(freq * xi)} for xi in x]\n    wave_plot.data = new_data  # This triggers a re-render!\n\nfreq_slider.on_update(update_wave)\n\n# Display together\nGroup([freq_slider, wave_plot], layout=\"col\")"
    },

    // --- Section: Multiple Controls ---
    {
        id: "tut-charts-multicontrol",
        type: "markdown",
        content: "### Multiple Parameters\n\nYou can control multiple aspects of a visualization simultaneously. Here's a wave with both **frequency** and **amplitude** controls."
    },
    {
        id: "tut-demo-plot-multi",
        type: "code",
        content: `from pynote_ui.oplot import Plot
from pynote_ui import Slider, Group, Text
import numpy as np

# Create sliders with fine steps for smooth animation
freq = Slider(min=1, max=8, value=3.0, step=0.1, label="Frequency", grow=1)
amp = Slider(min=0.1, max=2.0, value=1.0, step=0.05, label="Amplitude", grow=1)
info = Text(content="f=3.0, A=1.0", width="100%", align_h="center")

# X values (constant)
x = np.linspace(0, 2 * np.pi, 200)

# Create the plot with initial wave
wave = Plot(
    [{"x": xi, "y": 1.0 * np.sin(3.0 * xi)} for xi in x],
    x="x", y="y", mark="area",
    title="Amplitude × sin(Frequency × x)",
    width="full",
    yDomain=[-2.5, 2.5]
)

# Update functions - each slider triggers a full recalculation
def update_freq(data):
    f = data["value"]  # Get new freq from event
    a = amp.value      # Get current amplitude
    wave.data = [{"x": xi, "y": a * np.sin(f * xi)} for xi in x]
    info.content = f"f={f:.1f}, A={a:.1f}"

def update_amp(data):
    f = freq.value     # Get current frequency
    a = data["value"]  # Get new amp from event
    wave.data = [{"x": xi, "y": a * np.sin(f * xi)} for xi in x]
    info.content = f"f={f:.1f}, A={a:.1f}"

freq.on_update(update_freq)
amp.on_update(update_amp)

Group([
    Group([freq, amp], layout="row"),
    info,
    wave
], layout="col", label="Wave Generator")`
    },

    // --- Section: Bar Charts ---
    {
        id: "tut-charts-bar",
        type: "markdown",
        content: "## Bar Charts with Frappe\n\nBar charts work great for categorical data. Use the `Chart` component with `type=\"bar\"`."
    },
    {
        id: "tut-demo-bar",
        type: "code",
        content: "from pynote_ui.fplot import Chart\nfrom pynote_ui import Slider, Group\n\n# Interactive bar chart with custom styling\nbar_slider = Slider(min=0, max=100, value=50, step=1, label=\"Adjust 'Product B'\", width=\"100%\")\n\nbar_chart = Chart(\n    type=\"bar\",\n    data={\n        \"labels\": [\"Product A\", \"Product B\", \"Product C\", \"Product D\"],\n        \"datasets\": [{\"name\": \"Sales\", \"values\": [30, 50, 20, 40]}]\n    },\n    title=\"Product Sales\",\n    titleStyle={\"fontWeight\": \"700\"},  # Extra bold title\n    width=\"full\",\n    height=280\n)\n\ndef update_bar(data):\n    new_val = int(data[\"value\"])\n    bar_chart.data = {\n        \"labels\": [\"Product A\", \"Product B\", \"Product C\", \"Product D\"],\n        \"datasets\": [{\"name\": \"Sales\", \"values\": [30, new_val, 20, 40]}]\n    }\n\nbar_slider.on_update(update_bar)\nGroup([bar_slider, bar_chart], layout=\"col\")"
    },

    // --- Section: Pie Charts ---
    {
        id: "tut-charts-pie",
        type: "markdown",
        content: "## Pie & Donut Charts\n\nPerfect for showing proportions. Try `type=\"pie\"` or `type=\"donut\"`."
    },
    {
        id: "tut-demo-pie",
        type: "code",
        content: "from pynote_ui.fplot import Chart\nfrom pynote_ui import Slider, Text, Group\n\n# Budget allocation pie chart\nbudget_slider = Slider(min=10, max=60, value=35, step=1, label=\"Marketing Budget %\", width=\"100%\")\nremaining = Text(content=\"Engineering: 39%, Operations: 26%\", width=\"100%\", align_h=\"center\")\n\npie = Chart(\n    type=\"donut\",\n    data={\"labels\": [\"Marketing\", \"Engineering\", \"Operations\"], \"values\": [35, 39, 26]},\n    title=\"Budget Allocation\",\n    width=\"full\",\n    height=300\n)\n\ndef update_pie(data):\n    marketing = int(data[\"value\"])\n    other = 100 - marketing\n    # Split remaining between Engineering (60%) and Operations (40%)\n    eng = int(other * 0.6)\n    ops = other - eng\n    pie.data = {\"labels\": [\"Marketing\", \"Engineering\", \"Operations\"], \"values\": [marketing, eng, ops]}\n    remaining.content = f\"Engineering: {eng}%, Operations: {ops}%\"\n\nbudget_slider.on_update(update_pie)\nGroup([budget_slider, remaining, pie], layout=\"col\")"
    },

    // --- Section: Time Series ---
    {
        id: "tut-charts-timeseries",
        type: "markdown",
        content: "## High-Performance Time Series\n\n`TimeSeries` uses uPlot — the fastest chart library for time data. It can handle **100,000+ points** smoothly!"
    },
    {
        id: "tut-demo-timeseries",
        type: "code",
        content: "from pynote_ui.uplot import TimeSeries\nfrom pynote_ui import Slider, Group\nimport numpy as np\nimport time\n\n# Generate 5000 data points (fast!)\nn = 5000\nnow = int(time.time())\ntimestamps = list(range(now - n, now))\n\n# Random walk stock price simulation\nnp.random.seed(42)\nreturns = np.random.randn(n) * 0.02  # 2% daily volatility\nprice = 100 * np.exp(np.cumsum(returns))  # Geometric random walk\n\n# Volatility slider with fine steps\nvol_slider = Slider(min=1, max=5, value=2, step=0.1, label=\"Volatility (%)\", width=\"100%\")\n\nts = TimeSeries(\n    data={\"x\": timestamps, \"price\": price.tolist()},\n    series=[{\"label\": \"Stock Price\"}],  # Uses theme accent color by default\n    yLabel=\"Price ($)\",\n    title=\"Simulated Stock Price (5,000 points)\",\n    width=\"full\",\n    height=320\n)\n\ndef regenerate(data):\n    vol = data[\"value\"] / 100\n    new_returns = np.random.randn(n) * vol\n    new_price = 100 * np.exp(np.cumsum(new_returns))\n    ts.data = {\"x\": timestamps, \"price\": new_price.tolist()}\n\nvol_slider.on_update(regenerate)\nGroup([vol_slider, ts], layout=\"col\")"
    },
    {
        id: "tut-demo-timeseries-2",
        type: "code",
        content: "from pynote_ui.uplot import TimeSeries\nimport numpy as np\nimport time\n\n# Simple sine wave example\nn = 1000\nnow = int(time.time())\ntimestamps = list(range(now - n, now))\n\n# Generate sine and cosine waves\nt = np.linspace(0, 4 * np.pi, n)\nsine_wave = np.sin(t).tolist()\ncosine_wave = np.cos(t).tolist()\n\nTimeSeries(\n    data={\"x\": timestamps, \"sin\": sine_wave, \"cos\": cosine_wave},\n    series=[{\"label\": \"Sine\"}, {\"label\": \"Cosine\"}],\n    title=\"Trigonometric Functions\",\n    width=\"full\",\n    height=280\n)"
    },

    // --- Next Steps ---
    {
        id: "tut-charts-next",
        type: "markdown",
        content: `---

## 🎉 Charts & Plotting Complete!

You now know how to create beautiful, interactive visualizations. Continue to the API Reference for complete details:

| Next Tutorial | What You'll Learn |
|---------------|-------------------|
| **[API Reference](?open=tutorial_api)** | Complete reference for all \`pynote_ui\` components and chart types |

Or go back to **[Quick Start](?open=tutorial)** or **[Interactive UI](?open=tutorial_ui)**.`
    }
];
