from .core import UIElement

class Slider(UIElement):
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider", width=None, height=None, grow=None, shrink=None, force_dimensions=False):
        self._value = value
        self.min = min
        self.max = max
        self.step = step
        self.label = label
        super().__init__(
            value=value, min=min, max=max, step=step, label=label,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions
        )

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        self._value = new_value
        self.send_update(value=new_value)

    def handle_interaction(self, data):
        if "value" in data:
            # Use float if step is a float, otherwise preserve original type
            if isinstance(self.step, float):
                self._value = float(data["value"])
            else:
                self._value = type(self._value)(data["value"])
            # Update internal props to match current state
            self.props["value"] = self._value
        super().handle_interaction(data)

class Text(UIElement):
    def __init__(self, content="", width=None, height=None, grow=None, shrink=None, force_dimensions=False, align_h="left", align_v="top"):
        self._content = content
        super().__init__(
            content=content,
            width=width, height=height, grow=grow, shrink=shrink, force_dimensions=force_dimensions,
            align_h=align_h, align_v=align_v
        )

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = value
        self.send_update(content=value)

class Group(UIElement):
    def __init__(self, children, layout="col", label=None, width="full", height=None, align="center", grow=None, shrink=None, border=False, padding=None, force_dimensions=False):
        self.children = children

        super().__init__(
            children=[c.to_json() for c in children], 
            layout=layout, 
            label=label, 
            width=width,
            height=height,
            align=align,
            grow=grow,
            shrink=shrink,
            border=border,
            padding=padding,
            force_dimensions=force_dimensions
        )

    @property
    def width(self):
        return self.props.get("width")
    
    @width.setter
    def width(self, value):
        self.send_update(width=value)

    @property
    def height(self):
        return self.props.get("height")
    
    @height.setter
    def height(self, value):
        self.send_update(height=value)

    @property
    def align(self):
        return self.props.get("align")
    
    @align.setter
    def align(self, value):
        self.send_update(align=value)

    @property
    def layout(self):
        return self.props.get("layout")
    
    @layout.setter
    def layout(self, value):
        self.send_update(layout=value)
        
    @property
    def label(self):
        return self.props.get("label")
    
    @label.setter
    def label(self, value):
        self.send_update(label=value)

    @property
    def grow(self):
        return self.props.get("grow")
    
    @grow.setter
    def grow(self, value):
        self.send_update(grow=value)

    @property
    def shrink(self):
        return self.props.get("shrink")
    
    @shrink.setter
    def shrink(self, value):
        self.send_update(shrink=value)

    @property
    def border(self):
        return self.props.get("border")
    
    @border.setter
    def border(self, value):
        self.send_update(border=value)

    @property
    def padding(self):
        return self.props.get("padding")
    
    @padding.setter
    def padding(self, value):
        self.send_update(padding=value)


# =============================================================================
# Chart Components
# =============================================================================

