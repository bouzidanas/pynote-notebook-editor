/**
 * TimeSeries Component - uPlot Integration
 * 
 * High-performance time-series plotting using uPlot.
 * Optimized for large datasets (100k+ points) with minimal memory footprint.
 */

import { 
  type Component, 
  createEffect, 
  createSignal,
  on,
  onMount, 
  onCleanup,
  Show
} from "solid-js";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { kernel } from "../../lib/pyodide";
import { getUPlotTheme, getChartContainerStyles, getChartTitleStyles, generateColorPalette } from "../../lib/chart-theme";
import { currentTheme } from "../../lib/theme";

type StyleDict = Record<string, string | number>;

interface TimeSeriesProps {
  id: string;
  props: {
    data: number[][] | { x: number[]; [key: string]: number[] };
    series?: Array<{
      label?: string;
      stroke?: string;
      fill?: string;
      width?: number;
      show?: boolean;
      scale?: string;
      spanGaps?: boolean;
    }>;
    xLabel?: string;
    yLabel?: string;
    y2Label?: string;
    xType?: "time" | "numeric";
    xRange?: [number, number];
    yRange?: [number, number];
    width?: number | string;
    height?: number;
    legend?: boolean;
    cursor?: boolean;
    zoom?: boolean;
    title?: string;
    border?: boolean;
    borderWidth?: number | string;
    borderRadius?: string;
    borderColor?: string;
    titleStyle?: StyleDict;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
  };
}

type RawData = number[][] | { x: number[]; [key: string]: number[] };

const normalizeData = (rawData: RawData): uPlot.AlignedData => {
  if (Array.isArray(rawData) && Array.isArray(rawData[0])) {
    return rawData as uPlot.AlignedData;
  }
  
  if (typeof rawData === "object" && !Array.isArray(rawData) && "x" in rawData) {
    const obj = rawData as { x: number[]; [key: string]: number[] };
    const result: number[][] = [obj.x];
    const seriesKeys = Object.keys(obj).filter(k => k !== "x").sort();
    for (const key of seriesKeys) {
      result.push(obj[key]);
    }
    return result as uPlot.AlignedData;
  }
  
  return [[], []] as uPlot.AlignedData;
};

const extractSeriesLabels = (rawData: RawData): string[] => {
  if (typeof rawData === "object" && !Array.isArray(rawData)) {
    return Object.keys(rawData).filter(k => k !== "x").sort();
  }
  return [];
};

