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

// // Render markdown to sanitized HTML using full parser
// function renderMarkdown(content: string): string {
//   try {
//     const result = marked.parse(content, { async: false }) as string;
//     return DOMPurify.sanitize(result, purifyOptions);
//   } catch (e) {
//     console.error("Markdown rendering error:", e);
//     return DOMPurify.sanitize(content);
//   }
// }

// // Render markdown inline (no block wrapping)
// function renderMarkdownInline(content: string): string {
//   try {
//     const result = marked.parseInline(content);
//     const html = typeof result === 'string' ? result : '';
//     return DOMPurify.sanitize(html, purifyOptions);
//   } catch (e) {
//     console.error("Markdown rendering error:", e);
//     return DOMPurify.sanitize(content);
//   }
// }

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Component to render markdown with embedded UI elements
const MarkdownWithUI: Component<{ content: string; styled: boolean }> = (props) => {
  const subSegments = createMemo(() => parseMarkdownWithUI(props.content));

  // Styled mode: prose handles spacing, no whitespace-pre-wrap needed
  // Plain mode: whitespace-pre-wrap preserves formatting
  const styledClass = "prose prose-invert max-w-none text-secondary [&]:whitespace-normal";
  const plainClass = "font-mono text-sm text-secondary whitespace-pre-wrap";

  // Render inline text (no <p> wrapper) using parseInline
  const renderInlineText = (content: string): string => {
    const result = marked.parseInline(content);
    const html = typeof result === 'string' ? result : '';
    return DOMPurify.sanitize(html, purifyOptions);
  };

  // Group segments into paragraphs based on \n\n boundaries
  // Returns array of paragraphs, each paragraph is array of {type, content/data, isHr}
  type ParagraphItem = 
    | { type: "text"; content: string }
    | { type: "ui"; data: any }
    | { type: "hr" };
  
  const paragraphs = createMemo((): ParagraphItem[][] => {
    const segments = subSegments();
    const result: ParagraphItem[][] = [];
    let currentParagraph: ParagraphItem[] = [];
    
    for (const segment of segments) {
      if (segment.type === "ui") {
        currentParagraph.push({ type: "ui", data: segment.data });
      } else {
        // Text segment - check for \n\n boundaries and <hr> markers (---)
        const content = segment.content;
        
        // Split by \n\n (paragraph breaks) but also handle --- (horizontal rule)
        // First, let's handle the content piece by piece
        let remaining = content;
        
        while (remaining.length > 0) {
          // Check for horizontal rule (--- on its own line)
          const hrMatch = remaining.match(/^(\n*)---(\n*)/);
          if (hrMatch && (remaining === hrMatch[0] || hrMatch[1].includes('\n') || remaining.indexOf(hrMatch[0]) === 0)) {
            // Check if there's text before ---
            const hrIndex = remaining.indexOf('---');
            if (hrIndex > 0) {
              const before = remaining.slice(0, hrIndex);
              // Check if 'before' ends with \n\n
              const parts = before.split(/\n\n+/);
              for (let i = 0; i < parts.length; i++) {
                const part = parts[i].replace(/^\n+|\n+$/g, ''); // trim newlines
                if (part) {
                  currentParagraph.push({ type: "text", content: part });
                }
                if (i < parts.length - 1 && currentParagraph.length > 0) {
                  result.push(currentParagraph);
                  currentParagraph = [];
                }
              }
            }
            // Add hr as its own paragraph
            if (currentParagraph.length > 0) {
              result.push(currentParagraph);
              currentParagraph = [];
            }
            result.push([{ type: "hr" }]);
            remaining = remaining.slice(hrIndex + 3).replace(/^\n+/, '');
            continue;
          }
          
          // Check for \n\n paragraph break
          const breakIndex = remaining.indexOf('\n\n');
          if (breakIndex !== -1) {
            const before = remaining.slice(0, breakIndex);
            if (before.trim()) {
              currentParagraph.push({ type: "text", content: before.trim() });
            }
            if (currentParagraph.length > 0) {
              result.push(currentParagraph);
              currentParagraph = [];
            }
            remaining = remaining.slice(breakIndex + 2).replace(/^\n+/, '');
          } else {
            // No more breaks, add remaining text
            const trimmed = remaining.trim();
            if (trimmed) {
              currentParagraph.push({ type: "text", content: trimmed });
            }
            break;
          }
        }
      }
    }
    
    // Don't forget the last paragraph
    if (currentParagraph.length > 0) {
      result.push(currentParagraph);
    }
    
    return result;
  });

  if (!props.styled) {
    // Plain mode: just render everything with whitespace preserved
    return (
      <div class={plainClass}>
        <For each={subSegments()}>
          {(segment) => {
            if (segment.type === "ui") {
              return (
                <span class="inline-block align-middle">
                  <UIOutputRenderer data={segment.data} />
                </span>
              );
            }
            return <span>{segment.content}</span>;
          }}
        </For>
      </div>
    );
  }

  // Styled mode: render as paragraphs with <br/> between
  return (
    <div class={styledClass}>
      <For each={paragraphs()}>
        {(paragraph, pIndex) => {
          const isLastParagraph = pIndex() === paragraphs().length - 1;
          
          // Check if this is an <hr> paragraph
          if (paragraph.length === 1 && paragraph[0].type === "hr") {
            return (
              <>
                <hr />
                {!isLastParagraph && <br />}
              </>
            );
          }
          
          // Check if paragraph has any UI elements
          const hasUI = paragraph.some(item => item.type === "ui");
          
          // If text-only paragraph, use full parse() for proper block elements (headings, etc)
          if (!hasUI) {
            const textContent = paragraph
              .filter((item): item is { type: "text"; content: string } => item.type === "text")
              .map(item => item.content)
              .join("");
            let html = marked.parse(textContent, { async: false }) as string;
            html = DOMPurify.sanitize(html, purifyOptions);
            // Check if this is a heading (no <br/> after headings)
            const isHeading = /^<h[1-6]/.test(html);
            return (
              <>
                <div style={{ display: "contents" }} innerHTML={html} />
                {!isLastParagraph && !isHeading && <br />}
              </>
            );
          }
          
          // Mixed paragraph (text + UI): check if it starts with a heading
          const firstTextItem = paragraph.find((item): item is { type: "text"; content: string } => item.type === "text");
          const headingMatch = firstTextItem?.content.match(/^(#{1,6})\s+(.*)$/);
          
          // Check if paragraph has only UI element(s) - should be block-level
          const isUIOnly = paragraph.every(item => item.type === "ui");
          
          // Render the paragraph items
          const renderItems = () => (
            <For each={paragraph}>
              {(item, itemIndex) => {
                if (item.type === "ui") {
                  // If UI-only paragraph, use block display for 100% width
                  // Otherwise use inline-block for mixed content
                  return isUIOnly ? (
                    <div class="w-full">
                      <UIOutputRenderer data={item.data} />
                    </div>
                  ) : (
                    <span class="inline-block align-middle">
                      <UIOutputRenderer data={item.data} />
                    </span>
                  );
                }
                if (item.type === "text") {
                  // If this is the first text and it's a heading, strip the # prefix
                  let content = item.content;
                  if (headingMatch && itemIndex() === paragraph.findIndex(i => i.type === "text")) {
                    content = headingMatch[2]; // Use text after "# "
                  }
                  const html = renderInlineText(content);
                  return <span innerHTML={html} />;
                }
                return null;
              }}
            </For>
          );
          
          // Wrap in appropriate tag based on heading level (no <br/> after headings)
          if (headingMatch) {
            const level = headingMatch[1].length;
            return (
              <>
                {level === 1 && <h1>{renderItems()}</h1>}
                {level === 2 && <h2>{renderItems()}</h2>}
                {level === 3 && <h3>{renderItems()}</h3>}
                {level === 4 && <h4>{renderItems()}</h4>}
                {level === 5 && <h5>{renderItems()}</h5>}
                {level === 6 && <h6>{renderItems()}</h6>}
              </>
            );
          }
          
          // Regular paragraph
          return (
            <>
              <p>{renderItems()}</p>
              {!isLastParagraph && <br />}
            </>
          );
        }}
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
          {/* Render all segments in one container for inline flow */}
          <div class="text-secondary whitespace-pre-wrap">
            <For each={segments()}>
              {(segment,) => {
                if (segment.type === "ui") {
                  return (
                    <span class="inline-block align-middle mt-2 first:mt-0">
                      <UIOutputRenderer data={segment.data} />
                    </span>
                  );
                } else if (segment.type === "markdown") {
                  return <MarkdownWithUI content={segment.content} styled={segment.styled} />;
                } else {
                  return <span class="mt-2 first:mt-0">{segment.content}</span>;
                }
              }}
            </For>
          </div>
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
