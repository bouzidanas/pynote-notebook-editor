import { type Component, onMount } from "solid-js";
import Notebook from "./components/Notebook";
import { kernel } from "./lib/pyodide";
import { initTheme } from "./lib/theme";
import { actions } from "./lib/store";

const App: Component = () => {
  initTheme();
  
  onMount(() => {
    kernel.init();
  });

  return (
    <div 
      class="min-h-screen bg-background text-secondary transition-colors duration-300 font-mono"
      onMouseDown={() => actions.setActiveCell(null)}
    >
      <Notebook />
    </div>
  );
};

export default App;