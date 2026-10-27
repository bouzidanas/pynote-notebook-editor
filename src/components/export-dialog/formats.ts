import type { Component } from "solid-js";
import { AppWindow, BookOpen, Blocks, FileCode, Files, FileText, NotebookText } from "lucide-solid";
import type { TextFormat } from "../../lib/export/text-exports";
import type { FileKind } from "../../lib/export/save";
import { FRAMEWORKS } from "../../lib/export/component-export";

export type FormatId = TextFormat | "webapp" | "component";

export interface FormatInfo {
  id: FormatId;
  label: string;
  /** Shown next to the label in the list. */
  extension: string;
  /** The second line of the format's tab: its file and what it is. */
  detail: string;
  icon: Component<{ size?: number; class?: string }>;
  summary: string;
}

// "Astro, Next.js, ... or plain HTML": every framework the Component settings
// offer, so the summary and the Framework toggle name the same ones.
const FRAMEWORK_NAMES = FRAMEWORKS.map((f) => (f.id === "html" ? "plain HTML" : f.label));
const frameworkList = `${FRAMEWORK_NAMES.slice(0, -1).join(", ")} or ${FRAMEWORK_NAMES[FRAMEWORK_NAMES.length - 1]}`;

// Jupyter first: .ipynb is PyNote's default file format (a first export
// preselects it).
export const FORMATS: readonly FormatInfo[] = [
  { id: "ipynb", label: "Jupyter", extension: ".ipynb", detail: ".ipynb notebook", icon: BookOpen, summary: "The standard notebook format, and the one PyNote saves. Keeps everything; opens in PyNote, Jupyter, VS Code and Colab." },
  { id: "pynote", label: "PyNote", extension: ".pynote", detail: ".pynote notebook", icon: NotebookText, summary: "The notebook as readable text that diffs cleanly in Git. Converts to and from .ipynb without loss, and opens in PyNote." },
  { id: "python", label: "Python", extension: ".py", detail: ".py script", icon: FileCode, summary: "A script that runs top to bottom with Python." },
  { id: "markdown", label: "Markdown", extension: ".md", detail: ".md document", icon: FileText, summary: "A readable document of the notebook." },
  { id: "pair", label: "Python + Markdown", extension: ".py + .md", detail: ".py and .md files", icon: Files, summary: "Code and prose in two files, each readable and editable on its own: a script that runs top to bottom, and a document that marks where each code cell goes." },
  { id: "webapp", label: "Web app", extension: ".html", detail: ".html page", icon: AppWindow, summary: "A standalone page that opens in any browser and looks exactly like PyNote: same theme, fonts and view settings. It holds this notebook and PyNote's tutorial." },
  { id: "component", label: "Component", extension: ".json", detail: ".json config", icon: Blocks, summary: `Run this notebook's cells on your website with the pynote package (${frameworkList}).` },
];

export const formatInfo = (id: FormatId): FormatInfo => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

export const FILE_KINDS: Record<"pynote" | "ipynb" | "python" | "markdown" | "html" | "json", FileKind> = {
  pynote: { description: "PyNote notebook", mime: "text/x-pynote", extension: ".pynote" },
  ipynb: { description: "Jupyter notebook", mime: "application/x-ipynb+json", extension: ".ipynb" },
  python: { description: "Python script", mime: "text/x-python", extension: ".py" },
  markdown: { description: "Markdown document", mime: "text/markdown", extension: ".md" },
  html: { description: "Web page", mime: "text/html", extension: ".html" },
  json: { description: "JSON", mime: "application/json", extension: ".json" },
};

/** A file name without characters file systems reject; "Untitled" when empty. */
export const safeBaseName = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/^\.+/, "").trim() || "Untitled";
