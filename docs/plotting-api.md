# Observable Plot API in PyNote

## Overview

PyNote exposes the full power of **Observable Plot** through the `oplot.Plot` class and convenience functions. Observable Plot is a flexible, declarative plotting library that uses a **mark-based architecture** with **channels**, **transforms**, and **scales**.

## Key Concepts

### Marks
Geometric shapes that represent data:
- **line/lineX/lineY**: Connected lines
- **dot**: Scatter points
- **bar/barX/barY**: Bars from baseline
- **area/areaX/areaY**: Filled areas
- **rect/rectX/rectY**: Rectangles (histograms, heatmaps)
- **cell**: Grid cells (heatmaps)
- **rule/ruleX/ruleY**: Reference lines
- **box/boxX/boxY**: Box plots
- **density**: Contour density plots
- **text**: Labels

### Channels
Data encodings that can vary per data point:

**Position**: `x`, `y`, `z` (series grouping)
**Style**: `fill`, `stroke`, `opacity`, `strokeWidth`, `fillOpacity`, `strokeOpacity`
**Dimensions**: `r` (radius), `symbol`, `rotate`
**Bounds**: `x1`, `x2`, `y1`, `y2` (for rect/area marks)

Channels can be:
- **Column names** (string): `x="age"` → maps data column to visual property
- **Constants**: `fill="#ff0000"` → applies same value to all points
- **Arrays/lists**: Direct data values

### Transforms
Data operations applied before rendering:
- **sort**: Sort data points by column or specification
- **filter**: Filter data points
- **bin** / **thresholds**: Create histograms
- **interval**: Regularize time series
- **reduce**: Aggregation functions (count, sum, mean, median, etc.)
- **stack**: Automatically stacks series (implicit for barY with fill channel)

### Scales
Map abstract values to visual properties:
- **Types**: `"linear"`, `"log"`, `"sqrt"`, `"pow"`, `"time"`, `"utc"`, `"band"`, `"point"`, `"ordinal"`
- **Domains**: Set explicit ranges (`xDomain=[0, 100]`, `yDomain=["low", "high"]`)

## Basic Usage

### Using Plot() directly

```python
from pynote_ui.oplot import Plot
import numpy as np

# Generate data
x = np.linspace(0, 10, 100)
data = [{"x": xi, "y": np.sin(xi)} for xi in x]

# Simple line plot
Plot(data, x="x", y="y", mark="line")

# Scatter plot with size encoding
Plot(data, x="x", y="y", mark="dot", r="y", fill="#8b5cf6")

# Multi-series line with color
series_data = [
    {"x": i, "y": np.sin(i), "series": "sin"},
    {"x": i, "y": np.cos(i), "series": "cos"}
    for i in x
]
Plot(series_data, x="x", y="y", z="series", stroke="series", mark="line")

# Smooth curve interpolation
Plot(data, x="x", y="y", mark="line", curve="catmull-rom")

# Bar chart with sorting
Plot(bar_data, x="category", y="value", mark="barY", sort={x: "-y"})
```

### Using Convenience Functions

Convenience functions provide simpler interfaces with smart defaults:

```python
from pynote_ui.oplot import scatter, line, area, bar, histogram, boxplot, heatmap, density, rule

# Scatter plot
scatter(data, x="weight", y="height", fill="sex", r="age")

# Line plot with smooth curve
line(data, x="date", y="value", curve="catmull-rom")

# Multi-series line
line(data, x="date", y="value", z="series", stroke="series")

# Bar chart sorted by value
bar(data, x="category", y="value", sort={x: "-y"})

# Histogram with 20 bins
histogram(data, x="value", thresholds=20)

# Grouped histogram
histogram(data, x="age", fill="sex", reduce="proportion")

# Heatmap
heatmap(grid_data, x="hour", y="day", fill="temperature")

# Reference line
rule(y=0, stroke="red", strokeWidth=2)
```

## Advanced Features

### Channel Flexibility

Channels can vary per point, enabling rich encodings:

```python
# Size proportional to population, color by region
scatter(cities, x="gdp", y="life_expectancy", 
        r="population", fill="region")

# Symbol type by category
scatter(data, x="x", y="y", symbol="category")

# Opacity by confidence
scatter(predictions, x="x", y="y_pred", opacity="confidence")
```

### Transforms

```python
# Stacked area chart (implicit stack)
area(data, x="date", y="value", fill="category")

# Binned 2D histogram
heatmap(points, x="x", y="y", fill="count", thresholds=50)

# Time series with daily interval
line(data, x="timestamp", y="value", interval="day")

# Filtered data
scatter(data, x="x", y="y", filter=lambda d: d["x"] > 0)
```

### Curve Options

Available for `line` and `area` marks:

- `"linear"`: Straight lines (default)
- `"step"`: Step function
- `"step-before"`: Step before point
- `"step-after"`: Step after point  
- `"basis"`: B-spline
- `"cardinal"`: Cardinal spline
- `"catmull-rom"`: Catmull-Rom spline (smooth!)
- `"monotone-x"`: Monotonic in x
- `"monotone-y"`: Monotonic in y
- `"natural"`: Natural cubic spline

```python
line(data, x="x", y="y", curve="catmull-rom")  # Smooth
line(data, x="x", y="y", curve="step")  # Stepped
```

