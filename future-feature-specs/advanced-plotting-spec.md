# Future Feature: Additional Plotting Libraries (Heavy/Familiar)

## Overview

This document specifies **future** plotting integrations for users who need 
familiar APIs or specialized chart types not covered by the core trio:

- **Plot** (Observable Plot) - general purpose
- **TimeSeries** (uPlot) - high-performance time-series  
- **Chart** (Frappe Charts) - pie, donut, heatmap, percentage

These additions are lower priority as they add significant bundle weight 
and should be lazy-loaded only when explicitly used.

## Priority: Low
## Target: v0.5.0+

---

## 1. Plotly Integration

### Bundle Size: ~1MB (lazy-loaded)

### Use Cases
- 3D scatter/surface plots
- Geographic maps (choropleth)
- Complex subplots
- Users familiar with `plotly.py`

### Python API
```python
import plotly.express as px
from pynote_ui import plotly

fig = px.scatter_3d(df, x='x', y='y', z='z', color='category')
plotly(fig)
```

### Implementation Notes
- Use `plotly.js-dist-min` for smaller bundle
- Lazy-load via dynamic `import()`
- Apply pynote theme to layout
- Consider `Plotly.react()` for optimized updates

### Component Structure
```tsx
// src/components/ui-renderer/PlotlyChart.tsx
import { lazy } from "solid-js";

// Lazy load plotly.js only when component is used
const Plotly = lazy(() => import("plotly.js-dist-min"));

const PlotlyChart: Component<PlotlyChartProps> = (p) => {
  // ... implementation
};
```

---

## 2. Altair / Vega-Lite Integration

### Bundle Size: ~500KB (lazy-loaded)

### Use Cases
- Declarative grammar of graphics
- Linked brushing / selections
- Users from data science background

### Python API
```python
import altair as alt
from pynote_ui import vega

chart = alt.Chart(df).mark_point().encode(x='x:Q', y='y:Q')
vega(chart)
```

### Implementation Notes
- Use `vega-embed` for rendering
- Extract spec via `chart.to_dict()`
- Investigate bridging Vega selections to pynote signals

---

## 3. ECharts Integration

### Bundle Size: ~400KB (with tree-shaking, lazy-loaded)

### Use Cases
- Sankey diagrams
- Sunburst charts
- Graph/network visualizations
- Geographic maps (China-focused)
- Users needing extensive customization

### Python API
```python
from pynote_ui import echarts

echarts({
    "series": [{
        "type": "sankey",
        "data": nodes,
        "links": links
    }]
})
```

### Implementation Notes
- Use on-demand imports: `echarts/charts`, `echarts/components`
- Native JSON spec
- `.setOption()` for reactive updates

---

## 4. Matplotlib Static Fallback

### Bundle Size: 0KB (Python-side only)

### Use Cases
- Users who absolutely need Matplotlib syntax
- Complex scientific plots not easily replicated
- Publication-quality static figures

### Python API
```python
import matplotlib.pyplot as plt
from pynote_ui import mpl_static

plt.figure()
plt.plot([1, 2, 3], [1, 4, 9])
plt.title("Quadratic")
mpl_static(plt)  # Captures as PNG, sends to frontend
```

### Implementation Notes
- Use `Agg` backend
- `savefig()` to BytesIO → base64
- Display as `<img>` in output
- No interactivity (static only)

---

## Bundle Size Budget

| Component | Size | Loading | Priority |
|-----------|------|---------|----------|
| Plot (Observable Plot) | 150KB | Eager | Core |
| TimeSeries (uPlot) | 40KB | Eager | Core |
| Chart (Frappe Charts) | 20KB | Eager | Core |
| **Plotly** | 1MB | Lazy | Future |
| **Vega-Lite** | 500KB | Lazy | Future |
| **ECharts** | 400KB | Lazy | Future |
| **Matplotlib** | 0KB | N/A | Future |

**Core bundle target:** ~210KB for full lightweight charting.

---

## Decision Criteria for Adding Heavy Libraries

Before adding Plotly/Vega/ECharts:

1. **User demand** — Track feature requests
2. **Use case gap** — Is there a chart type we truly can't cover?
3. **Bundle impact** — Lazy-loading must work flawlessly
4. **Maintenance burden** — Each library needs theme integration, docs, examples

---

## Lazy Loading Implementation Pattern

```typescript
// src/lib/lazy-charts.ts
export const loadPlotly = () => import("plotly.js-dist-min");
export const loadVegaEmbed = () => import("vega-embed");
export const loadECharts = () => import("echarts/core");

// In component registry, use lazy loading
const PlotlyChart = lazy(async () => {
  await loadPlotly();
  return import("./PlotlyChart");
});
```

---

## Implementation Checklist (When Prioritized)

- [ ] Create lazy-loading wrapper utility
- [ ] Implement `PlotlyChart.tsx` component
- [ ] Implement `VegaChart.tsx` component
- [ ] Implement `EChartsChart.tsx` component
- [ ] Implement `mpl_static()` Python helper
- [ ] Add to Python `pynote_ui` module
- [ ] Theme integration for all
- [ ] Performance benchmarks
- [ ] Documentation and examples
