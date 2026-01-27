"""
Observable Plot-based plotting functions.

Observable Plot supports many mark types for creating rich visualizations:
- line, lineX, lineY: connected lines
- dot: scatter plots
- bar, barX, barY: bar charts  
- area, areaX, areaY: filled areas
- rect, rectX, rectY: rectangles (histograms, heatmaps)
- cell: categorical heatmaps
- rule: reference lines
- text: labels
- box, boxX, boxY: boxplots
- density: smooth density estimation
- contour: contour lines
- And many more!

This module provides convenient high-level functions for common plot types.
"""

from .core import UIElement

class Plot(UIElement):
    """
    General-purpose plotting using Observable Plot.
    
    Exposes the full flexibility of Observable Plot mark types and options.
    
    Args:
        data: List of dicts, e.g., [{"x": 1, "y": 2}, {"x": 2, "y": 4}, ...]
        
        # Required/Primary
        mark: Mark type - "line", "lineX", "lineY", "dot", "bar", "barY", "barX", 
              "area", "areaY", "areaX", "rect", "rectY", "rectX", "cell", "rule", 
              "ruleX", "ruleY", "text", "boxX", "boxY", "density", etc.
        
        # Position channels (most marks)
        x, y: Column names or values for position
        x1, x2, y1, y2: Explicit bounds for rect/area marks
        
        # Visual encoding channels
        fill: Column or color for fill (can vary per point)
        stroke: Column or color for stroke (can vary per point)
        opacity: Column or value for opacity
        strokeWidth: Column or value for stroke width
        fillOpacity: Column or value for fill opacity
        strokeOpacity: Column or value for stroke opacity
        
        # Dot-specific
        r: Column or value for radius/size (dot marks)
        symbol: Column or symbol type - "circle", "square", "diamond", "triangle", etc.
        
        # Series grouping
        z: Column for grouping into separate series (line, area marks)
        
        # Scale customization
        xLabel, yLabel: Axis labels
        xDomain, yDomain: Explicit scale domains [min, max]
        xType, yType: Scale type - "linear", "log", "sqrt", "pow", "time", "utc", 
                      "band", "point", "ordinal"
        
        # Transforms
        sort: Column or {channel: "x", order: "ascending"} for sorting
        filter: Function to filter data points
        bin: Binning specification for histograms
        thresholds: Number of bins or bin edges
        interval: Time/numeric interval for regularization ("day", "hour", 1, etc.)
        reduce: Reducer function for binning - "count", "sum", "mean", "median", etc.
        curve: Interpolation curve - "linear", "step", "step-before", "step-after", 
               "basis", "cardinal", "catmull-rom", "monotone-x", "monotone-y", "natural"
        
        # Mark styling
        marker: Add markers to line endpoints - "dot", "arrow", "circle", etc.
        inset: Spacing between bars/rects (number in pixels)
        insetTop, insetRight, insetBottom, insetLeft: Individual insets
        
        # Chart appearance (app-specific)
        title: Chart title
        width: Chart width - number (pixels), "full", or "100%" (default: "full")
        height: Chart height in pixels (default: 380)
        grid: Show grid - True (y-axis), "both", "x", "y", False
        border: Show border (default: True)
        borderRadius: Border radius
        
        # Layout (app-specific)
        grow, shrink: Flex properties for responsive sizing
        force_dimensions: Override flex with fixed dimensions
        
        # Style customization (all optional, override defaults)
        titleStyle: Title text style dict
        xLabelStyle, yLabelStyle: Axis label style dicts
        tickStyle: Tick/number label style dict
        gridStyle: Grid line style dict
        axisStyle: Axis line style dict
        
        # Advanced: Any other Observable Plot option
        **kwargs: Any additional Observable Plot options are passed through
    
    Examples:
        # Simple scatter
        Plot(data, x="weight", y="height", mark="dot")
        
        # Colored line with multiple series
        Plot(data, x="date", y="value", z="series", stroke="series", mark="line")
        
        # Smooth curve
        Plot(data, x="x", y="y", mark="line", curve="catmull-rom")
        
        # Sized dots with color
        Plot(data, x="x", y="y", r="population", fill="category", mark="dot")
        
        # Histogram with 20 bins
        Plot(data, x="value", mark="rectY", thresholds=20)
        
        # Sorted bar chart
        Plot(data, x="category", y="value", mark="barY", sort={x: "-y"})
        
        # Custom styling
        Plot(data, x="x", y="y", mark="line", 
             titleStyle={"fontSize": "20px", "color": "#8b5cf6"},
             gridStyle={"stroke": "#e5e7eb", "strokeOpacity": 0.5})
    """
    def __init__(
        self,
        data,
        # Position channels (most accept None, making them optional)
        x=None,
        y=None,
        # Mark type
        mark="line",
        # Visual encoding channels
        color=None,  # legacy: maps to fill or stroke
        fill=None,
        stroke=None,
        opacity=None,
        strokeWidth=None,
        fillOpacity=None,
        strokeOpacity=None,
        # Dimension channels
        size=None,  # legacy: maps to r for dots
        r=None,
        symbol=None,
        # Series grouping
        series=None,  # legacy: maps to z
        z=None,
        # Position bounds (for rect/area marks)
        x1=None, x2=None, y1=None, y2=None,
        # Scale options
        xLabel=None,
        yLabel=None,
        xDomain=None,
        yDomain=None,
        xType=None,
        yType=None,
        # Transforms
        sort=None,
        filter=None,
        bin=None,
        thresholds=None,
        interval=None,
        reduce=None,
        curve=None,
        # Mark styling
        marker=None,
        inset=None,
        insetTop=None,
        insetRight=None,
        insetBottom=None,
        insetLeft=None,
        # Grid & margins
        grid=None,
        marginTop=None,
        marginRight=None,
        marginBottom=None,
        marginLeft=None,
        # Chart appearance (app-specific)
        width="full",
        height=380,
        title=None,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts (app-specific)
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        # Layout (app-specific)
        grow=None,
        shrink=None,
        force_dimensions=False,
        # Pass-through for any other Observable Plot options
        **kwargs
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
        
        # Handle legacy parameters: map old names to new channels
        if series is not None and z is None:
            z = series
        if size is not None and r is None:
            r = size
        
        # Pass all parameters to parent UIElement
        super().__init__(
            data=data,
            x=x,
            y=y,
            x1=x1,
            x2=x2,
            y1=y1,
            y2=y2,
            mark=mark,
            color=color,
            fill=fill,
            stroke=stroke,
            opacity=opacity,
            strokeWidth=strokeWidth,
            fillOpacity=fillOpacity,
            strokeOpacity=strokeOpacity,
            size=size,
            r=r,
            symbol=symbol,
            series=series,
            z=z,
            xLabel=xLabel,
            yLabel=yLabel,
            xDomain=xDomain,
            yDomain=yDomain,
            xType=xType,
            yType=yType,
            sort=sort,
            filter=filter,
            bin=bin,
            thresholds=thresholds,
            interval=interval,
            reduce=reduce,
            curve=curve,
            marker=marker,
            inset=inset,
            insetTop=insetTop,
            insetRight=insetRight,
            insetBottom=insetBottom,
            insetLeft=insetLeft,
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
            force_dimensions=force_dimensions,
            **kwargs  # Pass through any additional Observable Plot options
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


# =============================================================================
# Convenience Functions for Common Plot Types
# =============================================================================

def scatter(data, x=None, y=None, fill=None, stroke=None, r=None, symbol=None, 
            opacity=None, title=None, **kwargs):
    """
    Create a scatter plot (dot mark).
    
    Args:
        data: List of dicts with x, y values
        x, y: Column names or values for position
        fill: Column or color for fill encoding
        stroke: Column or color for stroke encoding  
        r: Column or value for radius/size
        symbol: Column or symbol type ("circle", "square", "diamond", etc.)
        opacity: Opacity value or column
        title: Chart title
        **kwargs: All Plot options (curve, sort, filter, xLabel, width, etc.)
    
    Examples:
        scatter(data, x="weight", y="height")
        scatter(data, x="weight", y="height", fill="sex", r="age")
        scatter(data, x="x", y="y", symbol="category", stroke="value")
    """
    return Plot(data, x=x, y=y, mark="dot", fill=fill, stroke=stroke, r=r, 
                symbol=symbol, opacity=opacity, title=title, **kwargs)


def line(data, x=None, y=None, stroke=None, z=None, curve="linear", 
         marker=None, strokeWidth=None, title=None, **kwargs):
    """
    Create a line plot.
    
    Args:
        data: List of dicts with x, y values (sorted by x recommended)
        x, y: Column names for axes
        stroke: Column or color for stroke (creates series if column)
        z: Column for explicit series grouping
        curve: Interpolation - "linear" (default), "step", "step-before", "step-after",
               "basis", "cardinal", "catmull-rom", "monotone-x", "natural"
        marker: Add markers - "dot", "circle", "arrow", etc.
        strokeWidth: Width in pixels or column name
        title: Chart title
        **kwargs: All Plot options (sort, filter, opacity, xLabel, etc.)
    
    Examples:
        line(data, x="date", y="value")
        line(data, x="x", y="y", curve="catmull-rom")  # Smooth curve
        line(data, x="date", y="value", z="series", stroke="series")  # Multiple series
        line(data, x="x", y="y", marker="dot", strokeWidth=3)
    """
    return Plot(data, x=x, y=y, mark="line", stroke=stroke, z=z, curve=curve,
                marker=marker, strokeWidth=strokeWidth, title=title, **kwargs)


def area(data, x=None, y=None, y1=None, y2=None, fill=None, z=None, 
         curve="linear", title=None, **kwargs):
    """
    Create an area chart (filled line plot).
    
    Args:
        data: List of dicts with x, y values
        x, y: Column names for axes
        y1, y2: Explicit bounds for area (optional, otherwise y defaults to 0)
        fill: Column or color for fill (creates stacked/grouped areas if column)
        z: Column for explicit series grouping
        curve: Interpolation curve (see line())
        title: Chart title
        **kwargs: All Plot options
    
    Examples:
        area(data, x="date", y="value")
        area(data, x="date", y="value", fill="category")  # Stacked by default
        area(data, x="x", y1="lower", y2="upper")  # Confidence interval
    """
    return Plot(data, x=x, y=y, y1=y1, y2=y2, mark="areaY", fill=fill, z=z, 
                curve=curve, title=title, **kwargs)


def bar(data, x=None, y=None, fill=None, sort=None, orientation="vertical", 
        inset=0, title=None, **kwargs):
    """
    Create a bar chart.
    
    Args:
        data: List of dicts
        x, y: Column names - one categorical (band scale), one quantitative
        fill: Column or color for fill
        sort: Sort specification - column name, {x: "y"}, {x: "-y"}, etc.
        orientation: "vertical" (barY, default) or "horizontal" (barX)
        sort: Sort specification - column name, {x: "y"}, {x: "-y"}, etc.
        orientation: "vertical" (barY, default) or "horizontal" (barX)
        inset: Gap between bars in pixels
        title: Chart title
        **kwargs: All Plot options
    
    Examples:
        bar(data, x="category", y="value")
        bar(data, x="category", y="value", sort={x: "-y"})  # Sort by descending value
        bar(data, x="category", y="value", fill="segment", inset=2)  # Stacked with gaps
    """
    mark = "barY" if orientation == "vertical" else "barX"
    return Plot(data, x=x, y=y, mark=mark, fill=fill, sort=sort, inset=inset, 
                title=title, **kwargs)


def histogram(data, x=None, y=None, bins=None, fill=None, 
              stat="count", orientation="vertical", title=None, **kwargs):
    """
    Create a histogram using rectY/rectX with binning.
    
    Args:
        data: List of values or list of dicts
        x: Column name for data to bin (vertical histogram)
        y: Column name for data to bin (horizontal histogram)
        bins: Number of bins (int) or explicit bin edges (list)
        fill: Column or color for fill
        stat: Statistic to compute - "count" (default), "proportion", "percent", 
              "density", "sum", "mean", "median", etc.
        orientation: "vertical" or "horizontal"
        title: Chart title
        **kwargs: All Plot options
    
    Examples:
        histogram(data, x="value", bins=20)
        histogram(data, x="age", fill="sex", stat="proportion")
    """
    mark = "rectY" if orientation == "vertical" else "rectX"
    # Map user-friendly names to Observable Plot's internal names
    return Plot(data, x=x, y=y, mark=mark, fill=fill, thresholds=bins, 
                reduce=stat, title=title, **kwargs)


def boxplot(data, x=None, y=None, fill=None, orientation="vertical", title=None, **kwargs):
    """
    Create a box plot to show distribution quartiles.
    
    Args:
        data: List of values or list of dicts  
        x: Column for grouping (categorical/band scale)
        y: Column with values to summarize (vertical orientation)
        fill: Column or color for fill
        orientation: "vertical" (boxY) or "horizontal" (boxX)
        title: Chart title
        **kwargs: All Plot options
    
    Examples:
        boxplot(data, x="category", y="value")
        boxplot(data, x="treatment", y="response", fill="group")
    """
    # Box plots are composite marks handled specially in frontend
    mark = "boxY" if orientation == "vertical" else "boxX"
    return Plot(data, x=x, y=y, mark=mark, fill=fill, title=title, **kwargs)


def heatmap(data, x=None, y=None, fill=None, stroke=None, inset=0.5, title=None, **kwargs):
    """
    Create a heatmap using cell or rect mark.
    
    Args:
        data: List of dicts with x, y, and color value
        x, y: Column names for axes (categorical or to be binned)
        fill: Column name for color/heat encoding
        stroke: Stroke color for cell borders (default: None)
        inset: Gap between cells in pixels (default: 0.5)
        title: Chart title
        **kwargs: All Plot options (use thresholds for binned 2D histogram)
    
    Examples:
        heatmap(data, x="hour", y="day", fill="temperature")
        heatmap(data, x="x", y="y", fill="count", thresholds=50)  # 2D histogram
    """
    return Plot(data, x=x, y=y, mark="cell", fill=fill, stroke=stroke, 
                inset=inset, title=title, **kwargs)


def density(data, x=None, y=None, fill=None, stroke=None, 
            thresholds=None, bandwidth=None, title=None, **kwargs):
    """
    Create a smooth density contour plot.
    
    Args:
        data: List of values or list of dicts
        x, y: Column names for 1D or 2D density
        fill: Column or color for fill
        stroke: Column or color for stroke
        thresholds: Number of contour levels
        bandwidth: KDE bandwidth parameter
        title: Chart title
        **kwargs: All Plot options
    
    Examples:
        density(data, x="x", y="y")  # 2D density contours
        density(data, x="x", y="y", fill="density", thresholds=10)
    """
    return Plot(data, x=x, y=y, mark="density", fill=fill, stroke=stroke, 
                thresholds=thresholds, bandwidth=bandwidth, title=title, **kwargs)


def rule(data=None, x=None, y=None, stroke="currentColor", strokeWidth=1, 
         strokeDasharray="4 2", title=None, **kwargs):
    """
    Create reference lines (horizontal or vertical rules).
    
    Args:
        data: Optional data (if using data-driven rules)
        x: X-value(s) for vertical line(s) - can be list, value, or column name
        y: Y-value(s) for horizontal line(s) - can be list, value, or column name
        stroke: Line color
        strokeWidth: Line width in pixels
        strokeDasharray: Dash pattern (e.g., "4 2" for dashed, None for solid)
        title: Chart title
        **kwargs: All Plot options
    
    Examples:
        rule(y=0)  # Horizontal line at y=0
        rule(x=[1, 2, 3], stroke="red", strokeWidth=2)  # Vertical lines
        rule(data, y="threshold", stroke="orange")  # Data-driven
    """
    return Plot(data, x=x, y=y, mark="rule", stroke=stroke, strokeWidth=strokeWidth,
                strokeDasharray=strokeDasharray, title=title, **kwargs)

