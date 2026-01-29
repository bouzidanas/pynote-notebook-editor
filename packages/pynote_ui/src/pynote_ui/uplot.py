from .core import UIElement

class TimeSeries(UIElement):
    """
    High-performance time-series plotting using uPlot.
    
    Optimized for large datasets (100k+ points). Uses canvas rendering
    for maximum performance and minimal memory usage.
    
    Args:
        data: Either uPlot format [[timestamps], [values], ...] or 
              simplified format {"x": [...], "y": [...], "y2": [...]}
        series: List of series configs [{"label": "...", "stroke": "#color"}, ...]
        x_label, y_label: Axis labels
        xType: "time" (default, Unix timestamps) or "numeric"
        title: Chart title
        width: Chart width - number (pixels), "full", or "100%" (default: fills container)
        height: Chart height in pixels (default: 350)
        legend: Show legend (default: True)
        cursor: Show cursor crosshairs (default: True)
        zoom: Enable zoom on drag (default: True)
        border: Show border (default: True)
        border_radius: Border radius (optional, defaults to theme)
        
        Style customization (all optional, override defaults):
        title_style: dict - Title text style
        x_label_style: dict - X-axis label style
        y_label_style: dict - Y-axis label style
        tick_style: dict - Tick/number label style
        grid_style: dict - Grid line style
        axis_style: dict - Axis line style
    
    Example:
        import numpy as np
        from pynote_ui.uplot import TimeSeries
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
            title_style={"fontSize": "18px", "color": "#333"}
        )
    """
    def __init__(
        self,
        data,
        series=None,
        x_label=None,
        y_label=None,
        y2_label=None,
        xType="time",
        x_range=None,
        y_range=None,
        width="full",
        height=350,
        legend=True,
        cursor=True,
        zoom=True,
        title=None,
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
        # Convert data format
        self._data = self._normalize_data(data)
        
        super().__init__(
            data=self._data,
            series=series,
            x_label=x_label,
            y_label=y_label,
            y2_label=y2_label,
            xType=xType,
            x_range=x_range,
            y_range=y_range,
            width=width,
            height=height,
            legend=legend,
            cursor=cursor,
            zoom=zoom,
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
