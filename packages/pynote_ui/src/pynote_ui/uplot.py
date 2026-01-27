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
