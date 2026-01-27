/**
 * Plot Component - Observable Plot Integration
 * 
 * General-purpose declarative plotting using Observable Plot.
 * Supports reactive data binding from pynote_ui Python elements.
 * 
 * Features:
 * - Line, scatter, bar, area charts
 * - Reactive updates via kernel communication
 * - Consistent theming with pynote
 * - Automatic scaling and axis formatting
 */

import { 
  type Component, 
  createEffect, 
  createSignal,
  onMount, 
  onCleanup,
  Show
} from "solid-js";
import * as OPlot from "@observablehq/plot";
import { kernel } from "../../lib/pyodide";
import { getObservablePlotTheme, getChartContainerStyles, getChartTitleStyles, withAlpha } from "../../lib/chart-theme";
import { currentTheme } from "../../lib/theme";

// Supported mark types
type MarkType = "line" | "dot" | "bar" | "barY" | "barX" | "area" | "areaY" | "cell" | "rect" | "rule" | "text";

// Style dict type for user customization
type StyleDict = Record<string, string | number>;

interface PlotProps {
  id: string;
  props: {
    // Data
    data: Array<Record<string, any>>;
    
    // Mark configuration
    mark?: MarkType;
    x: string;
    y: string;
    
    // Optional encodings
    color?: string;           // Column name for color encoding
    size?: string;            // Column name for size encoding
    opacity?: string;         // Column name for opacity encoding
    fill?: string;            // Static fill color or column name
    stroke?: string;          // Static stroke color or column name
    
    // Multiple series support
    series?: string;          // Column name for series grouping
    
    // Axis configuration
    xLabel?: string;
    yLabel?: string;
    xDomain?: [number, number];
    yDomain?: [number, number];
    xType?: "linear" | "log" | "time" | "band" | "point";
    yType?: "linear" | "log" | "time" | "band" | "point";
    
    // Grid
    grid?: boolean;
    
    // Dimensions (width can be number, string like "100%" or "full")
    width?: number | string;
    height?: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
    
    // Title
    title?: string;
    
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
    
    // Layout/flex props (consistent with other pynote_ui components)
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
  };
}

