import { type Component, Show } from "solid-js";
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
  return (
    <Show when={ComponentRegistry[props.data.type]} fallback={<div class="text-error text-xs p-2 border border-error rounded">Unknown UI Component: {props.data.type}</div>}>
      {(Comp) => <Dynamic component={Comp()} id={props.data.id} props={props.data.props} />}
    </Show>
  );
};

export default UIOutputRenderer;
