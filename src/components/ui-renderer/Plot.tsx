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
type MarkType = "line" | "lineX" | "lineY" | "dot" | "dotX" | "dotY" | "bar" | "barY" | "barX" | 
                "area" | "areaY" | "areaX" | "cell" | "rect" | "rectY" | "rectX" | 
                "rule" | "ruleY" | "ruleX" | "text" | "box" | "boxX" | "boxY" |
                "waffleY" | "waffleX" | "hexbin";

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
    
    // Color scheme (for hexbin, heatmaps, etc.)
    colorScheme?: string;           // Observable Plot color schemes: "turbo", "viridis", "YlGnBu", etc.
    
    // Transforms and binning
    reduce?: string;                // "count", "sum", "proportion", "mean", etc.
    thresholds?: number | number[]; // Number of bins or explicit bin edges
    bin?: any;                      // Explicit binning specification
    curve?: string;                 // "linear", "step", "basis", "cardinal", "catmull-rom", "monotone-x", etc.
    sort?: any;                     // Sort specification {x: "-y"} or column name
    interval?: any;                 // Time/numeric interval
    
    // Mark styling
    inset?: number;                 // Spacing between bars/rects
    insetTop?: number;
    insetRight?: number;
    insetBottom?: number;
    insetLeft?: number;
    marker?: string;                // Line markers: "dot", "arrow", etc.
    r?: number | string;            // Radius for dots
    symbol?: string;                // Symbol type for dots
    strokeWidth?: number;           // Stroke width
    fillOpacity?: number;           // Fill opacity
    strokeOpacity?: number;         // Stroke opacity
    
    // Waffle-specific options
    unit?: number;                  // Quantity each waffle cell represents
    gap?: number;                   // Gap between waffle cells in pixels
    rx?: number | string;           // Corner radius (use "100%" for circles)
    multiple?: number;              // Number of cells per row (default: determined by plot width)
    labelPosition?: "top" | "bottom";  // Where to place category labels (default: bottom)
    
    // Waffle background (for showing total vs filled)
    backgroundY?: number;           // Total value to show as faded background waffle
    backgroundX?: number;           // Total value for horizontal waffle background
    backgroundFill?: string;        // Fill color for background waffle (can include alpha, e.g. "rgba(255,165,0,0.4)")
    
    // Hexbin-specific options
    binWidth?: number;              // Distance between hexagon centers in pixels
    
    // Additional position channels
    x1?: string;
    x2?: string;
    y1?: string;
    y2?: string;
    z?: string;                     // Series grouping
    
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
    const markOptions: Record<string, any> = {};
    
    // Only set x/y if they're actually defined (not null/undefined)
    // For histograms with binning, y is computed by the reduce operation
    if (p.props.x !== undefined && p.props.x !== null) markOptions.x = p.props.x;
    if (p.props.y !== undefined && p.props.y !== null) markOptions.y = p.props.y;
    
    // Additional position channels
    if (p.props.x1 !== undefined) markOptions.x1 = p.props.x1;
    if (p.props.x2 !== undefined) markOptions.x2 = p.props.x2;
    if (p.props.y1 !== undefined) markOptions.y1 = p.props.y1;
    if (p.props.y2 !== undefined) markOptions.y2 = p.props.y2;
    
    // Apply encodings
    if (p.props.color) markOptions.stroke = p.props.color;
    if (p.props.size) markOptions.r = p.props.size;
    if (p.props.r !== undefined) markOptions.r = p.props.r;
    if (p.props.opacity) markOptions.opacity = p.props.opacity;
    if (p.props.series) markOptions.z = p.props.series;
    if (p.props.z) markOptions.z = p.props.z;
    if (p.props.symbol) markOptions.symbol = p.props.symbol;
    
    // Transforms and binning
    if (p.props.reduce !== undefined) markOptions.reduce = p.props.reduce;
    if (p.props.thresholds !== undefined) markOptions.thresholds = p.props.thresholds;
    if (p.props.bin !== undefined) markOptions.bin = p.props.bin;
    if (p.props.curve !== undefined) markOptions.curve = p.props.curve;
    if (p.props.sort !== undefined) markOptions.sort = p.props.sort;
    if (p.props.interval !== undefined) markOptions.interval = p.props.interval;
    
    // Mark styling
    if (p.props.inset !== undefined) markOptions.inset = p.props.inset;
    if (p.props.insetTop !== undefined) markOptions.insetTop = p.props.insetTop;
    if (p.props.insetRight !== undefined) markOptions.insetRight = p.props.insetRight;
    if (p.props.insetBottom !== undefined) markOptions.insetBottom = p.props.insetBottom;
    if (p.props.insetLeft !== undefined) markOptions.insetLeft = p.props.insetLeft;
    if (p.props.marker !== undefined) markOptions.marker = p.props.marker;
    if (p.props.strokeWidth !== undefined) markOptions.strokeWidth = p.props.strokeWidth;
    if (p.props.fillOpacity !== undefined) markOptions.fillOpacity = p.props.fillOpacity;
    if (p.props.strokeOpacity !== undefined) markOptions.strokeOpacity = p.props.strokeOpacity;
    
    // Waffle-specific options
    if (p.props.unit !== undefined) markOptions.unit = p.props.unit;
    if (p.props.gap !== undefined) markOptions.gap = p.props.gap;
    if (p.props.rx !== undefined) markOptions.rx = p.props.rx;
    if (p.props.multiple !== undefined) markOptions.multiple = p.props.multiple;
    
    // Hexbin-specific options
    if (p.props.binWidth !== undefined) markOptions.binWidth = p.props.binWidth;
    
    // Static color overrides
    if (p.props.stroke && !p.props.color) {
      markOptions.stroke = p.props.stroke;
    } else if (!p.props.color) {
      markOptions.stroke = theme.marks.stroke;
    }
    
    if (p.props.fill) {
      markOptions.fill = p.props.fill;
    }
    
    // Stroke width (only set default if not provided)
    if (markOptions.strokeWidth === undefined) {
      markOptions.strokeWidth = theme.marks.strokeWidth;
    }

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
      
      case "dotY":
        // Stacked dots - use dot with stackY2 transform
        // stackY2 gives proper y2 positioning for each dot
        if (!markOptions.fill) {
          markOptions.fill = markOptions.stroke || theme.marks.stroke;
        }
        delete markOptions.stroke;
        delete markOptions.strokeWidth;
        markOptions.r = markOptions.r || 6;
        // Only default y=1 if not already specified (allows bidirectional stacking)
        if (markOptions.y === undefined) {
          markOptions.y = 1;
        }
        return OPlot.dot(plotData, OPlot.stackY2(markOptions));
      
      case "dotX":
        // Stacked dots horizontally - use dot with stackX2 transform
        if (!markOptions.fill) {
          markOptions.fill = markOptions.stroke || theme.marks.stroke;
        }
        delete markOptions.stroke;
        delete markOptions.strokeWidth;
        markOptions.r = markOptions.r || 6;
        // Only default x=1 if not already specified
        if (markOptions.x === undefined) {
          markOptions.x = 1;
        }
        return OPlot.dot(plotData, OPlot.stackX2(markOptions));
      
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
      
      case "rectY":
        markOptions.fill = markOptions.fill || markOptions.stroke || theme.marks.stroke;
        delete markOptions.stroke;
        return OPlot.rectY(plotData, markOptions);
      
      case "rectX":
        markOptions.fill = markOptions.fill || markOptions.stroke || theme.marks.stroke;
        delete markOptions.stroke;
        return OPlot.rectX(plotData, markOptions);
      
      case "rule":
        return OPlot.ruleY(plotData, markOptions);
      
      case "ruleY":
        return OPlot.ruleY(plotData, markOptions);
      
      case "ruleX":
        return OPlot.ruleX(plotData, markOptions);
      
      case "lineX":
        return OPlot.lineX(plotData, markOptions);
      
      case "lineY":
        return OPlot.lineY(plotData, markOptions);
      
      case "areaX":
        markOptions.fill = markOptions.fill || withAlpha(theme.marks.stroke, 0.4);
        markOptions.stroke = markOptions.stroke || theme.marks.stroke;
        return OPlot.areaX(plotData, markOptions);
      
      case "boxX":
        return OPlot.boxX(plotData, markOptions);
      
      case "boxY":
        return OPlot.boxY(plotData, markOptions);
      
      case "text":
        markOptions.fill = theme.axes.labelColor;
        markOptions.text = p.props.y;  // Use y as text by default
        return OPlot.text(plotData, markOptions);
      
      case "waffleY":
        markOptions.fill = markOptions.fill || markOptions.stroke || theme.marks.stroke;
        delete markOptions.stroke;
        // For waffleY, use fx (facet x) for categories instead of x
        // This is how Observable Plot's waffle examples work
        if (markOptions.x) {
          markOptions.fx = markOptions.x;
          delete markOptions.x;
        }
        return OPlot.waffleY(plotData, markOptions);
      
      case "waffleX":
        markOptions.fill = markOptions.fill || markOptions.stroke || theme.marks.stroke;
        delete markOptions.stroke;
        // For waffleX, use fy (facet y) for categories instead of y
        if (markOptions.y) {
          markOptions.fy = markOptions.y;
          delete markOptions.y;
        }
        return OPlot.waffleX(plotData, markOptions);
      
      case "hexbin": {
        // Hexbin is a transform applied to dots
        // Build hexbin outputs based on what channels are specified
        const hexbinOutputs: Record<string, any> = {};
        
        // Default to count for fill if fill is "count" or not a data column
        if (markOptions.fill === "count" || !markOptions.fill) {
          hexbinOutputs.fill = "count";
          delete markOptions.fill;
        }
        // Support r="count" for sized hexagons
        if (markOptions.r === "count") {
          hexbinOutputs.r = "count";
          delete markOptions.r;
        }
        
        // Apply hexbin transform to dot mark
        // The hexbin transform auto-sets symbol to "hexagon"
        return OPlot.dot(plotData, OPlot.hexbin(hexbinOutputs as any, markOptions));
      }
      
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
    
    // Check if this is a waffle mark (needs special handling)
    const isWaffleMark = markType === "waffleY" || markType === "waffleX";
    // Check if this is a stacked dot mark
    const isStackedDotMark = markType === "dotY" || markType === "dotX";
    
    // Determine if we have y-axis labels (affects left margin)
    const hasYLabel = p.props.yLabel !== undefined || (p.props.y !== undefined && !isStackedDotMark && !isWaffleMark);
    
    // Build plot options
    const plotOptions: Record<string, any> = {
      width: plotWidth,
      height: p.props.height || 380,
      style: {
        ...theme.style,
        background: "transparent", // Let container handle background
      },
      marginTop: p.props.marginTop ?? (isStackedDotMark ? 30 : 20),
      marginRight: p.props.marginRight ?? (isStackedDotMark ? 30 : 20),
      marginBottom: p.props.marginBottom ?? 50,
      marginLeft: p.props.marginLeft ?? (p.props.yLabel ? 70 : (hasYLabel ? 60 : 30)),
      // Don't clip waffle or stacked dot marks - they need room for their cells/dots
      clip: (isWaffleMark || isStackedDotMark) ? false : true,
    };

    // Grid color (can be customized via gridStyle prop)
    const gridColor = p.props.gridStyle?.stroke || theme.grid.stroke;

    // For waffle charts, use faceting (fx) for categories and hide numeric axes
    // This matches Observable Plot's intended usage
    if (isWaffleMark) {
      // Waffle charts should hide both axes - cells don't align with ticks
      plotOptions.axis = null;
      plotOptions.label = null;
      
      // Determine label position - default to bottom
      const labelPosition = p.props.labelPosition || "bottom";
      const isTopLabels = labelPosition === "top";
      
      // Consistent margins on all sides for balanced look
      // Extra space on label side for the axisFx mark
      plotOptions.marginTop = p.props.marginTop ?? (isTopLabels ? 50 : 40);
      plotOptions.marginRight = p.props.marginRight ?? 20;
      plotOptions.marginBottom = p.props.marginBottom ?? (isTopLabels ? 40 : 50);
      plotOptions.marginLeft = p.props.marginLeft ?? 20;
      
      // Use fx (facet x) scale - disable default axis, we'll add our own
      plotOptions.fx = {
        axis: null,  // Disable default axis to control spacing ourselves
        label: null,
        padding: 0.15,
      };
    } else if (isStackedDotMark) {
      // Stacked dots: detect if bidirectional based on data
      // For dotY (vertical): check y values for +/- (stacks up/down)
      // For dotX (horizontal): check x values for +/- (stacks left/right)
      const isHorizontal = markType === "dotX";
      const stackCol = isHorizontal ? p.props.x : p.props.y;
      let isBidirectional = false;
      if (stackCol && plotData.length > 0) {
        const stackValues = plotData.map(d => d[stackCol]).filter(v => typeof v === "number");
        const hasNegative = stackValues.some(v => v < 0);
        const hasPositive = stackValues.some(v => v > 0);
        isBidirectional = hasNegative && hasPositive;
      }
      
      if (isHorizontal) {
        // Horizontal stacking (dotX): x-axis has the stacking direction
        plotOptions.x = {
          label: p.props.xLabel || null,
          domain: p.props.xDomain,
          grid: true,
          // Only use Math.abs for bidirectional (so -5 and 5 both show as "5")
          tickFormat: isBidirectional ? Math.abs : undefined,
          labelAnchor: "center",
          labelArrow: "none",
        };
        
        // Y-axis config - for bidirectional horizontal, don't show left axis line (zero line replaces it)
        plotOptions.y = {
          label: p.props.yLabel ?? p.props.y,
          type: p.props.yType,
          domain: p.props.yDomain,
          line: !isBidirectional,  // Hide axis line for bidirectional (zero line replaces it)
          labelOffset: 50,
          labelAnchor: "center", 
          labelArrow: "none",
        };
      } else {
        // Vertical stacking (dotY): y-axis has the stacking direction
        plotOptions.y = {
          label: p.props.yLabel || null,
          domain: p.props.yDomain,
          grid: true,
          // Only use Math.abs for bidirectional (so -5 and 5 both show as "5")
          tickFormat: isBidirectional ? Math.abs : undefined,
          labelAnchor: "center",
          labelArrow: "none",
        };
        
        // X-axis config - for bidirectional vertical, don't show bottom axis line (zero line replaces it)
        plotOptions.x = {
          label: p.props.xLabel ?? p.props.x,
          type: p.props.xType,
          domain: p.props.xDomain,
          line: !isBidirectional,  // Hide axis line for bidirectional (zero line replaces it)
          labelOffset: 40,
          labelAnchor: "center", 
          labelArrow: "none",
        };
      }
    } else {
      // Standard axis configuration
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
    }
    
    // Grid styling (only for standard charts, not waffle or stacked dots)
    if (p.props.grid !== false && !isWaffleMark && !isStackedDotMark) {
      plotOptions.grid = {
        stroke: gridColor,
        strokeOpacity: theme.grid.strokeOpacity,
      };
    }

    // Color scale if using color encoding
    // For stacked dots, fill can be a column name for categorical coloring
    const fillIsColumn = p.props.fill && plotData.length > 0 && 
      typeof plotData[0][p.props.fill] !== "undefined";
    
    if (p.props.color || p.props.series || p.props.colorScheme || fillIsColumn) {
      plotOptions.color = {
        scheme: p.props.colorScheme || "observable10",
        legend: true,
      };
    }

    // Build marks array
    const marks: any[] = [];
    
    // Add subtle frame (but not for waffle or stacked dot charts which look better without)
    if (!isWaffleMark && !isStackedDotMark) {
      marks.push(OPlot.frame({ stroke: theme.axes.stroke, strokeOpacity: 0.3 }));
    }
    
    // Zero line for reference (if data spans negative/positive) - not for waffles or stacked dots
    if (!isWaffleMark && !isStackedDotMark) {
      const yValues = plotData.map(d => d[p.props.y]).filter(v => typeof v === "number");
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      if (minY < 0 && maxY > 0) {
        marks.push(OPlot.ruleY([0], { stroke: theme.axes.stroke, strokeOpacity: 0.5 }));
      }
    }
    
    // For stacked dots, add a zero line for bidirectional stacking
    if (isStackedDotMark) {
      const isHorizontal = markType === "dotX";
      const stackCol = isHorizontal ? p.props.x : p.props.y;
      
      if (stackCol) {
        // Check if stack column has both positive and negative values (bidirectional)
        const stackValues = plotData.map(d => d[stackCol]).filter(v => typeof v === "number");
        const hasNegative = stackValues.some(v => v < 0);
        const hasPositive = stackValues.some(v => v > 0);
        if (hasNegative && hasPositive) {
          if (isHorizontal) {
            // Horizontal bidirectional: vertical line at x=0
            marks.push(OPlot.ruleX([0], { stroke: theme.axes.stroke, strokeWidth: 1.5 }));
          } else {
            // Vertical bidirectional: horizontal line at y=0
            marks.push(OPlot.ruleY([0], { stroke: theme.axes.stroke, strokeWidth: 1.5 }));
          }
        }
      }
    }
    
    // For waffle charts, add axisFx mark for category labels with text wrap
    if (isWaffleMark) {
      const labelPosition = p.props.labelPosition || "bottom";
      marks.push(OPlot.axisFx({
        lineWidth: 12,  // Characters before wrap
        anchor: labelPosition,
        tickSize: 0,
        // Push bottom labels down into the margin area
        dy: labelPosition === "bottom" ? 15 : 0,
        fill: theme.axes.labelColor,
        fontWeight: "normal",
        fontSize: 12,
      }));
    }
    
    // Main data mark (with optional binning transform)
    let mark = buildMark(markType, plotData, theme);
    
    // Apply binning transform if thresholds/reduce are specified
    // Observable Plot requires binX/binY wrapper for histograms
    if (p.props.thresholds !== undefined || p.props.reduce !== undefined) {
      const outputs: Record<string, any> = {};
      const binOptions: Record<string, any> = {};
      
      // Determine bin orientation based on mark type
      const binOnX = markType === "rectY" || markType === "barY";
      const binOnY = markType === "rectX" || markType === "barX";
      
      if (binOnX) {
        // binX: bin on x, output y
        outputs.y = p.props.reduce || "count";
        if (p.props.x) binOptions.x = p.props.x;
        if (p.props.fill) binOptions.fill = p.props.fill;
        if (p.props.stroke) binOptions.stroke = p.props.stroke;
        if (p.props.thresholds) binOptions.thresholds = p.props.thresholds;
        if (p.props.inset !== undefined) binOptions.inset = p.props.inset;
        
        mark = OPlot.rectY(plotData, OPlot.binX(outputs, binOptions));
      } else if (binOnY) {
        // binY: bin on y, output x
        outputs.x = p.props.reduce || "count";
        if (p.props.y) binOptions.y = p.props.y;
        if (p.props.fill) binOptions.fill = p.props.fill;
        if (p.props.stroke) binOptions.stroke = p.props.stroke;
        if (p.props.thresholds) binOptions.thresholds = p.props.thresholds;
        if (p.props.inset !== undefined) binOptions.inset = p.props.inset;
        
        mark = OPlot.rectX(plotData, OPlot.binY(outputs, binOptions));
      }
    }
    
    // For waffle charts, add background waffle showing total (before main mark)
    if (isWaffleMark) {
      const backgroundTotal = markType === "waffleY" ? p.props.backgroundY : p.props.backgroundX;
      if (backgroundTotal !== undefined) {
        const bgMarkOptions: Record<string, any> = {};
        // Copy rx for rounded corners
        if (p.props.rx !== undefined) {
          bgMarkOptions.rx = p.props.rx;
        }
        // Use backgroundFill if provided, otherwise default to semi-transparent version of main fill
        if (p.props.backgroundFill) {
          bgMarkOptions.fill = p.props.backgroundFill;
        } else {
          // Default: same color as main waffle with 0.4 opacity
          bgMarkOptions.fill = p.props.fill || p.props.stroke || theme.marks.stroke;
          bgMarkOptions.fillOpacity = 0.4;
        }
        
        if (markType === "waffleY") {
          bgMarkOptions.y = backgroundTotal;
          marks.push(OPlot.waffleY({ length: 1 }, bgMarkOptions));
        } else {
          bgMarkOptions.x = backgroundTotal;
          marks.push(OPlot.waffleX({ length: 1 }, bgMarkOptions));
        }
      }
    }
    
    marks.push(mark);
    
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

  // Check mark type for overflow handling
  const markType = () => p.props.mark || "line";
  const needsOverflow = () => {
    const mt = markType();
    return mt === "dotY" || mt === "dotX" || mt === "waffleY" || mt === "waffleX";
  };

  return (
    <div 
      ref={containerRef}
      class="pynote-plot"
      style={{
        ...containerStyles(),
        ...componentStyles(),
        overflow: needsOverflow() ? "visible" : "hidden",
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
