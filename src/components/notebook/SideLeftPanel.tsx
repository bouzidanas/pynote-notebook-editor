import { type Component } from "solid-js";
import { X } from "lucide-solid";
import FileWorkspacePanel from "../FileWorkspacePanel";
import { TESTID } from "../../lib/testids";
import { type FilesPanelViewMode } from "./files-panel-view-mode";

const SideLeftPanel: Component<{
  onClose: () => void;
  viewMode: FilesPanelViewMode;
  onViewModeChange: (nextMode: FilesPanelViewMode) => void;
}> = (props) => {
  return (
    <div class="fixed right-[calc(50%+28rem)] px-2 top-32 w-[calc(50%-32rem)] max-w-[20rem] hidden 2xl:flex flex-col text-secondary/60 transition-opacity duration-300 group z-300000" data-testid={TESTID.filesSidePanel}>
      <button
        onClick={props.onClose}
        class="self-end -mb-5 translate-y-[2px] translate-x-1.5 p-1.5 rounded-lg hover:bg-foreground text-secondary/40 hover:text-secondary opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer z-300002"
        title="Hide Left Panel"
      >
        <X size={16} />
      </button>

      <div class="overflow-x-hidden">
        <FileWorkspacePanel
          mode="side"
          viewMode={props.viewMode}
          onViewModeChange={props.onViewModeChange}
        />
      </div>
    </div>
  );
};

export default SideLeftPanel;
