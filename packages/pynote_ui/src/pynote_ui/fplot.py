from .core import UIElement

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
        border_radius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        title_style: dict - Title text style
        x_label_style: dict - X-axis label style
        y_label_style: dict - Y-axis label style
        tick_style: dict - Tick/number label style
        grid_style: dict - Grid line style
        axis_style: dict - Axis line style
        
    Type-specific options:
        - maxSlices: For pie/donut, max number of slices before "Other"
        - countLabel: For heatmap, label for count values
        - barOptions: {"spaceRatio": 0.4, "stacked": False}
        - lineOptions: {"dotSize": 4, "regionFill": False, "spline": False}
    
    Example:
        from pynote_ui.fplot import Chart
        
        # Pie chart with custom title style
        Chart(
            type="pie",
            data={"labels": ["A", "B", "C"], "values": [40, 35, 25]},
            title="Distribution",
            width="full",
            title_style={"fontSize": "20px", "fontWeight": "bold"}
        )
        
        # Bar chart with custom grid
        Chart(
            type="bar",
            data={
                "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "datasets": [{"name": "Sales", "values": [10, 20, 15, 25, 30]}]
            },
            title="Weekly Sales",
            grid_style={"stroke": "#ddd"}
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
        border_width=None,
        border_radius=None,
        border_color=None,
        # Style customization dicts
        title_style=None,
        x_label_style=None,
        y_label_style=None,
        tick_style=None,
        grid_style=None,
        axis_style=None,
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
