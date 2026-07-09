import { type Component, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { useDragDropContext } from "@thisbeyond/solid-dnd";

// Captures the sensor's pointer origin on drag start to compute grab offset.
// Lives inside <DragDropProvider> so it has access to the drag-drop context.
export const DragOffsetTracker: Component<{ setGrabOffsetX: (x: number) => void }> = (props) => {
  const [state] = useDragDropContext()!;

  createEffect(() => {
    const draggable = state.active.draggable;
    const sensor = state.active.sensor;
    if (draggable && sensor) {
      const rect = draggable.node.getBoundingClientRect();
      // The sensor's current coordinates are the most accurate at activation time.
      props.setGrabOffsetX(sensor.coordinates.current.x - rect.left);
    }
  });

  return null;
};

// Drag overlay that follows the mouse cursor.
export const CustomDragOverlay: Component<{ height: number | null; grabOffsetX: number; cellWidth: number }> = (props) => {
  const [state] = useDragDropContext()!;
  const [mousePos, setMousePos] = createSignal({ x: 0, y: 0 });

  createEffect(() => {
    if (state.active.draggable) {
      const handleMouseMove = (e: MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
      };
      window.addEventListener("mousemove", handleMouseMove);
      onCleanup(() => {
        window.removeEventListener("mousemove", handleMouseMove);
      });
    }
  });

  return (
    <Show when={state.active.draggable && props.height}>
      <div 
        class="fixed pointer-events-none z-100001" 
        style={{ 
          // Keep the grab offset: the pill is 832px wide vs the cell's cellWidth,
          // so it extends equally on both sides.
          left: `${mousePos().x - props.grabOffsetX - (832 - props.cellWidth) / 2}px`, 
          top: `${mousePos().y}px`,
          width: "832px" // Match max-w-[52rem]
        }}
      >
        <div class="bg-accent/20 border-2 border-accent h-12 w-full rounded-sm opacity-50 shadow-sm"></div>
      </div>
    </Show>
  );
};

// Scrolls the page while a drag hovers near the top or bottom edge.
export const AutoScroller: Component = () => {
  const [state, { recomputeLayouts }] = useDragDropContext()!;
  let scrollFrame: number | null = null;
  let mouseY = 0;
  const SCROLL_SPEED = 15;
  const MENU_HEIGHT = 80;
  const EDGE_THRESHOLD = 50;

  const handleMouseMove = (e: MouseEvent) => {
    mouseY = e.clientY;
  };

  const handleScroll = () => {
    // Only recompute when actual scroll events fire (from user or our scrollBy)
    recomputeLayouts();
  };

  const loop = () => {
    const { innerHeight } = window;

    // Top zone (below the menu bar) scrolls up, bottom zone scrolls down.
    if (mouseY < MENU_HEIGHT + EDGE_THRESHOLD && mouseY > 0) {
      window.scrollBy(0, -SCROLL_SPEED);
    } 
    else if (mouseY > innerHeight - EDGE_THRESHOLD) {
      window.scrollBy(0, SCROLL_SPEED);
    }

    // recomputeLayouts is left to the scroll event handler.
    scrollFrame = requestAnimationFrame(loop);
  };

  createEffect(() => {
    if (state.active.draggable) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("scroll", handleScroll);
      scrollFrame = requestAnimationFrame(loop);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = null;
      }
    }
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("scroll", handleScroll);
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
    }
  });

  return null;
};
