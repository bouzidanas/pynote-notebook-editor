import { type Component, createMemo } from "solid-js";
import { highlightTree } from "@lezer/highlight";
import { type Tag, tags } from "@lezer/highlight";
import { pythonLanguage } from "@codemirror/lang-python";

// PRE-COMPUTED THEME MAP
// Constructed once at module load time. O(1) lookup speed.
// Using colors from @uiw/codemirror-theme-duotone (Duotone Dark)
const themeMap = new Map<Tag, string>([
  // --- Group 1: Peach/Orange (#ffcc99) - KEYWORDS ---
  [tags.keyword, "color: #ffcc99"],
  [tags.controlKeyword, "color: #ffcc99"],      // if, else, for, while, return
  [tags.definitionKeyword, "color: #ffcc99"],   // def, class, import, from
  [tags.moduleKeyword, "color: #ffcc99"],       // as, export
  [tags.atom, "color: #ffcc99"],                // True, False, None
  [tags.bool, "color: #ffcc99"],
  [tags.number, "color: #ffcc99"],
  [tags.integer, "color: #ffcc99"],
  [tags.float, "color: #ffcc99"],
  [tags.link, "color: #ffcc99"],
  [tags.url, "color: #ffcc99"],               // Duotone puts url in purple usually, but check source. Source: url is purple (#7a63ee). Fixed below.
  [tags.attributeName, "color: #ffcc99"],

  // --- Group 2: White/Lavender (#eeebff) - IDENTIFIERS ---
  [tags.name, "color: #eeebff"],
  [tags.variableName, "color: #eeebff"],
  [tags.tagName, "color: #eeebff"],
  [tags.heading, "color: #eeebff; font-weight: bold"],
  [tags.className, "color: #eeebff"],           
  [tags.namespace, "color: #eeebff"],
  [tags.macroName, "color: #eeebff"],
  
  // Specific Overrides for Python
  [tags.self, "color: #eeebff"],
  [tags.special(tags.variableName), "color: #eeebff"], 

  // --- Functions (Lavender #eeebff) ---
  // Matches Duotone Dark behavior (same as variables)
  [tags.function(tags.variableName), "color: #eeebff"],
  [tags.definition(tags.name), "color: #eeebff"],
  [tags.labelName, "color: #eeebff"],

  // --- Group 3: Purple (#7a63ee) - TYPES & URLS ---
  [tags.typeName, "color: #7a63ee"],
  [tags.url, "color: #7a63ee"],
  // [tags.namespace, "color: #7a63ee"], // Duotone source doesn't explicitly map namespace, usually falls to variable or name. Kept as Lavender above.

  // --- Group 4: Orange (#ffad5c) - OPERATORS ---
  [tags.operator, "color: #ffad5c"],
  [tags.arithmeticOperator, "color: #ffad5c"],  // +, -, *, /
  [tags.logicOperator, "color: #ffad5c"],       // and, or, not (if mapped to logicOp)
  [tags.bitwiseOperator, "color: #ffad5c"],
  [tags.compareOperator, "color: #ffad5c"],
  [tags.operatorKeyword, "color: #ffad5c"],     // in, is

  // --- Group 5: Light Orange (#ffb870) - STRINGS ---
  [tags.string, "color: #ffb870"],
  [tags.character, "color: #ffb870"],
  [tags.regexp, "color: #ffb870"],
  [tags.special(tags.string), "color: #ffb870"], // f-string expressions inside? No usually escapes.

  // --- Group 6: Light Purple (#9a86fd) - PROPERTIES ---
  [tags.propertyName, "color: #9a86fd"],       // obj.property

  // --- Group 7: Darker Orange (#e09142) - PUNCTUATION ---
  [tags.punctuation, "color: #e09142"],
  [tags.separator, "color: #e09142"],           // , : ;
  [tags.unit, "color: #e09142"],
  [tags.brace, "color: #e09142"],               // { } (Check if Duotone maps braces to Punctuation or Brackets)
  
  // --- Group 8: Greyish Purple (#6c6783) - COMMENTS & BRACKETS ---
  [tags.comment, "color: #6c6783"],
  [tags.lineComment, "color: #6c6783"],
  [tags.blockComment, "color: #6c6783"],
  [tags.docComment, "color: #6c6783"],
  [tags.bracket, "color: #6c6783"],             // [ ] ( )
  [tags.angleBracket, "color: #6c6783"],
  [tags.squareBracket, "color: #6c6783"],
  [tags.paren, "color: #6c6783"],
  [tags.meta, "color: #6c6783"],                // Decorators @foo

  // --- Misfits & Corrections ---
  [tags.quote, "color: #ffcc99"],
  [tags.invalid, "color: #ffcc99"],             // Often best to show as text
]);

// High-performance iterator for tag lookups
const getStyle = (tag: Tag | readonly Tag[]): string | null => {
  if (!Array.isArray(tag)) {
      // Cast is safe because we checked not array, so it must be Tag
      return themeMap.get(tag as Tag) || null;
  }
  // If it's an array of tags, return the first match
  for (const t of tag) {
      const style = themeMap.get(t);
      if (style) return style;
  }
  return null;
};

// Helper to escape HTML characters
const escapeHtml = (unsafe: string) => 
  unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

interface Props {
  code: string;
}

const CodeView: Component<Props> = (props) => {
  const html = createMemo(() => {
    // 1. Handle empty code (One empty line)
    if (!props.code) return '<div class="cm-line"><br></div>';
    
    // 2. Parse Code
    const tree = pythonLanguage.parser.parse(props.code);
    
    let output = "";
    let pos = 0;
    
    // 3. Line Buffer to replicate .cm-line structure
    let currentLine = "";
    
    const flushLine = () => {
       output += `<div class="cm-line" style="padding: 0 2px 0 6px">${currentLine || "<br>"}</div>`;
       currentLine = "";
    };

    const appendText = (text: string, style: string | null) => {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (i > 0) {
                flushLine();
            }
            const content = escapeHtml(lines[i]);
            if (style) {
                currentLine += `<span style="${style}">${content}</span>`;
            } else {
                currentLine += content;
            }
        }
    };

    // 4. Run the parser with our Map-based lookup
    highlightTree(tree, { style: getStyle }, (from, to, style) => {
        if (from > pos) {
            appendText(props.code.slice(pos, from), null);
        }
        appendText(props.code.slice(from, to), style);
        pos = to;
    });

    if (pos < props.code.length) {
        appendText(props.code.slice(pos), null);
    }
    
    flushLine();

    return output;
  });

  return (
    // Outer classes match the editor wrapper
    <div class="cm-editor cm-scroller text-[1rem] font-mono leading-[1.6] h-full" aria-hidden="true">
      <div class="cm-content cm-lineWrapping p-4 whitespace-pre-wrap wrap-break-word" innerHTML={html()} />
    </div>
  );
};




export default CodeView;
