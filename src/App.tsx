import { type Component, onMount } from "solid-js";
import Notebook from "./components/Notebook";
import { kernel } from "./lib/pyodide";
import { initTheme } from "./lib/theme";
import { actions } from "./lib/store";
import { TESTID } from "./lib/testids";
import { host } from "./lib/host";

const App: Component = () => {
  initTheme();
  
  onMount(() => {
    // A read-only export shows saved outputs and never starts Python.
    if (host().embedded?.mode !== "readonly") kernel.init();
  });

  return (
    <div 
      class="min-h-[100lvh] bg-background text-secondary transition-colors duration-300 font-mono"
      data-testid={TESTID.appRoot}
      onMouseDown={() => actions.setActiveCell(null)}
    >
      <Notebook />
    </div>
  );
};

export default App;