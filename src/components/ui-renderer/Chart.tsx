/**
 * Chart Component - Frappe Charts Integration
 * 
 * Specialized chart types using Frappe Charts library.
 * Covers chart types not well-suited for Observable Plot or uPlot.
 * 
 * Features:
 * - Pie and Donut charts
 * - Heatmaps (GitHub-style)
 * - Percentage bars
 * - Mixed type charts
 * - Reactive updates from Python
 */

import { 
  type Component, 
  createEffect, 
  createSignal,
  onMount, 
  onCleanup,
  Show
} from "solid-js";
// @ts-ignore - Frappe charts doesn't have great types
import { Chart as FrappeChart } from "frappe-charts";
import { kernel } from "../../lib/pyodide";
import { 
  getFrappeTheme, 
  getFrappeCSS, 
  getChartContainerStyles, 
  getChartTitleStyles,
  generateColorPalette 
} from "../../lib/chart-theme";
import { currentTheme } from "../../lib/theme";

// Supported chart types
type ChartType = "pie" | "donut" | "percentage" | "heatmap" | "line" | "bar" | "axis-mixed";

// Data format for different chart types
interface PieData {
  labels: string[];
  values: number[];
}

interface HeatmapData {
  dataPoints: Record<string, number>;  // { "timestamp": count }
  start?: Date;
  end?: Date;
}

interface StandardData {
  labels: string[];
  datasets: Array<{
    name?: string;
    values: number[];
    chartType?: "line" | "bar";  // For axis-mixed
  }>;
}

type ChartData = PieData | HeatmapData | StandardData;

// Style dict type for user customization
type StyleDict = Record<string, string | number>;

interface ChartProps {
  id: string;
  props: {
    // Chart type
    type: ChartType;
    
    // Data (format depends on type)
    data: ChartData;
    
    // Common options
    title?: string;
    width?: number | string;  // Can be number, "100%", or "full"
    height?: number;
    
    // Colors (optional, auto-generated from theme if not provided)
    colors?: string[];
    
    // Pie/Donut specific
    maxSlices?: number;
    
    // Heatmap specific
    countLabel?: string;
    discreteDomains?: boolean;
    
    // Bar specific
    barOptions?: {
      spaceRatio?: number;
      stacked?: boolean;
    };
    
    // Line specific
    lineOptions?: {
      dotSize?: number;
      regionFill?: boolean;
      hideDots?: boolean;
      hideLine?: boolean;
      spline?: boolean;
    };
    
    // Axis options
    axisOptions?: {
      xAxisMode?: "span" | "tick";
      yAxisMode?: "span" | "tick";
      xIsSeries?: boolean;
    };
    
    // Tooltip
    tooltipOptions?: {
      formatTooltipX?: string;  // Function body as string
      formatTooltipY?: string;
    };
    
    // Animation
    animate?: boolean;
    
    // Border styling (consistent with pynote_ui components)
    border?: boolean;
    borderWidth?: number | string;
    borderRadius?: string;
    borderColor?: string;
    
    // Style customization dicts (user can override defaults)
    titleStyle?: StyleDict;
    xLabelStyle?: StyleDict;
    yLabelStyle?: StyleDict;
    tickStyle?: StyleDict;
    gridStyle?: StyleDict;
    axisStyle?: StyleDict;
    
    // Layout/flex props
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
  };
}

// Type guard for pie data
const isPieData = (data: ChartData): data is PieData => {
  return "labels" in data && "values" in data && !("datasets" in data);
};

// Type guard for heatmap data
const isHeatmapData = (data: ChartData): data is HeatmapData => {
  return "dataPoints" in data;
};

// Type guard for standard data
const isStandardData = (data: ChartData): data is StandardData => {
  return "datasets" in data;
};

