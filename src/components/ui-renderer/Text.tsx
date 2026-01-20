import { type Component, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";

interface TextProps {
  id: string;
  props: {
    content: string;
  };
}

const Text: Component<TextProps> = (p) => {
  const componentId = p.id;
  const [content, setContent] = createSignal(p.props.content);

  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
      if (data.content !== undefined) setContent(data.content);
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

  return (
    <div class="p-3 bg-base-200/50 border-2 border-foreground rounded-sm font-mono text-sm text-secondary">
      {content()}
    </div>
  );
};

export default Text;
