import { type Component, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ComponentRegistry } from "./ComponentRegistry";

interface UIOutputRendererProps {
  data: {
    id: string;
    type: string;
    props: any;
  };
}

const UIOutputRenderer: Component<UIOutputRendererProps> = (props) => {
  if (!props.data) return null;
  
  const isTimeSeries = props.data.type === "TimeSeries";
  
  return (
    <Show when={ComponentRegistry[props.data.type]} fallback={<div class="text-error text-xs p-2 border border-error rounded">Unknown UI Component: {props.data.type}</div>}>
      {(Comp) => isTimeSeries ? (
        <Suspense fallback={<div class="p-2 text-secondary text-sm">Loading...</div>}>
          <Dynamic component={Comp()} id={props.data.id} props={props.data.props} />
        </Suspense>
      ) : (
        <Dynamic component={Comp()} id={props.data.id} props={props.data.props} />
      )}
    </Show>
  );
};

export default UIOutputRenderer;
