import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { currentTheme } from "./theme";

const sectionScopeKey = new PluginKey("sectionScope");

export const sectionScopePlugin = $prose(() => new Plugin({
  key: sectionScopeKey,
  state: {
    init() {
      return DecorationSet.empty;
    },
    apply(_tr, _oldSet, _oldState, newState) {
      // If scoping is disabled, clear decorations
      if (!currentTheme.sectionScoping) return DecorationSet.empty;
      
      const decorations: Decoration[] = [];
      let currentLevel = 0;

      // Iterate over top-level blocks
      newState.doc.forEach((node, pos) => {
        if (node.type.name === 'heading') {
          currentLevel = Math.min(Math.max(node.attrs.level || 0, 1), 4);
          
          // Apply to header itself
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              style: `--primary: var(--header-color-${currentLevel}) !important; --color-primary: var(--header-color-${currentLevel}) !important;`
            })
          );
        } else {
          // Apply current level color to block (paragraph, list, table, etc.)
          if (currentLevel > 0) {
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                style: `--primary: var(--header-color-${currentLevel}) !important; --color-primary: var(--header-color-${currentLevel}) !important;`
              })
            );
          }
        }
      });

      return DecorationSet.create(newState.doc, decorations);
    }
  },
  props: {
    decorations(state) {
      return this.getState(state);
    }
  }
}));
