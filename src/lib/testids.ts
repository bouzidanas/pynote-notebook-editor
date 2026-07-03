// Single source of truth for stable `data-testid` hooks used by end-to-end
// tests. Both the application components and the Playwright suite import from
// here so that renaming a hook is a single, compile-checked edit instead of a
// silent string mismatch.
//
// Guidelines:
// - Only add a hook when a test needs to target an element that has no other
//   stable, semantic selector (role, label, text). Prefer Playwright's
//   role/text locators where they are reliable; reach for a testid for
//   structural containers and status elements.
// - Keep values kebab-cased and human-readable.
export const TESTID = {
  appRoot: "app-root",
  kernelStatus: "kernel-status",
  addCodeCell: "add-code-cell",
  addMarkdownCell: "add-markdown-cell",
  cell: "cell",
  cellOutput: "cell-output",
  filesPanelRoot: "files-panel-root",
  filesPanelRow: "files-panel-row",
  filesPanelBreadcrumb: "files-panel-breadcrumb",
  filesPanelError: "files-panel-error",
  filesDialog: "files-panel-dialog",
  filesSidePanel: "files-panel-side",
  uploadComponent: "upload-component",
} as const;

export type TestId = (typeof TESTID)[keyof typeof TESTID];