const TimeSeries: Component<TimeSeriesProps> = (p) => {
  const componentId = p.id;
  let containerRef: HTMLDivElement | undefined;
  let plotContainerRef: HTMLDivElement | undefined;
  let chartInstance: uPlot | null = null;
  
  const [data, setData] = createSignal<RawData>(p.props.data || [[],[]]);

  createEffect(() => {
    if (p.props.data) {
      setData(p.props.data);
    }
  });

  onMount(() => {
    kernel.registerComponentListener(componentId, (update: any) => {
      if (update.data !== undefined) {
        setData(update.data);
      }
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  const getChartWidth = (): number => {
    const w = p.props.width;
    if (w === "full" || w === "100%") {
      return plotContainerRef?.clientWidth || 600;
    }
    if (typeof w === "number") return w;
    if (typeof w === "string" && w.endsWith("px")) {
      return parseInt(w, 10) || 600;
    }
    return plotContainerRef?.clientWidth || 600;
  };

  const buildOptions = (width: number, height: number): uPlot.Options => {
    const theme = getUPlotTheme();
    const rawData = data();
    const normalizedData = normalizeData(rawData);
    const seriesLabels = extractSeriesLabels(rawData);
    const numSeries = normalizedData.length - 1;
    
    const axisColor = theme.axes.stroke;
    const gridColor = theme.axes.grid;
    const isTime = p.props.xType !== "numeric";
    
    const seriesConfig: uPlot.Series[] = [{}];
    const colors = generateColorPalette(currentTheme.colors.accent, Math.max(numSeries, 1));
    
    for (let i = 0; i < numSeries; i++) {
      const userSeries = p.props.series?.[i] || {};
      const autoLabel = seriesLabels[i] || `Series ${i + 1}`;
      
      seriesConfig.push({
        label: userSeries.label ?? autoLabel,
        stroke: userSeries.stroke ?? colors[i % colors.length],
        fill: userSeries.fill ?? undefined,
        width: userSeries.width ?? theme.series.width,
        show: userSeries.show ?? true,
        scale: userSeries.scale ?? "y",
        spanGaps: userSeries.spanGaps ?? false,
        points: {
          show: theme.series.points.show,
          size: theme.series.points.size,
          fill: userSeries.stroke ?? colors[i % colors.length],
        },
      });
    }

    const axes: uPlot.Axis[] = [
      {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: axisColor, width: 1, size: theme.axes.tickSize },
        font: theme.axes.font,
        labelFont: theme.axes.labelFont,
        label: p.props.xLabel,
        labelSize: theme.axes.labelSize,
        gap: theme.axes.gap,
        values: isTime ? undefined : (_u, vals) => vals.map(v => v.toLocaleString()),
      },
      {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: axisColor, width: 1, size: theme.axes.tickSize },
        font: theme.axes.font,
        labelFont: theme.axes.labelFont,
        label: p.props.yLabel,
        labelSize: theme.axes.labelSize,
        gap: theme.axes.gap,
        size: 60,
      },
    ];

    const hasY2 = p.props.series?.some(s => s.scale === "y2");
    if (hasY2) {
      axes.push({
        scale: "y2",
        side: 1,
        stroke: axisColor,
        grid: { show: false },
        ticks: { stroke: axisColor, width: 1, size: theme.axes.tickSize },
        font: theme.axes.font,
        labelFont: theme.axes.labelFont,
        label: p.props.y2Label,
        labelSize: theme.axes.labelSize,
        gap: theme.axes.gap,
        size: 60,
      });
    }

    const scales: uPlot.Scales = {
      x: {
        time: isTime,
        range: p.props.xRange ? () => p.props.xRange! : undefined,
      },
      y: {
        range: p.props.yRange ? () => p.props.yRange! : undefined,
      },
    };

    if (hasY2) {
      scales.y2 = { range: (_u, min, max) => [min, max] };
    }

    const cursor: uPlot.Cursor = p.props.cursor !== false ? {
      show: true,
      drag: { x: p.props.zoom !== false, y: false, uni: 50 },
      focus: { prox: 30 },
      points: {
        size: 8,
        fill: theme.cursor.fill,
        stroke: theme.cursor.stroke,
        width: 2,
      },
    } : { show: false };

    return {
      width,
      height,
      series: seriesConfig,
      axes,
      scales,
      cursor,
      legend: { show: p.props.legend !== false },
      padding: [10, 10, 0, 0],
    };
  };

  const renderChart = () => {
    if (!plotContainerRef) return;
    
    const normalizedData = normalizeData(data());
    
    if (!normalizedData || normalizedData.length < 2 || normalizedData[0].length === 0) {
      plotContainerRef.innerHTML = '<div style="color: var(--secondary); padding: 20px; text-align: center;">No data</div>';
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      return;
    }

    const width = getChartWidth();
    const height = p.props.height || 350;

    try {
      if (chartInstance) {
        chartInstance.setData(normalizedData);
      } else {
        plotContainerRef.innerHTML = "";
        const opts = buildOptions(width, height);
        chartInstance = new uPlot(opts, normalizedData, plotContainerRef);
      }
    } catch (err) {
      console.error("uPlot error:", err);
      plotContainerRef.innerHTML = `<div style="color: #ef4444; padding: 20px;">Chart error: ${err}</div>`;
    }
  };

  createEffect(() => {
    const currentData = data();
    if (!plotContainerRef) return;
    
    if (chartInstance) {
      const normalizedData = normalizeData(currentData);
      if (normalizedData && normalizedData.length >= 2 && normalizedData[0].length > 0) {
        chartInstance.setData(normalizedData);
        return;
      }
    }
    
    renderChart();
  });

  createEffect(on(
    () => [currentTheme.colors.accent, currentTheme.colors.background],
    () => {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
        renderChart();
      }
    },
    { defer: true }
  ));

  const componentStyles = () => {
    const styles: Record<string, string | number | undefined> = {};
    const grow = p.props.grow;
    const shrink = p.props.shrink;
    const force = p.props.force_dimensions;
    const w = p.props.width;
    
    if (grow != null) {
      styles["flex-grow"] = grow;
      styles["min-width"] = "0";
      styles["min-height"] = "0";
    }
    if (shrink != null) {
      styles["flex-shrink"] = shrink;
    }
    
    if (w != null) {
      if (w === "full") {
        styles.width = "100%";
      } else if (typeof w === "number") {
        styles.width = `${w}px`;
        if (force) {
          styles["flex-grow"] = 0;
          styles["flex-shrink"] = 0;
        }
      } else {
        styles.width = w;
      }
    } else {
      styles.width = "100%";
    }
    
    if (p.props.height != null && force) {
      styles.height = typeof p.props.height === "number" ? `${p.props.height}px` : p.props.height;
    }
    
    return styles;
  };

  const containerStyles = () => {
    const base = getChartContainerStyles();
    
    let borderStyle = base.border;
    if (p.props.border === false) {
      borderStyle = "none";
    } else {
      const width = p.props.borderWidth != null 
        ? (typeof p.props.borderWidth === "number" ? `${p.props.borderWidth}px` : p.props.borderWidth)
        : "2px";
      const color = p.props.borderColor || currentTheme.colors.foreground;
      borderStyle = `${width} solid ${color}`;
    }
    
    return {
      ...base,
      border: borderStyle,
      "border-radius": p.props.borderRadius || base["border-radius"],
    };
  };
  
  const titleStyles = () => {
    const defaults = getChartTitleStyles();
    const userStyle = p.props.titleStyle || {};
    return { ...defaults, ...userStyle };
  };

  return (
    <div 
      ref={containerRef}
      class="pynote-timeseries"
      style={{
        ...containerStyles(),
        ...componentStyles(),
        overflow: "hidden",
      }}
    >
      <Show when={p.props.title}>
        <div style={titleStyles()}>{p.props.title}</div>
      </Show>
      <div 
        ref={plotContainerRef}
        style={{
          width: "100%",
          "min-height": "100px",
        }}
      />
      <style>{`
        .pynote-timeseries .u-legend {
          font-family: ${currentTheme.font};
          font-size: 12px;
          padding: 8px 0;
        }
        .pynote-timeseries .u-legend th {
          color: ${currentTheme.colors.secondary};
          font-weight: normal;
        }
        .pynote-timeseries .u-legend td {
          color: ${currentTheme.colors.secondary};
        }
        .pynote-timeseries .u-legend .u-marker {
          width: 12px;
          height: 3px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
};

export default TimeSeries;
