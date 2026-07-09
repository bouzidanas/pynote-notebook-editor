// Embedded source for pynote_ui/oplot.py.
export const PYNOTE_UI_OPLOT_PY = `
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
        stroke_width: Column or value for stroke width
        fill_opacity: Column or value for fill opacity
        stroke_opacity: Column or value for stroke opacity
        
        # Dot-specific
        r: Column or value for radius/size (dot marks)
        symbol: Column or symbol type - "circle", "square", "diamond", "triangle", etc.
        
        # Series grouping
        z: Column for grouping into separate series (line, area marks)
        
        # Scale customization
        x_label, y_label: Axis labels
        x_domain, y_domain: Explicit scale domains [min, max]
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
        border_radius: Border radius
        
        # Layout (app-specific)
        grow, shrink: Flex properties for responsive sizing
        force_dimensions: Override flex with fixed dimensions
        
        # Style customization (all optional, override defaults)
        title_style: Title text style dict
        x_label_style, y_label_style: Axis label style dicts
        tick_style: Tick/number label style dict
        grid_style: Grid line style dict
        axis_style: Axis line style dict
        
        # Advanced: Any other Observable Plot option
        **kwargs: Any additional Observable Plot options are passed through
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
        stroke_width=None,
        fill_opacity=None,
        stroke_opacity=None,
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
        x_label=None,
        y_label=None,
        x_domain=None,
        y_domain=None,
        x_type=None,
        y_type=None,
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
        inset_top=None,
        inset_right=None,
        inset_bottom=None,
        inset_left=None,
        # Grid & margins
        grid=None,
        margin_top=None,
        margin_right=None,
        margin_bottom=None,
        margin_left=None,
        # Chart appearance (app-specific)
        width="full",
        height=380,
        title=None,
        border=True,
        border_width=None,
        border_radius=None,
        border_color=None,
        # Style customization dicts (app-specific)
        title_style=None,
        x_label_style=None,
        y_label_style=None,
        tick_style=None,
        grid_style=None,
        axis_style=None,
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
            stroke_width=stroke_width,
            fill_opacity=fill_opacity,
            stroke_opacity=stroke_opacity,
            size=size,
            r=r,
            symbol=symbol,
            series=series,
            z=z,
            x_label=x_label,
            y_label=y_label,
            x_domain=x_domain,
            y_domain=y_domain,
            x_type=x_type,
            y_type=y_type,
            sort=sort,
            filter=filter,
            bin=bin,
            thresholds=thresholds,
            interval=interval,
            reduce=reduce,
            curve=curve,
            marker=marker,
            inset=inset,
            inset_top=inset_top,
            inset_right=inset_right,
            inset_bottom=inset_bottom,
            inset_left=inset_left,
            grid=grid,
            width=width,
            height=height,
            margin_top=margin_top,
            margin_right=margin_right,
            margin_bottom=margin_bottom,
            margin_left=margin_left,
            title=title,
            border=border,
            border_width=border_width,
            border_radius=border_radius,
            border_color=border_color,
            title_style=title_style,
            x_label_style=x_label_style,
            y_label_style=y_label_style,
            tick_style=tick_style,
            grid_style=grid_style,
            axis_style=axis_style,
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
    """Create a scatter plot (dot mark)."""
    return Plot(data, x=x, y=y, mark="dot", fill=fill, stroke=stroke, r=r, 
                symbol=symbol, opacity=opacity, title=title, **kwargs)

def line(data, x=None, y=None, stroke=None, z=None, curve="linear", 
         marker=None, stroke_width=None, title=None, **kwargs):
    """Create a line plot."""
    return Plot(data, x=x, y=y, mark="line", stroke=stroke, z=z, curve=curve,
                marker=marker, stroke_width=stroke_width, title=title, **kwargs)

def area(data, x=None, y=None, y1=None, y2=None, fill=None, z=None, 
         curve="linear", title=None, **kwargs):
    """Create an area chart."""
    return Plot(data, x=x, y=y, y1=y1, y2=y2, mark="areaY", fill=fill, z=z, 
                curve=curve, title=title, **kwargs)

def bar(data, x=None, y=None, fill=None, sort=None, orientation="vertical", 
        inset=0, title=None, **kwargs):
    """Create a bar chart."""
    mark = "barY" if orientation == "vertical" else "barX"
    return Plot(data, x=x, y=y, mark=mark, fill=fill, sort=sort, inset=inset, 
                title=title, **kwargs)

def histogram(data, x=None, y=None, bins=None, fill=None, 
              stat="count", orientation="vertical", title=None, **kwargs):
    """
    Create a histogram using rectY/rectX with binning.
    
    Args:
        bins: Number of bins (int) or explicit bin edges (list)
        stat: Statistic - "count", "proportion", "percent", "density", "sum", "mean", etc.
    """
    mark = "rectY" if orientation == "vertical" else "rectX"
    # Map user-friendly names to Observable Plot's internal names
    return Plot(data, x=x, y=y, mark=mark, fill=fill, thresholds=bins, 
                reduce=stat, title=title, **kwargs)

def boxplot(data, x=None, y=None, fill=None, orientation="vertical", title=None, **kwargs):
    """Create a box plot."""
    mark = "boxY" if orientation == "vertical" else "boxX"
    return Plot(data, x=x, y=y, mark=mark, fill=fill, title=title, **kwargs)

def heatmap(data, x=None, y=None, fill=None, stroke=None, inset=0.5, title=None, **kwargs):
    """Create a heatmap."""
    return Plot(data, x=x, y=y, mark="cell", fill=fill, stroke=stroke, 
                inset=inset, title=title, **kwargs)

def density(data, x=None, y=None, fill=None, stroke=None, 
            thresholds=None, bandwidth=None, title=None, **kwargs):
    """Create a smooth density contour plot."""
    return Plot(data, x=x, y=y, mark="density", fill=fill, stroke=stroke, 
                thresholds=thresholds, bandwidth=bandwidth, title=title, **kwargs)

def rule(data=None, x=None, y=None, stroke="currentColor", stroke_width=1, 
         stroke_dasharray="4 2", title=None, **kwargs):
    """Create reference lines."""
    return Plot(data, x=x, y=y, mark="rule", stroke=stroke, stroke_width=stroke_width,
                stroke_dasharray=stroke_dasharray, title=title, **kwargs)

def waffle(data, x=None, y=None, fill=None, orientation="vertical", 
           unit=None, gap=None, rx=None, per_row=None,
           bg_y=None, bg_x=None, bg_opacity=None,
           title=None, **kwargs):
    """
    Create a waffle chart (unit chart with countable cells).
    
    Args:
        data: List of dicts or values
        x: Column for categorical grouping (vertical) or values (horizontal)
        y: Column for values (vertical) or categorical grouping (horizontal)
        fill: Column or color for fill encoding
        orientation: "vertical" (waffleY) or "horizontal" (waffleX)
        unit: Quantity each cell represents (default: 1)
        gap: Gap between cells in pixels
        rx: Corner radius - use "100%" for circles
        per_row: Number of cells per row
        bg_y: Background total for vertical waffle (shows faded unfilled cells)
        bg_x: Background total for horizontal waffle
        bg_opacity: Opacity for background cells (default: 0.4)
        title: Chart title
    """
    mark = "waffleY" if orientation == "vertical" else "waffleX"
    
    extra_kwargs = {}
    bg_total = bg_y if orientation == "vertical" else bg_x
    if bg_total is not None:
        extra_kwargs["background_y" if orientation == "vertical" else "background_x"] = bg_total
        opacity = bg_opacity if bg_opacity is not None else 0.4
        if fill and isinstance(fill, str) and fill.startswith("#"):
            hex_color = fill.lstrip("#")
            if len(hex_color) == 3:
                hex_color = "".join([c*2 for c in hex_color])
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            extra_kwargs["background_fill"] = f"rgba({r}, {g}, {b}, {opacity})"
        else:
            extra_kwargs["background_fill"] = fill or "currentColor"
    
    return Plot(data, x=x, y=y, mark=mark, fill=fill, unit=unit, gap=gap, 
                rx=rx, per_row=per_row, title=title, **extra_kwargs, **kwargs)

def hexbin(data, x=None, y=None, fill="count", r=None, stroke=None,
           bin_width=None, color_scheme=None, title=None, **kwargs):
    """
    Create a hexbin heatmap (2D histogram with hexagonal bins).
    
    Args:
        data: List of dicts with x, y values
        x, y: Column names for position
        fill: "count" (default) or column name for color encoding
        r: "count" for sized hexagons, or fixed radius
        stroke: Stroke color for hexagon borders
        bin_width: Distance between hexagon centers in pixels
        color_scheme: Color scheme - "turbo", "viridis", "YlGnBu", "plasma", etc.
        title: Chart title
    """
    return Plot(data, x=x, y=y, mark="hexbin", fill=fill, r=r, stroke=stroke,
                bin_width=bin_width, color_scheme=color_scheme, title=title, **kwargs)

def stacked_dots(data, x=None, y=None, fill=None, r=None, 
                 orientation="vertical", direction="single",
                 group_column=None, positive_value=None, negative_value=None,
                 title=None, **kwargs):
    """
    Create a stacked dot plot (Wilkinson dot plot).
    
    Args:
        data: List of dicts with values to plot
        x: Column for x-axis (categories for vertical, values for horizontal)
        y: Column for y-axis, or bidirectional values (+1/-1)
        fill: Column or color for fill encoding
        r: Dot radius in pixels
        orientation: "vertical" (dotY) or "horizontal" (dotX)
        direction: "single" (stack one way) or "bidirectional" (up/down)
        group_column: For bidirectional - column that determines direction
        positive_value: Value that stacks positive (up/right)
        negative_value: Value that stacks negative (down/left)
        title: Chart title
    
    Examples:
        # Simple vertical stacking
        stacked_dots(data, x="grade")
        
        # Bidirectional stacking
        stacked_dots(data, x="score", direction="bidirectional",
                     group_column="gender", 
                     positive_value="Male", negative_value="Female",
                     fill="gender", yLabel="← Female · Male →")
    """
    plot_data = data
    plot_y = y
    
    if direction == "bidirectional" and group_column and positive_value and negative_value:
        plot_data = []
        for item in data:
            new_item = dict(item)
            if item.get(group_column) == positive_value:
                new_item["_y_dir"] = 1
            elif item.get(group_column) == negative_value:
                new_item["_y_dir"] = -1
            else:
                new_item["_y_dir"] = 1
            plot_data.append(new_item)
        plot_y = "_y_dir"
    
    mark = "dotY" if orientation == "vertical" else "dotX"
    
    if orientation == "vertical":
        return Plot(plot_data, x=x, y=plot_y, mark=mark, fill=fill, r=r, title=title, **kwargs)
    else:
        return Plot(plot_data, x=plot_y, y=y if y else x, mark=mark, fill=fill, r=r, title=title, **kwargs)
`;