### Mark-Specific Options

**Lines:**
- `marker`: Add endpoint markers (`"dot"`, `"arrow"`, `"circle"`)
- `strokeWidth`: Line width
- `strokeDasharray`: Dash pattern

**Dots:**
- `r`: Radius (constant or channel)
- `symbol`: Shape (`"circle"`, `"square"`, `"diamond"`, `"triangle"`, `"star"`, `"cross"`, `"wye"`, etc.)

**Bars/Rects:**
- `inset`: Gap between bars (pixels)
- `insetTop`, `insetRight`, `insetBottom`, `insetLeft`: Individual insets

**Cells (heatmaps):**
- `inset`: Gap between cells
- `stroke`: Border color

### App-Specific Styling

PyNote adds custom styling beyond Observable Plot:

```python
Plot(data, x="x", y="y", mark="line",
     # Layout
     width="full",  # or pixels or "100%"
     height=400,
     grow=True,     # Flex grow
     shrink=False,  # Flex shrink
     force_dimensions=True,  # Override flex
     
     # Appearance
     title="My Chart",
     border=True,
     borderRadius="8px",
     borderWidth=2,
     borderColor="#e5e7eb",
     grid="both",  # True, False, "x", "y", "both"
     
     # Style overrides
     titleStyle={"fontSize": "20px", "fontWeight": "600", "color": "#8b5cf6"},
     xLabelStyle={"fontSize": "14px"},
     yLabelStyle={"fontSize": "14px"},
     tickStyle={"color": "#6b7280"},
     gridStyle={"stroke": "#e5e7eb", "strokeOpacity": 0.5},
     axisStyle={"stroke": "#9ca3af"}
)
```

## Examples

### 1. Smooth Multi-Series Line Chart

```python
import numpy as np
from pynote_ui.oplot import line

t = np.linspace(0, 4*np.pi, 200)
data = []
for name, fn in [("sin", np.sin), ("cos", np.cos), ("tan", lambda x: np.tan(x) % 5)]:
    data.extend([{"t": ti, "value": fn(ti), "func": name} for ti in t])

line(data, x="t", y="value", z="func", stroke="func", 
     curve="catmull-rom", strokeWidth=2.5,
     title="Trigonometric Functions",
     titleStyle={"fontSize": "18px", "fontWeight": "600"})
```

### 2. Scatter Plot with Size and Color

```python
from pynote_ui.oplot import scatter

# Iris dataset example
scatter(iris, x="sepal_length", y="sepal_width",
        fill="species", r="petal_length",
        opacity=0.7, title="Iris Dataset",
        xLabel="Sepal Length (cm)", yLabel="Sepal Width (cm)")
```

### 3. Sorted Bar Chart

```python
from pynote_ui.oplot import bar

bar(sales, x="product", y="revenue", 
    fill="#8b5cf6", sort={x: "-y"},  # Sort by descending revenue
    inset=4, title="Top Products")
```

### 4. Stacked Area Chart

```python
from pynote_ui.oplot import area

# Data with multiple categories over time
area(time_series, x="date", y="value", fill="category",
     curve="basis", title="Market Share Over Time")
```

### 5. Histogram with Groups

```python
from pynote_ui.oplot import histogram

histogram(measurements, x="height", fill="sex", 
          thresholds=30, reduce="proportion",
          title="Height Distribution")
```

### 6. Heatmap

```python
from pynote_ui.oplot import heatmap

# 2D histogram / heatmap
heatmap(points, x="x", y="y", fill="density",
        thresholds=50, inset=0,  # No gaps
        title="Density Heatmap")
```

### 7. Box Plot

```python
from pynote_ui.oplot import boxplot

boxplot(experiments, x="treatment", y="response",
        fill="group", title="Treatment Effects")
```

### 8. Reference Lines

```python
from pynote_ui.oplot import rule

# Horizontal line at y=0
rule(y=0, stroke="red", strokeWidth=1.5, strokeDasharray=None)

# Multiple vertical lines
rule(x=[1, 2, 3], stroke="gray", strokeDasharray="4 2")
```

## Pass-Through Options

All Observable Plot options can be passed through via `**kwargs`:

```python
Plot(data, x="x", y="y", mark="dot",
     # Any Observable Plot option works:
     mixBlendMode="multiply",
     tip=True,  # Show tooltips
     channels={"custom": "myColumn"},
     # ... etc
)
```

## Summary: When to Use What

- **`Plot()`**: Maximum flexibility, direct control over mark type and all options
- **Convenience functions**: Quick plots with sensible defaults
- **Channels** (`x`, `y`, `fill`, `stroke`, `r`, etc.): Vary visual properties per data point
- **Transforms** (`sort`, `thresholds`, `interval`, etc.): Process data before rendering
- **Curves**: Smooth lines with interpolation
- **App styling** (`titleStyle`, `gridStyle`, etc.): Customize appearance beyond Observable Plot
- **`**kwargs`**: Pass any other Observable Plot option not explicitly listed

## More Information

- **Observable Plot Docs**: https://observablehq.com/plot/
- **Mark Types**: https://observablehq.com/plot/marks
- **Transforms**: https://observablehq.com/plot/transforms
- **Scales**: https://observablehq.com/plot/features/scales
