import type { Component } from "solid-js";
import { lazy } from "solid-js";

export const ComponentRegistry: Record<string, Component<any>> = {
  // Core UI components
  "Slider": lazy(() => import("./Slider")),
  "Text": lazy(() => import("./Text")),
  "Group": lazy(() => import("./Group")),
  "Form": lazy(() => import("./Form")),
  "Button": lazy(() => import("./Button")),
  "Select": lazy(() => import("./Select")),
  "Input": lazy(() => import("./Input")),
  "Textarea": lazy(() => import("./Textarea")),
  "Toggle": lazy(() => import("./Toggle")),
  "Checkbox": lazy(() => import("./Checkbox")),
  
  // Chart components
  "Plot": lazy(() => import("./Plot")),           // Observable Plot - general purpose
  "TimeSeries": lazy(() => import("./TimeSeries")), // uPlot - high-performance time-series
  "Chart": lazy(() => import("./Chart")),          // Frappe Charts - pie, donut, heatmap
};
