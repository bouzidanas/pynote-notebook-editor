import { type Component, onMount } from "solid-js";
import Notebook from "./components/Notebook";
import { kernel } from "./lib/pyodide";
import { initTheme } from "./lib/theme";
import { actions } from "./lib/store";
import { TESTID } from "./lib/testids";

const App: Component = () => {
  initTheme();
  
  onMount(() => {
    kernel.init();
  });

  return (
    <div 
      class="min-h-[100dvh] bg-background text-secondary transition-colors duration-300 font-mono"
      data-testid={TESTID.appRoot}
      onMouseDown={() => actions.setActiveCell(null)}
    >
      <Notebook />
    </div>
  );
};

export default App;