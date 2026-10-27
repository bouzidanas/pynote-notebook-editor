import { type Component, type JSX, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ComponentRegistry } from "./ComponentRegistry";
import { host } from "../../lib/host";

// Components a reader acts on. A read-only export has no kernel to act on, so
// they show their exported state and ignore input (charts stay explorable:
// their tooltips and zoom are local). `display: contents` keeps the wrapper
// out of Group layouts.
const INPUT_COMPONENTS = new Set(["Slider", "Form", "Button", "Select", "Input", "Textarea", "Toggle", "Checkbox", "Upload"]);
const readOnly = host().embedded?.mode === "readonly";
const inertIfReadOnly = (type: string, content: JSX.Element) =>
  readOnly && INPUT_COMPONENTS.has(type) ? <div inert style={{ display: "contents" }}>{content}</div> : content;

interface UIOutputRendererProps {
  data: {
    id: string;
    type: string;
    props: any;
  };
  onSubmit?: () => void;
}

const UIOutputRenderer: Component<UIOutputRendererProps> = (props) => {
  if (!props.data) return null;
  
  const isTimeSeries = props.data.type === "TimeSeries";
  
  return (
    <Show when={ComponentRegistry[props.data.type]} fallback={<div class="text-error text-xs p-2 border border-error rounded">Unknown UI Component: {props.data.type}</div>}>
      {(Comp) => isTimeSeries ? (
        <Suspense fallback={<div class="p-2 text-secondary text-sm">Loading...</div>}>
          <Dynamic component={Comp()} id={props.data.id} props={props.data.props} onSubmit={props.onSubmit} />
        </Suspense>
      ) : inertIfReadOnly(
        props.data.type,
        <Dynamic component={Comp()} id={props.data.id} props={props.data.props} onSubmit={props.onSubmit} />,
      )}
    </Show>
  );
};

export default UIOutputRenderer;
