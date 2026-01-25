import { type Component, For, Show, createMemo } from "solid-js";
import { type CellData } from "../lib/store";
import UIOutputRenderer from "./ui-renderer/UIOutputRenderer";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import katex from "katex";
import DOMPurify from "dompurify";

interface OutputProps {
  outputs: CellData["outputs"];
}

// Control character markers matching Python's pynote_ui
// Self-closing pattern: \x02TYPE\x02content\x02/TYPE\x02
const MARKER_UI_START = "\x02PYNOTE_UI\x02";
const MARKER_UI_END = "\x02/PYNOTE_UI\x02";
const MARKER_MD_STYLED_START = "\x02PYNOTE_MD_STYLED\x02";
const MARKER_MD_STYLED_END = "\x02/PYNOTE_MD_STYLED\x02";
const MARKER_MD_PLAIN_START = "\x02PYNOTE_MD_PLAIN\x02";
const MARKER_MD_PLAIN_END = "\x02/PYNOTE_MD_PLAIN\x02";

// Configure marked for markdown rendering (same as MarkdownCell)
const displayMath = {
  name: 'displayMath',
  level: 'inline' as const,
  start(src: string) { return src.match(/\$\$/)?.index; },
  tokenizer(src: string) {
    const match = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (match) {
      return {
        type: 'displayMath',
        raw: match[0],
        text: match[1].trim()
      };
    }
  },
  renderer(token: any) {
    return katex.renderToString(token.text, { displayMode: true, throwOnError: false, output: 'html' });
  }
};

// Configure marked (uses global instance - same config as MarkdownCell)
// Note: marked.use is idempotent for same config
marked.use(markedKatex({ throwOnError: false, output: "html", trust: true }));
marked.use({ extensions: [displayMath as any] });

const purifyOptions = {
  ADD_TAGS: ["math", "maction", "maligngroup", "malignmark", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mlongdiv", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mscarries", "mscarry", "msgroup", "mstack", "msline", "mspace", "msqrt", "msrow", "mstack", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "semantics", "annotation", "annotation-xml"],
  ADD_ATTR: ["xmlns", "display", "mathvariant", "columnalign", "columnspacing", "rowspacing", "groupalign", "class", "style", "data-level"] 
};

// Parse stdout content for interleaved text, UI elements, and markdown
type OutputSegment = 
  | { type: "text"; content: string }
  | { type: "ui"; data: { id: string; type: string; props: any } }
  | { type: "markdown"; content: string; styled: boolean };

// Sub-segment within markdown (text or UI)
type MarkdownSubSegment = 
  | { type: "text"; content: string }
  | { type: "ui"; data: { id: string; type: string; props: any } };

function parseStdoutWithUI(stdout: string[]): OutputSegment[] {
  const combined = stdout.join("");
  if (!combined) return [];
  
  const segments: OutputSegment[] = [];
  
  // Parse UI elements (self-closing XML-like pattern)
  const uiPattern = new RegExp(
    `${escapeRegex(MARKER_UI_START)}(.+?)${escapeRegex(MARKER_UI_END)}`,
    "gs"
  );
  
  // Parse markdown elements (self-closing XML-like pattern)
  const mdStyledPattern = new RegExp(
    `${escapeRegex(MARKER_MD_STYLED_START)}(.+?)${escapeRegex(MARKER_MD_STYLED_END)}`,
    "gs"
  );
  const mdPlainPattern = new RegExp(
    `${escapeRegex(MARKER_MD_PLAIN_START)}(.+?)${escapeRegex(MARKER_MD_PLAIN_END)}`,
    "gs"
  );
  
  // Find all markers with their positions
  type MarkerMatch = { index: number; end: number; type: "ui" | "markdown"; content: string; styled?: boolean };
  const matches: MarkerMatch[] = [];
  
  let match;
  while ((match = uiPattern.exec(combined)) !== null) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      type: "ui",
      content: match[1]
    });
  }
  
  while ((match = mdStyledPattern.exec(combined)) !== null) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      type: "markdown",
      content: match[1],
      styled: true
    });
  }
  
  while ((match = mdPlainPattern.exec(combined)) !== null) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      type: "markdown",
      content: match[1],
      styled: false
    });
  }
  
  // Sort by position (outermost first due to earlier start index)
  matches.sort((a, b) => a.index - b.index);
  
  // Track regions consumed by markdown blocks (which handle their own nested UI)
  const markdownRegions: Array<{ start: number; end: number }> = [];
  
  // First pass: identify markdown regions
  for (const m of matches) {
    if (m.type === "markdown") {
      markdownRegions.push({ start: m.index, end: m.end });
    }
  }
  
  // Helper to check if a position is inside any markdown region
  const isInsideMarkdown = (index: number, end: number): boolean => {
    return markdownRegions.some(region => index > region.start && end <= region.end);
  };
  
  let lastIndex = 0;
  
  for (const m of matches) {
    // Skip UI elements that are nested inside markdown blocks
    // (they'll be processed by parseMarkdownWithUI when rendering the markdown)
    if (m.type === "ui" && isInsideMarkdown(m.index, m.end)) {
      continue;
    }
    
    // Skip if we've already processed past this point
    if (m.index < lastIndex) {
      continue;
    }
    
    // Add text before this marker
    if (m.index > lastIndex) {
      const text = combined.slice(lastIndex, m.index);
      if (text) {
        segments.push({ type: "text", content: text });
      }
    }
    
    if (m.type === "ui") {
      try {
        const uiData = JSON.parse(m.content);
        segments.push({ type: "ui", data: uiData });
      } catch (e) {
        segments.push({ type: "text", content: m.content });
      }
    } else if (m.type === "markdown") {
      segments.push({ 
        type: "markdown", 
        content: m.content,
        styled: m.styled ?? true
      });
    }
    
    lastIndex = m.end;
  }
  
  // Add any remaining text
  if (lastIndex < combined.length) {
    const text = combined.slice(lastIndex);
    if (text) {
      segments.push({ type: "text", content: text });
    }
  }
  
  return segments;
}

