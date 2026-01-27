import { type Component, createSignal, Show, createEffect, createMemo } from "solid-js";
import { type CellData, actions } from "../lib/store";
import { currentTheme } from "../lib/theme";
import CellWrapper, { getLastHeaderLevel } from "./CellWrapper";
import MarkdownEditor from "./MarkdownEditor";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import katex from "katex";
import DOMPurify from "dompurify";
import { Edit2, Check, Trash2 } from "lucide-solid";
import clsx from "clsx";
import { highlightPython, isPythonLanguage, isSupportedLanguage, highlightWithHljs } from "../lib/syntax-highlighter";

const displayMath = {
  name: 'displayMath',
  level: 'inline',
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

marked.use(markedKatex({ throwOnError: false, output: "html", trust: true }));
marked.use({ extensions: [displayMath as any] });

// Custom renderer for syntax-highlighted code blocks
// Python uses Lezer (sync), other languages use placeholder for async hljs
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Python: use Lezer for exact CodeMirror match (synchronous)
  if (isPythonLanguage(lang)) {
    const highlighted = highlightPython(text);
    return `<pre><code class="language-python">${highlighted}</code></pre>`;
  }
  
  // Other supported languages: mark for async highlighting
  if (lang && isSupportedLanguage(lang)) {
    // Store original code in data attribute for async processing
    const base64Code = btoa(unescape(encodeURIComponent(text)));
    return `<pre><code class="language-${lang}" data-hljs-lang="${lang}" data-hljs-code="${base64Code}">${escaped}</code></pre>`;
  }
  
  // Unsupported: just escape
  return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`;
};
marked.use({ renderer });

// Post-process HTML to apply highlight.js to marked code blocks
const applyAsyncHighlighting = async (html: string): Promise<string> => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const codeBlocks = doc.querySelectorAll('code[data-hljs-lang]');
  
  for (const block of codeBlocks) {
    const lang = block.getAttribute('data-hljs-lang');
    const base64Code = block.getAttribute('data-hljs-code');
    if (lang && base64Code) {
      try {
        const code = decodeURIComponent(escape(atob(base64Code)));
        const highlighted = await highlightWithHljs(code, lang);
        if (highlighted) {
          block.innerHTML = highlighted;
        }
      } catch (e) {
        console.warn('Failed to decode/highlight code block', e);
      }
      // Clean up data attributes
      block.removeAttribute('data-hljs-lang');
      block.removeAttribute('data-hljs-code');
    }
  }
  
  return doc.body.innerHTML;
};

// Wrap tables in a container div for overflow scrolling
const wrapTablesInContainer = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');
  
  tables.forEach(table => {
    const wrapper = doc.createElement('div');
    wrapper.className = 'table-wrapper';
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
  
  return doc.body.innerHTML;
};

const purifyOptions = {
    ADD_TAGS: ["math", "maction", "maligngroup", "malignmark", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mlongdiv", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mscarries", "mscarry", "msgroup", "mstack", "msline", "mspace", "msqrt", "msrow", "mstack", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "semantics", "annotation", "annotation-xml"],
    ADD_ATTR: ["xmlns", "display", "mathvariant", "columnalign", "columnspacing", "rowspacing", "groupalign", "class", "style", "data-level"] 
};

interface MarkdownCellProps {
  cell: CellData;
  isActive: boolean;
  index: number;
  prevCellId: string | null;
}

const MarkdownCell: Component<MarkdownCellProps> = (props) => {
  const [parsedContent, setParsedContent] = createSignal("");
  const [renderError, setRenderError] = createSignal(false);

  // Compute the last header level in this cell's content
  const lastHeaderLevel = createMemo(() => {
    return getLastHeaderLevel(props.cell.content || "");
  });

  createEffect(async () => {
    try {
      setRenderError(false);
      const content = props.cell.content || "Double click to edit...";
      let html = "";

      if (currentTheme.sectionScoping) {
          const tokens = marked.lexer(content);
          const newTokens: any[] = [];
          let divOpen = false;

          for (const token of tokens) {
              if (token.type === 'heading') {
                  if (divOpen) {
                      newTokens.push({ type: 'html', raw: '</div>', text: '</div>' });
                  }
                  const level = Math.min(Math.max((token as any).depth, 1), 4);
                  // Use class and data-attribute instead of inline style
                  const openTag = `<div class="section-scope" data-level="${level}">`;
                  newTokens.push({ type: 'html', raw: openTag, text: openTag });
                  divOpen = true;
              }
              newTokens.push(token);
          }
          if (divOpen) {
              newTokens.push({ type: 'html', raw: '</div>', text: '</div>' });
          }
          // Preserve links for reference-style links
          (newTokens as any).links = tokens.links;

          const parserResult = marked.parser(newTokens as any);
          html = (parserResult as any) instanceof Promise ? await parserResult : parserResult as string;
      } else {
          const result = marked.parse(content);
          html = (result as any) instanceof Promise ? await result : result as string;
      }

      // Apply async syntax highlighting for non-Python languages
      html = await applyAsyncHighlighting(html);
      
      // Wrap tables in container divs for overflow scrolling
      html = wrapTablesInContainer(html);
      
      setParsedContent(DOMPurify.sanitize(html, purifyOptions));
    } catch (e) {
      console.error("Markdown rendering error:", e);
      setRenderError(true);
    }
  });

  const toggleEdit = () => {
    actions.setEditing(props.cell.id, !props.cell.isEditing);
  };

  const toolbar = (
    <div class="flex lg:hidden items-center gap-1 p-1">
      <button 
        onClick={toggleEdit}
        class={clsx(
          "p-1.5 hover:bg-foreground rounded-sm",
          renderError() ? "text-primary" : (props.isActive || props.cell.isEditing) ? "text-accent" : "text-secondary"
        )}
        title={props.cell.isEditing ? "Finish Editing" : "Edit Markdown"}
      >
        <Show when={props.cell.isEditing} fallback={<Edit2 size={16} />}>
          <Check size={16} />
        </Show>
      </button>
      <div class="h-4 w-px bg-foreground mx-1" />
      <span class="text-xs text-secondary/70 font-mono px-2">Markdown</span>
      <div class="h-4 w-px bg-foreground mx-1" />
      <button 
        onClick={(e) => { e.stopPropagation(); actions.deleteCell(props.cell.id); }}
        class="p-1.5 hover:bg-foreground rounded-sm text-primary"
        title="Delete Cell"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <CellWrapper
      id={props.cell.id}
      isActive={props.isActive}
      isEditing={props.cell.isEditing}
      onActivate={() => actions.setActiveCell(props.cell.id)}
      onDelete={() => actions.deleteCell(props.cell.id)}
      onMoveUp={() => actions.moveCell(props.index, props.index - 1)}
      onMoveDown={() => actions.moveCell(props.index, props.index + 1)}
      toolbar={toolbar}
      type="markdown"
      onActionClick={toggleEdit}
      hasError={renderError()}
      prevCellId={props.prevCellId}
      lastHeaderLevel={lastHeaderLevel()}
    >
      <div 
        class="min-h-12.5 w-full"
        onDblClick={() => actions.setEditing(props.cell.id, true)}
      >
        <Show
          when={props.cell.isEditing} 
          fallback={
            <div 
              class="prose prose-invert max-w-none p-3.5 max-xs:p-2.5 text-secondary"
              innerHTML={parsedContent()}
            />
          }
        >
          <div class="p-3.5 max-xs:p-2.5">
            <MarkdownEditor
              value={props.cell.content}
              onChange={(val) => actions.updateCell(props.cell.id, val)}
              cell={props.cell}
            />
          </div>
        </Show>
      </div>
    </CellWrapper>
  );
};

export default MarkdownCell;
