import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { X, Activity, Zap, Clock, Layout } from "lucide-solid";

interface Metric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  unit: string;
}

const PerformanceMonitor: Component<{ onClose: () => void }> = (props) => {
  const [metrics, setMetrics] = createSignal<Metric[]>([]);
  const [resources, setResources] = createSignal<{name: string, duration: number}[]>([]);

  const getRating = (name: string, value: number): Metric["rating"] => {
    if (name === "LCP") return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    if (name === "FID") return value <= 100 ? "good" : value <= 300 ? "needs-improvement" : "poor";
    if (name === "CLS") return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
    if (name === "INP") return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
    return "good";
  };

  onMount(() => {
    // Observe Web Vitals
    try {
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.entryType === "largest-contentful-paint") {
                updateMetric("LCP", entry.startTime, "ms");
            } else if (entry.entryType === "layout-shift" && !(entry as any).hadRecentInput) {
                updateMetric("CLS", (entry as any).value, ""); // Accumulation logic simplified
            } else if (entry.entryType === "first-input") {
                updateMetric("FID", (entry as any).processingStart - entry.startTime, "ms");
            }
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        observer.observe({ type: "layout-shift", buffered: true });
        observer.observe({ type: "first-input", buffered: true });
    } catch (e) {
        console.warn("PerformanceObserver not supported");
    }

    // Observe Resources
    const resObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries().map(e => ({
            name: e.name.split('/').pop() || e.name,
            duration: e.duration
        })).sort((a, b) => b.duration - a.duration).slice(0, 10);
        setResources(entries);
    });
    resObserver.observe({ type: "resource", buffered: true });
  });

  const updateMetric = (name: string, value: number, unit: string) => {
      setMetrics(prev => {
          const idx = prev.findIndex(m => m.name === name);
          const rating = getRating(name, value);
          if (idx >= 0) {
              const newMetrics = [...prev];
              // For CLS we usually accumulate, but for simple display we take latest or max? 
              // Standard CLS is cumulative. Here we simplify.
              if (name === "CLS") newMetrics[idx].value += value; 
              else newMetrics[idx].value = value;
              
              newMetrics[idx].rating = getRating(name, newMetrics[idx].value);
              return newMetrics;
          }
          return [...prev, { name, value, unit, rating }];
      });
  };

  return (
    <div class="fixed bottom-4 right-4 z-50 w-80 bg-background border border-foreground/20 shadow-xl rounded-md flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
      <div class="flex items-center justify-between p-3 bg-base-200 border-b border-foreground/10">
        <h3 class="font-bold text-sm flex items-center gap-2"><Activity size={16} class="text-accent" /> Performance</h3>
        <button onClick={props.onClose} class="hover:bg-foreground/10 rounded-sm p-1">
            <X size={14} />
        </button>
      </div>
      
      <div class="p-4 space-y-4 max-h-96 overflow-y-auto">
        <Show when={metrics().length === 0}>
            <div class="text-xs text-secondary/50 text-center py-4">Collecting metrics... (Interact with page)</div>
        </Show>
        
        <div class="grid grid-cols-1 gap-2">
            <For each={metrics()}>
                {m => (
                    <div class="flex items-center justify-between p-2 bg-base-100 rounded border border-base-300">
                        <div class="flex items-center gap-2">
                            <Show when={m.name === "LCP"}><Zap size={14} /></Show>
                            <Show when={m.name === "CLS"}><Layout size={14} /></Show>
                            <Show when={m.name === "FID"}><Clock size={14} /></Show>
                            <span class="text-xs font-bold">{m.name}</span>
                        </div>
                        <div class={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            m.rating === "good" ? "bg-green-500/20 text-green-600" :
                            m.rating === "needs-improvement" ? "bg-yellow-500/20 text-yellow-600" :
                            "bg-red-500/20 text-red-600"
                        }`}>
                            {m.value.toFixed(2)}{m.unit}
                        </div>
                    </div>
                )}
            </For>
        </div>

        <div class="space-y-1">
            <h4 class="text-[10px] uppercase font-bold text-secondary/50 tracking-wider">Slowest Resources</h4>
            <For each={resources()}>
                {r => (
                    <div class="flex justify-between text-xs font-mono">
                        <span class="truncate max-w-[180px]" title={r.name}>{r.name}</span>
                        <span class="text-secondary/70">{r.duration.toFixed(0)}ms</span>
                    </div>
                )}
            </For>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMonitor;