// Parse markdown content for embedded UI elements
function parseMarkdownWithUI(content: string): MarkdownSubSegment[] {
  const segments: MarkdownSubSegment[] = [];
  const uiPattern = new RegExp(
    `${escapeRegex(MARKER_UI_START)}(.+?)${escapeRegex(MARKER_UI_END)}`,
    "gs"
  );
  
  let lastIndex = 0;
  let match;
  
  while ((match = uiPattern.exec(content)) !== null) {
    // Add markdown text before this UI element
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text) {
        segments.push({ type: "text", content: text });
      }
    }
    
    // Parse UI element
    try {
      const uiData = JSON.parse(match[1]);
      segments.push({ type: "ui", data: uiData });
    } catch (e) {
      segments.push({ type: "text", content: match[0] });
    }
    
    lastIndex = uiPattern.lastIndex;
  }
  
  // Add any remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text) {
      segments.push({ type: "text", content: text });
    }
  }
  
  return segments;
}

// Render markdown to sanitized HTML
function renderMarkdown(content: string): string {
  try {
    const result = marked.parse(content);
    const html = typeof result === 'string' ? result : '';
    return DOMPurify.sanitize(html, purifyOptions);
  } catch (e) {
    console.error("Markdown rendering error:", e);
    return DOMPurify.sanitize(content);
  }
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Component to render markdown with embedded UI elements
const MarkdownWithUI: Component<{ content: string; styled: boolean }> = (props) => {
  const subSegments = createMemo(() => parseMarkdownWithUI(props.content));
  
  // Styled mode uses exact same classes as MarkdownCell for visual consistency
  // This ensures theme colors, typography, spacing all match markdown cells
  const styledClass = "prose prose-invert max-w-none text-secondary";
  const plainClass = "font-mono text-sm text-secondary whitespace-pre-wrap";
  
  return (
    <div class={props.styled ? styledClass : plainClass}>
      <For each={subSegments()}>
        {(segment) => (
          <Show
            when={segment.type === "ui"}
            fallback={
              <span 
                innerHTML={props.styled 
                  ? renderMarkdown((segment as { type: "text"; content: string }).content)
                  : (segment as { type: "text"; content: string }).content
                } 
              />
            }
          >
            <span class="inline-block align-middle my-2">
              <UIOutputRenderer data={(segment as { type: "ui"; data: any }).data} />
            </span>
          </Show>
        )}
      </For>
    </div>
  );
};

export const OutputStdoutUI: Component<OutputProps> = (props) => {
  const hasContent = () => {
    const o = props.outputs;
    return o && (
      (o.stdout && o.stdout.length > 0) ||
      (o.mimebundle && o.mimebundle['application/vnd.pynote.ui+json'])
    );
  };

  const segments = () => {
    if (!props.outputs?.stdout) return [];
    return parseStdoutWithUI(props.outputs.stdout);
  };

  return (
    <Show when={hasContent()}>
      <div class="first:pb-4 flex flex-col gap-5 font-mono text-sm p-2 pl-1.25 border-foreground">
          <Show when={segments().length > 0}>
            <For each={segments()}>
              {(segment) => {
                if (segment.type === "ui") {
                  return <UIOutputRenderer data={segment.data} />;
                } else if (segment.type === "markdown") {
                  return (
                    <MarkdownWithUI content={segment.content} styled={segment.styled} />
                  );
                } else {
                  return (
                    <div class="text-secondary whitespace-pre-wrap">
                      {segment.content}
                    </div>
                  );
                }
              }}
            </For>
          </Show>
          <Show when={props.outputs?.mimebundle && props.outputs.mimebundle['application/vnd.pynote.ui+json']}>
            <UIOutputRenderer data={props.outputs?.mimebundle['application/vnd.pynote.ui+json']} />
          </Show>
      </div>
    </Show>
  );
};

export const OutputStderr: Component<OutputProps> = (props) => {
  return (
    <Show when={props.outputs?.stderr && props.outputs.stderr.length > 0}>
      <div class="flex flex-col gap-0 font-mono text-sm px-2 pb-2 pt-0 pl-1 border-foreground max-h-60 overflow-y-auto">
          <For each={props.outputs?.stderr}>
            {(line) => <div class="text-primary whitespace-pre-wrap bg-primary/10 p-1 rounded-sm">{line}</div>}
          </For>
      </div>
    </Show>
  );
};

export const OutputError: Component<OutputProps> = (props) => {
  return (
    <Show when={props.outputs?.error}>
      <div class="flex flex-col gap-1 font-mono text-sm p-2 pl-1 border-foreground max-h-100 overflow-y-auto">
            <div class="text-primary whitespace-pre-wrap font-bold bg-primary/20 p-2 rounded-sm">
              {props.outputs?.error}
            </div>
      </div>
    </Show>
  );
};

export const OutputResult: Component<OutputProps> = (props) => {
  return (
    <Show when={props.outputs?.result}>
      <div class="flex flex-col gap-1 font-mono text-sm p-2 pl-1 border-foreground">
            <div class="flex w-full">
              <div class="w-10 bg-background border-r border-foreground flex flex-col items-center pt-5.25 text-sm text-foreground font-extrabold select-none font-mono">Out:</div>
              <div class="flex-1 text-secondary/80 whitespace-pre-wrap border-l-4 border-foreground bg-accent/5 pt-5 p-4">
                {props.outputs?.result}
              </div>
            </div>
      </div>
    </Show>
  );
};
