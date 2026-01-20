import type { Component } from "solid-js";
import { lazy } from "solid-js";

export const ComponentRegistry: Record<string, Component<any>> = {
  "Slider": lazy(() => import("./Slider")),
  "Text": lazy(() => import("./Text")),
  "Group": lazy(() => import("./Group")),
};