const Chart: Component<ChartProps> = (p) => {
  const componentId = p.id;
  let containerRef: HTMLDivElement | undefined;
  let chartContainerRef: HTMLDivElement | undefined;
  let chartInstance: any = null;
  let isRendering = false;  // Prevent concurrent renders
  
  // Local reactive state for data
  const [data, setData] = createSignal<ChartData>(p.props.data);

  // Update data when props change
  createEffect(() => {
    if (p.props.data) {
      setData(p.props.data);
    }
  });

  // Register for kernel updates
  onMount(() => {
    kernel.registerComponentListener(componentId, (update: any) => {
      if (update.data !== undefined) {
        setData(update.data);
      }
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
    // Mark as rendering to prevent any in-flight updates
    isRendering = true;
    chartInstance = null;
    // Clear container safely
    if (chartContainerRef) {
      try {
        chartContainerRef.innerHTML = "";
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // Convert data to Frappe format
  const formatData = (chartData: ChartData, chartType: ChartType): any => {
    if (chartType === "pie" || chartType === "donut" || chartType === "percentage") {
      if (isPieData(chartData)) {
        return {
          labels: chartData.labels,
          datasets: [{ values: chartData.values }],
        };
      }
    }
    
    if (chartType === "heatmap") {
      if (isHeatmapData(chartData)) {
        return {
          dataPoints: chartData.dataPoints,
          start: chartData.start ? new Date(chartData.start) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: chartData.end ? new Date(chartData.end) : new Date(),
        };
      }
    }
    
    if (isStandardData(chartData)) {
      return chartData;
    }
    
    // Fallback
    return chartData;
  };

  // Calculate actual width from props
  const getChartWidth = (): number | undefined => {
    const w = p.props.width;
    if (w === "full" || w === "100%") {
      return chartContainerRef?.clientWidth || undefined;
    }
    if (typeof w === "number") return w;
    if (typeof w === "string" && w.endsWith("px")) {
      return parseInt(w, 10) || undefined;
    }
    // Default: let Frappe auto-size (undefined)
    return chartContainerRef?.clientWidth || undefined;
  };

  // Build chart options
  const buildOptions = () => {
    const theme = getFrappeTheme();
    const chartData = data();
    const chartType = p.props.type;
    
    // Get colors - default to theme palette
    const numColors = isPieData(chartData) ? chartData.labels.length : 
                      isStandardData(chartData) ? Math.max(chartData.datasets.length, chartData.labels?.length || 1) : 8;
    const colors = p.props.colors || generateColorPalette(currentTheme.colors.accent, numColors);
    
    const chartWidth = getChartWidth();
    
    const options: Record<string, any> = {
      data: formatData(chartData, chartType),
      type: chartType === "donut" ? "pie" : 
            chartType === "percentage" ? "percentage" : 
            chartType,
      colors,
      height: p.props.height || 300,
      animate: p.props.animate !== false ? 1 : 0,
    };
    
    // Only set width if we have a value (otherwise let Frappe auto-size)
    if (chartWidth) {
      // For Frappe, we need to account for padding in container
      options.width = chartWidth;
    }
    
    // Pie/Donut specific
    if (chartType === "pie" || chartType === "donut") {
      if (chartType === "donut") {
        options.type = "donut";
      }
      if (p.props.maxSlices) {
        options.maxSlices = p.props.maxSlices;
      }
    }
    
    // Heatmap specific
    if (chartType === "heatmap") {
      options.countLabel = p.props.countLabel || "Count";
      options.discreteDomains = p.props.discreteDomains !== false ? 1 : 0;
    }
    
    // Bar options
    if (chartType === "bar" || chartType === "axis-mixed") {
      options.barOptions = {
        spaceRatio: p.props.barOptions?.spaceRatio ?? theme.barOptions.spaceRatio,
        stacked: p.props.barOptions?.stacked ? 1 : 0,
      };
    }
    
    // Line options
    if (chartType === "line" || chartType === "axis-mixed") {
      options.lineOptions = {
        dotSize: p.props.lineOptions?.dotSize ?? theme.lineOptions.dotSize,
        regionFill: p.props.lineOptions?.regionFill ? 1 : 0,
        hideDots: p.props.lineOptions?.hideDots ? 1 : 0,
        hideLine: p.props.lineOptions?.hideLine ? 1 : 0,
        spline: p.props.lineOptions?.spline ? 1 : 0,
      };
    }
    
    // Axis options (for non-pie charts)
    if (chartType !== "pie" && chartType !== "donut" && chartType !== "percentage") {
      options.axisOptions = {
        xAxisMode: p.props.axisOptions?.xAxisMode ?? theme.axisOptions.xAxisMode,
        yAxisMode: p.props.axisOptions?.yAxisMode ?? theme.axisOptions.yAxisMode,
        xIsSeries: p.props.axisOptions?.xIsSeries ? 1 : 0,
      };
    }
    
    // Tooltip options
    options.tooltipOptions = {
      formatTooltipX: theme.tooltipOptions.formatTooltipX,
      formatTooltipY: theme.tooltipOptions.formatTooltipY,
    };
    
    return options;
  };

  // Render chart
  const renderChart = () => {
    if (!chartContainerRef || isRendering) return;
    
    isRendering = true;
    
    const chartData = data();
    
    // Validate data
    if (!chartData) {
      chartContainerRef.innerHTML = '<div style="color: var(--secondary); padding: 20px; text-align: center;">No data</div>';
      isRendering = false;
      return;
    }
    
    // Validate based on type
    if ((p.props.type === "pie" || p.props.type === "donut" || p.props.type === "percentage") && isPieData(chartData)) {
      if (!chartData.labels?.length || !chartData.values?.length) {
        chartContainerRef.innerHTML = '<div style="color: var(--secondary); padding: 20px; text-align: center;">No data</div>';
        isRendering = false;
        return;
      }
    }

    try {
      // Clear existing chart instance
      chartInstance = null;
      
      // Clear container safely
      try {
        chartContainerRef.innerHTML = "";
      } catch {
        // Ignore if already detached
      }
      
      const options = buildOptions();
      chartInstance = new FrappeChart(chartContainerRef, options);
    } catch (err) {
      console.error("Frappe Chart error:", err);
      try {
        chartContainerRef.innerHTML = `<div style="color: #ef4444; padding: 20px;">Chart error: ${err}</div>`;
      } catch {
        // Ignore if container is detached
      }
    } finally {
      isRendering = false;
    }
  };

  // Re-render when data changes
  createEffect(() => {
    const chartData = data();
    
    // Skip if currently rendering
    if (isRendering || !chartContainerRef) return;
    
    // Try to update existing chart
    if (chartInstance && chartInstance.update) {
      try {
        const formattedData = formatData(chartData, p.props.type);
        chartInstance.update(formattedData);
        return;
      } catch {
        // Fall through to full re-render
        chartInstance = null;
      }
    }
    
    requestAnimationFrame(renderChart);
  });

  // Re-render on theme change
  createEffect(() => {
    currentTheme.colors.accent;
    currentTheme.colors.background;
    
    // Skip if currently rendering
    if (isRendering || !chartContainerRef) return;
    
    // Force full re-render on theme change
    chartInstance = null;
    requestAnimationFrame(renderChart);
  });

  // Initial render
  onMount(() => {
    renderChart();
  });

  // Component layout styles
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
    
    // Width handling: "full" means 100%, numbers become px
    if (w != null) {
      if (w === "full") {
        styles.width = "100%";
      } else if (typeof w === "number") {
        if (force) {
          styles.width = `${w}px`;
          styles["flex-grow"] = 0;
          styles["flex-shrink"] = 0;
        } else {
          styles.width = `${w}px`;
        }
      } else {
        styles.width = w;
      }
    } else {
      // Default: fill available width
      styles.width = "100%";
    }
    
    if (p.props.height != null && force) {
      styles.height = typeof p.props.height === "number" ? `${p.props.height}px` : p.props.height;
    }
    
    return styles;
  };

  const containerStyles = () => {
    const base = getChartContainerStyles();
    
    // Build border string based on props
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
  
  // Merge default title styles with user-provided overrides
  const titleStyles = () => {
    const defaults = getChartTitleStyles();
    const userStyle = p.props.titleStyle || {};
    return { ...defaults, ...userStyle };
  };
  const frappeCSS = getFrappeCSS();

  return (
    <div 
      ref={containerRef}
      class="pynote-chart"
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
        ref={chartContainerRef}
        style={{
          width: "100%",
          "min-height": "100px",
        }}
      />
      {/* Inject Frappe-specific styles for theme */}
      <style>{frappeCSS}</style>
    </div>
  );
};

export default Chart;
