import { type Component, For, Show } from "solid-js";
import UIOutputRenderer from "./UIOutputRenderer";

interface GroupProps {
  id: string;
  props: {
    children: any[];
    layout: "col" | "row";
    label?: string;
    width?: string;
    align?: "left" | "center" | "right" | "stretch";
    basis?: string[];
    shrink?: number[];
    grow?: number[];
    fill?: boolean;
  };
}   

const Group: Component<GroupProps> = (p) => {
  // Alignment for the Group itself within the parent row
  const justifyClass = () => 
    p.props.align === "left" ? "justify-start" : 
    p.props.align === "right" ? "justify-end" : 
    "justify-center";

  const widthStyle = () => (!p.props.width || p.props.width === "full") 
    ? {} 
    : { "max-width": p.props.width, "width": "100%" };
    
  // Inner Group Container (stretches items)
  const groupClass = () => `flex ${p.props.layout === "row" ? "flex-row gap-4" : "flex-col gap-2"} items-stretch w-full`;

  const content = (
    <div 
        class={groupClass()}
        style={p.props.label ? {} : widthStyle()}
    >
      <For each={p.props.children}>
        {(childData, index) => (
            <div 
              class={p.props.layout === "row" && p.props.fill !== false ? "h-full *:h-full" : ""}
              style={{
                "flex-basis": p.props.basis && p.props.basis[index()] !== undefined ? p.props.basis[index()] : "auto",
                "flex-grow": p.props.grow && p.props.grow[index()] !== undefined ? p.props.grow[index()] : undefined,
                "flex-shrink": p.props.shrink && p.props.shrink[index()] !== undefined ? p.props.shrink[index()] : undefined,
                "width": "100%",
                "min-width": "0"
            }}>
                <UIOutputRenderer data={childData} />
            </div>
        )}
      </For>
    </div>
  );

  return (
    <div class={`flex w-full ${justifyClass()}`}>
      <Show when={p.props.label} fallback={content}>
        <fieldset 
          class={`border-2 border-foreground rounded-sm p-3 bg-base-200/20 w-full`}
          style={widthStyle()}
        >
          <legend class="px-2 text-xs font-bold uppercase tracking-wider text-secondary/70">
            {p.props.label}
          </legend>
          {content}
        </fieldset>
      </Show>
    </div>
  );
};

export default Group;