class Plot(UIElement):
    """
    General-purpose plotting using Observable Plot.
    
    Supports: line, dot (scatter), bar, area, cell, rect charts.
    
    Args:
        data: List of dicts, e.g., [{"x": 1, "y": 2}, {"x": 2, "y": 4}, ...]
        x: Column name for x-axis
        y: Column name for y-axis
        mark: Chart type - "line", "dot", "bar", "barY", "barX", "area", "areaY", "cell", "rect"
        color: Column name for color encoding (optional)
        stroke: Static stroke color (optional, defaults to theme accent)
        fill: Static fill color (optional)
        series: Column name for series grouping (optional)
        title: Chart title (optional)
        width: Chart width - number (pixels), "full", or "100%" (default: 600)
        height: Chart height in pixels (default: 380)
        grid: Show grid lines (default: True for y-axis)
        xLabel, yLabel: Axis labels
        xType, yType: Axis type - "linear", "log", "time", "band", "point"
        border: Show border (default: True)
        borderRadius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        titleStyle: dict - Title text style, e.g., {"fontSize": "18px", "fontWeight": "bold", "color": "#333"}
        xLabelStyle: dict - X-axis label style
        yLabelStyle: dict - Y-axis label style  
        tickStyle: dict - Tick/number label style
        gridStyle: dict - Grid line style, e.g., {"stroke": "#ccc", "strokeOpacity": 0.3}
        axisStyle: dict - Axis line style
    
    Example:
        import numpy as np
        from pynote_ui import Plot
        
        x = np.linspace(0, 10, 100)
        data = [{"x": xi, "y": np.sin(xi)} for xi in x]
        Plot(data, x="x", y="y", mark="line", title="Sine Wave")
        
        # Full width plot with custom title style
        Plot(data, x="x", y="y", width="full",
             titleStyle={"fontSize": "20px", "fontWeight": "bold"})
        
        # Custom stroke color and grid
        Plot(data, x="x", y="y", mark="dot", stroke="#ff6b6b",
             gridStyle={"stroke": "#eee", "strokeOpacity": 0.5})
    """
    def __init__(
        self,
        data,
        x,
        y,
        mark="line",
        color=None,
        size=None,
        opacity=None,
        fill=None,
        stroke=None,
        series=None,
        xLabel=None,
        yLabel=None,
        xDomain=None,
        yDomain=None,
        xType=None,
        yType=None,
        grid=None,
        width=600,
        height=380,
        marginTop=None,
        marginRight=None,
        marginBottom=None,
        marginLeft=None,
        title=None,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        grow=None,
        shrink=None,
        force_dimensions=False
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
        super().__init__(
            data=data,
            x=x,
            y=y,
            mark=mark,
            color=color,
            size=size,
            opacity=opacity,
            fill=fill,
            stroke=stroke,
            series=series,
            xLabel=xLabel,
            yLabel=yLabel,
            xDomain=xDomain,
            yDomain=yDomain,
            xType=xType,
            yType=yType,
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
            force_dimensions=force_dimensions
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


class TimeSeries(UIElement):
    """
    High-performance time-series plotting using uPlot.
    
    Optimized for large datasets (100k+ points). Uses canvas rendering
    for maximum performance and minimal memory usage.
    
    Args:
        data: Either uPlot format [[timestamps], [values], ...] or 
              simplified format {"x": [...], "y": [...], "y2": [...]}
        series: List of series configs [{"label": "...", "stroke": "#color"}, ...]
        xLabel, yLabel: Axis labels
        xType: "time" (default, Unix timestamps) or "numeric"
        title: Chart title
        width: Chart width - number (pixels), "full", or "100%" (default: fills container)
        height: Chart height in pixels (default: 350)
        legend: Show legend (default: True)
        cursor: Show cursor crosshairs (default: True)
        zoom: Enable zoom on drag (default: True)
        border: Show border (default: True)
        borderRadius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        titleStyle: dict - Title text style
        xLabelStyle: dict - X-axis label style
        yLabelStyle: dict - Y-axis label style
        tickStyle: dict - Tick/number label style
        gridStyle: dict - Grid line style
        axisStyle: dict - Axis line style
    
    Example:
        import numpy as np
        from pynote_ui import TimeSeries
        import time
        
        # 10,000 points - renders instantly!
        n = 10000
        now = int(time.time())
        timestamps = list(range(now - n, now))
        values = np.cumsum(np.random.randn(n)).tolist()
        
        TimeSeries(
            data={"x": timestamps, "y": values},
            xType="time",
            title="Random Walk",
            width="full",
            titleStyle={"fontSize": "18px", "color": "#333"}
        )
    """
    def __init__(
        self,
        data,
        series=None,
        xLabel=None,
        yLabel=None,
        y2Label=None,
        xType="time",
        xRange=None,
        yRange=None,
        width="full",
        height=350,
        legend=True,
        cursor=True,
        zoom=True,
        title=None,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        grow=None,
        shrink=None,
        force_dimensions=False
    ):
        # Convert data format
        self._data = self._normalize_data(data)
        
        super().__init__(
            data=self._data,
            series=series,
            xLabel=xLabel,
            yLabel=yLabel,
            y2Label=y2Label,
            xType=xType,
            xRange=xRange,
            yRange=yRange,
            width=width,
            height=height,
            legend=legend,
            cursor=cursor,
            zoom=zoom,
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
            force_dimensions=force_dimensions
        )

    def _normalize_data(self, data):
        """Convert various data formats to serializable format."""
        if isinstance(data, dict):
            # Convert numpy arrays in dict values
            return {
                k: (v.tolist() if hasattr(v, 'tolist') else list(v))
                for k, v in data.items()
            }
        elif isinstance(data, (list, tuple)):
            # uPlot format: [[x], [y1], [y2], ...]
            return [
                (arr.tolist() if hasattr(arr, 'tolist') else list(arr))
                for arr in data
            ]
        return data

    @property
    def data(self):
        return self._data

    @data.setter
    def data(self, value):
        self._data = self._normalize_data(value)
        self.send_update(data=self._data)


class Chart(UIElement):
    """
    Specialized charts using Frappe Charts.
    
    Covers chart types not well-suited for line/scatter plots:
    pie, donut, percentage bars, heatmaps.
    
    Args:
        type: Chart type - "pie", "donut", "percentage", "heatmap", "bar", "line"
        data: Data format depends on type:
            - pie/donut/percentage: {"labels": [...], "values": [...]}
            - heatmap: {"dataPoints": {"timestamp": count, ...}}
            - bar/line: {"labels": [...], "datasets": [{"values": [...]}, ...]}
        title: Chart title
        colors: Custom color palette (optional, auto-generated from theme accent)
        width: Chart width - number (pixels), "full", or "100%" (default: fills container)
        height: Chart height in pixels (default: 300)
        border: Show border (default: True)
        borderRadius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        titleStyle: dict - Title text style
        xLabelStyle: dict - X-axis label style
        yLabelStyle: dict - Y-axis label style
        tickStyle: dict - Tick/number label style
        gridStyle: dict - Grid line style
        axisStyle: dict - Axis line style
        
    Type-specific options:
        - maxSlices: For pie/donut, max number of slices before "Other"
        - countLabel: For heatmap, label for count values
        - barOptions: {"spaceRatio": 0.4, "stacked": False}
        - lineOptions: {"dotSize": 4, "regionFill": False, "spline": False}
    
    Example:
        from pynote_ui import Chart
        
        # Pie chart with custom title style
        Chart(
            type="pie",
            data={"labels": ["A", "B", "C"], "values": [40, 35, 25]},
            title="Distribution",
            width="full",
            titleStyle={"fontSize": "20px", "fontWeight": "bold"}
        )
        
        # Bar chart with custom grid
        Chart(
            type="bar",
            data={
                "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "datasets": [{"name": "Sales", "values": [10, 20, 15, 25, 30]}]
            },
            title="Weekly Sales",
            gridStyle={"stroke": "#ddd"}
        )
    """
    def __init__(
        self,
        type,
        data,
        title=None,
        width="full",
        height=300,
        colors=None,
        maxSlices=None,
        countLabel=None,
        discreteDomains=True,
        barOptions=None,
        lineOptions=None,
        axisOptions=None,
        tooltipOptions=None,
        animate=True,
        border=True,
        borderWidth=None,
        borderRadius=None,
        borderColor=None,
        # Style customization dicts
        titleStyle=None,
        xLabelStyle=None,
        yLabelStyle=None,
        tickStyle=None,
        gridStyle=None,
        axisStyle=None,
        grow=None,
        shrink=None,
        force_dimensions=False
    ):
        self._data = self._normalize_data(data)
        self._type = type
        
        super().__init__(
            type=type,
            data=self._data,
            title=title,
            width=width,
            height=height,
            colors=colors,
            maxSlices=maxSlices,
            countLabel=countLabel,
            discreteDomains=discreteDomains,
            barOptions=barOptions,
            lineOptions=lineOptions,
            axisOptions=axisOptions,
            tooltipOptions=tooltipOptions,
            animate=animate,
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
            force_dimensions=force_dimensions
        )

    def _normalize_data(self, data):
        """Convert numpy arrays to lists."""
        if isinstance(data, dict):
            result = {}
            for k, v in data.items():
                if hasattr(v, 'tolist'):
                    result[k] = v.tolist()
                elif isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                    # datasets array
                    result[k] = [
                        {dk: (dv.tolist() if hasattr(dv, 'tolist') else dv) 
                         for dk, dv in d.items()}
                        for d in v
                    ]
                else:
                    result[k] = v
            return result
        return data

    @property
    def data(self):
        return self._data

    @data.setter
    def data(self, value):
        self._data = self._normalize_data(value)
        self.send_update(data=self._data)

    @property
    def type(self):
        return self._type