const Plot: Component<PlotProps> = (p) => {
  const componentId = p.id;
  let containerRef: HTMLDivElement | undefined;
  let plotContainerRef: HTMLDivElement | undefined;
  
  // Local reactive state for data (can be updated from Python)
  const [data, setData] = createSignal<Array<Record<string, any>>>(p.props.data || []);

  // Update data when props change
  createEffect(() => {
    if (p.props.data) {
      setData(p.props.data);
    }
  });

  // Register for kernel updates (reactive data changes from Python)
  onMount(() => {
    kernel.registerComponentListener(componentId, (update: any) => {
      if (update.data !== undefined) {
        setData(update.data);
      }
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

  // Build mark function based on type
  const buildMark = (markType: MarkType, plotData: any[], theme: ReturnType<typeof getObservablePlotTheme>) => {
    const markOptions: Record<string, any> = {
      x: p.props.x,
      y: p.props.y,
    };
    
    // Apply encodings
    if (p.props.color) markOptions.stroke = p.props.color;
    if (p.props.size) markOptions.r = p.props.size;
    if (p.props.opacity) markOptions.opacity = p.props.opacity;
    if (p.props.series) markOptions.z = p.props.series;
    
    // Static color overrides
    if (p.props.stroke && !p.props.color) {
      markOptions.stroke = p.props.stroke;
    } else if (!p.props.color) {
      markOptions.stroke = theme.marks.stroke;
    }
    
    if (p.props.fill) {
      markOptions.fill = p.props.fill;
    }
    
    // Stroke width
    markOptions.strokeWidth = theme.marks.strokeWidth;

    // Select mark function
    switch (markType) {
      case "line":
        return OPlot.line(plotData, markOptions);
      
      case "dot":
        // Dots use fill instead of stroke by default
        if (!markOptions.fill) {
          markOptions.fill = markOptions.stroke;
          delete markOptions.stroke;
        }
        markOptions.r = markOptions.r || 4;
        return OPlot.dot(plotData, markOptions);
      
      case "bar":
      case "barY":
        markOptions.fill = markOptions.fill || markOptions.stroke || theme.marks.stroke;
        delete markOptions.stroke;
        return OPlot.barY(plotData, markOptions);
      
      case "barX":
        markOptions.fill = markOptions.fill || markOptions.stroke || theme.marks.stroke;
        delete markOptions.stroke;
        return OPlot.barX(plotData, markOptions);
      
      case "area":
      case "areaY":
        markOptions.fill = markOptions.fill || withAlpha(theme.marks.stroke, 0.4);
        markOptions.stroke = markOptions.stroke || theme.marks.stroke;
        return OPlot.areaY(plotData, markOptions);
      
      case "cell":
        markOptions.fill = markOptions.fill || theme.marks.stroke;
        delete markOptions.stroke;
        return OPlot.cell(plotData, markOptions);
      
      case "rect":
        markOptions.fill = markOptions.fill || withAlpha(theme.marks.stroke, 0.4);
        return OPlot.rect(plotData, markOptions);
      
      case "rule":
        return OPlot.ruleY(plotData, markOptions);
      
      case "text":
        markOptions.fill = theme.axes.labelColor;
        markOptions.text = p.props.y;  // Use y as text by default
        return OPlot.text(plotData, markOptions);
      
      default:
        return OPlot.line(plotData, markOptions);
    }
  };

  // Calculate actual width from props
  const getPlotWidth = (): number => {
    const w = p.props.width;
    if (w === "full" || w === "100%") {
      return plotContainerRef?.clientWidth || 600;
    }
    if (typeof w === "number") return w;
    if (typeof w === "string" && w.endsWith("px")) {
      return parseInt(w, 10) || 600;
    }
    // Default or auto
    return plotContainerRef?.clientWidth || 600;
  };

  // Render plot
  const renderPlot = () => {
    if (!plotContainerRef) return;
    
    const plotData = data();
    if (!plotData || plotData.length === 0) {
      plotContainerRef.innerHTML = '<div style="color: var(--secondary); padding: 20px; text-align: center;">No data</div>';
      return;
    }

    const theme = getObservablePlotTheme();
    const markType = p.props.mark || "line";
    const plotWidth = getPlotWidth();
    
    // Build plot options
    const plotOptions: Record<string, any> = {
      width: plotWidth,
      height: p.props.height || 380,
      style: {
        ...theme.style,
        background: "transparent", // Let container handle background
      },
      marginTop: p.props.marginTop ?? 40,
      marginRight: p.props.marginRight ?? 30,
      marginBottom: p.props.marginBottom ?? 50,
      marginLeft: p.props.marginLeft ?? 60,
    };

    // Grid color (can be customized via gridStyle prop)
    const gridColor = p.props.gridStyle?.stroke || theme.grid.stroke;

    // X axis configuration with proper styling
    // Observable Plot: labelArrow controls arrow, label is the text
    plotOptions.x = {
      label: p.props.xLabel ?? p.props.x,
      type: p.props.xType,
      domain: p.props.xDomain,
      grid: p.props.grid,
      tickFormat: undefined,
      line: true,
      labelOffset: 40,
      labelAnchor: "center",
      labelArrow: "none",
    };

    // Y axis configuration  
    plotOptions.y = {
      label: p.props.yLabel ?? p.props.y,
      type: p.props.yType,
      domain: p.props.yDomain,
      grid: p.props.grid !== false, // Grid on by default for Y
      line: true,
      labelOffset: 50,
      labelAnchor: "center",
      labelArrow: "none",
    };
    
    // Grid styling
    if (p.props.grid !== false) {
      plotOptions.grid = {
        stroke: gridColor,
        strokeOpacity: theme.grid.strokeOpacity,
      };
    }

    // Color scale if using color encoding
    if (p.props.color || p.props.series) {
      plotOptions.color = {
        scheme: "observable10",
        legend: true,
      };
    }

    // Build marks array
    const marks: any[] = [];
    
    // Add subtle frame
    marks.push(OPlot.frame({ stroke: theme.axes.stroke, strokeOpacity: 0.3 }));
    
    // Zero line for reference (if data spans negative/positive)
    const yValues = plotData.map(d => d[p.props.y]).filter(v => typeof v === "number");
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    if (minY < 0 && maxY > 0) {
      marks.push(OPlot.ruleY([0], { stroke: theme.axes.stroke, strokeOpacity: 0.5 }));
    }
    
    // Main data mark
    marks.push(buildMark(markType, plotData, theme));
    
    plotOptions.marks = marks;

    // Clear and render
    plotContainerRef.innerHTML = "";
    
    try {
      const plot = OPlot.plot(plotOptions);
      plotContainerRef.appendChild(plot);
    } catch (err) {
      console.error("Observable Plot error:", err);
      plotContainerRef.innerHTML = `<div style="color: #ef4444; padding: 20px;">Plot error: ${err}</div>`;
    }
  };

  // Re-render when data or relevant props change
  createEffect(() => {
    // Access reactive dependencies
    data();
    currentTheme.colors.accent;
    currentTheme.colors.background;
    
    // Schedule render
    if (plotContainerRef) {
      requestAnimationFrame(renderPlot);
    }
  });

  // Initial render on mount
  onMount(() => {
    renderPlot();
  });

  // Component layout styles (consistent with other pynote_ui components)
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
      // Default: fit to content but allow growing
      styles.width = "fit-content";
      styles["min-width"] = "300px";
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

  return (
    <div 
      ref={containerRef}
      class="pynote-plot"
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
          display: "flex",
          "justify-content": "center",
          "align-items": "center",
          "min-height": "100px",
        }}
      />
    </div>
  );
};

export default Plot;
