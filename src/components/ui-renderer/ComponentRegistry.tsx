import type { Component } from "solid-js";
import { lazy } from "solid-js";

export const ComponentRegistry: Record<string, Component<any>> = {
  // Core UI components
  "Slider": lazy(() => import("./Slider")),
  "Text": lazy(() => import("./Text")),
  "Group": lazy(() => import("./Group")),
  
  // Chart components
  "Plot": lazy(() => import("./Plot")),           // Observable Plot - general purpose
  "TimeSeries": lazy(() => import("./TimeSeries")), // uPlot - high-performance time-series
  "Chart": lazy(() => import("./Chart")),          // Frappe Charts - pie, donut, heatmap
};
