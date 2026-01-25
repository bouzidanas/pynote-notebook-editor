import { highlightTree } from "@lezer/highlight";
import { tags, Tag } from "@lezer/highlight";
import { pythonLanguage } from "@codemirror/lang-python";
import hljs from 'highlight.js/lib/core';

// Language loader map - lazy load languages on first use
const languageLoaders: Record<string, () => Promise<any>> = {
    javascript: () => import('highlight.js/lib/languages/javascript'),
    js: () => import('highlight.js/lib/languages/javascript'),
    typescript: () => import('highlight.js/lib/languages/typescript'),
    ts: () => import('highlight.js/lib/languages/typescript'),
    cython: () => import('highlight.js/lib/languages/python'), // Cython uses Python highlighting
    pyx: () => import('highlight.js/lib/languages/python'),
    cpp: () => import('highlight.js/lib/languages/cpp'),
    'c++': () => import('highlight.js/lib/languages/cpp'),
    c: () => import('highlight.js/lib/languages/c'),
    rust: () => import('highlight.js/lib/languages/rust'),
    rs: () => import('highlight.js/lib/languages/rust'),
    julia: () => import('highlight.js/lib/languages/julia'),
    r: () => import('highlight.js/lib/languages/r'),
    bash: () => import('highlight.js/lib/languages/bash'),
    sh: () => import('highlight.js/lib/languages/bash'),
    shell: () => import('highlight.js/lib/languages/bash'),
    json: () => import('highlight.js/lib/languages/json'),
    yaml: () => import('highlight.js/lib/languages/yaml'),
    yml: () => import('highlight.js/lib/languages/yaml'),
    sql: () => import('highlight.js/lib/languages/sql'),
    html: () => import('highlight.js/lib/languages/xml'),
    xml: () => import('highlight.js/lib/languages/xml'),
    css: () => import('highlight.js/lib/languages/css'),
    markdown: () => import('highlight.js/lib/languages/markdown'),
    md: () => import('highlight.js/lib/languages/markdown'),
};

// Track which languages have been loaded
const loadedLanguages = new Set<string>();

// Map aliases to canonical names for hljs registration
const canonicalNames: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    pyx: 'python',
    cython: 'python',
    'c++': 'cpp',
    rs: 'rust',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
    html: 'xml',
};

// Python highlight style - array of tag+color pairs
// Order matters: more specific tags (composite) should come first
const pythonStyleRules: Array<{ tag: Tag, color: string }> = [
    // --- Functions (#a6e3a1) - must come before variableName ---
    { tag: tags.function(tags.variableName), color: "#a6e3a1" },
    { tag: tags.function(tags.definition(tags.variableName)), color: "#a6e3a1" },
    { tag: tags.function(tags.propertyName), color: "#a6e3a1" },
    { tag: tags.definition(tags.name), color: "#a6e3a1" },

    // --- Group 1: Peach/Orange (#ffcc99) - KEYWORDS ---
    { tag: tags.keyword, color: "#ffcc99" },
    { tag: tags.controlKeyword, color: "#ffcc99" },
    { tag: tags.definitionKeyword, color: "#ffcc99" },
    { tag: tags.moduleKeyword, color: "#ffcc99" },
    { tag: tags.atom, color: "#ffcc99" },
    { tag: tags.bool, color: "#ffcc99" },
    { tag: tags.number, color: "#ffcc99" },
    { tag: tags.integer, color: "#ffcc99" },
    { tag: tags.float, color: "#ffcc99" },
    { tag: tags.link, color: "#ffcc99" },
    { tag: tags.attributeName, color: "#ffcc99" },

    // --- Group 2: White/Lavender (#eeebff) - IDENTIFIERS ---
    { tag: tags.name, color: "#eeebff" },
    { tag: tags.variableName, color: "#eeebff" },
    { tag: tags.tagName, color: "#eeebff" },
    { tag: tags.className, color: "#eeebff" },
    { tag: tags.namespace, color: "#eeebff" },
    { tag: tags.macroName, color: "#eeebff" },
    { tag: tags.self, color: "#eeebff" },
    { tag: tags.special(tags.variableName), color: "#eeebff" },
    { tag: tags.labelName, color: "#eeebff" },

    // --- Group 3: Purple (#7a63ee) - TYPES & URLS ---
    { tag: tags.typeName, color: "#7a63ee" },
    { tag: tags.url, color: "#7a63ee" },

    // --- Group 4: Orange (#ffad5c) - OPERATORS ---
    { tag: tags.operator, color: "#ffad5c" },
    { tag: tags.arithmeticOperator, color: "#ffad5c" },
    { tag: tags.logicOperator, color: "#ffad5c" },
    { tag: tags.bitwiseOperator, color: "#ffad5c" },
    { tag: tags.compareOperator, color: "#ffad5c" },
    { tag: tags.operatorKeyword, color: "#ffad5c" },

    // --- Group 5: Light Orange (#ffb870) - STRINGS ---
    { tag: tags.string, color: "#ffb870" },
    { tag: tags.character, color: "#ffb870" },
    { tag: tags.regexp, color: "#ffb870" },
    { tag: tags.special(tags.string), color: "#ffb870" },

    // --- Group 6: Light Purple (#9a86fd) - PROPERTIES ---
    { tag: tags.propertyName, color: "#9a86fd" },

    // --- Group 7: Darker Orange (#e09142) - PUNCTUATION ---
    { tag: tags.punctuation, color: "#e09142" },
    { tag: tags.separator, color: "#e09142" },
    { tag: tags.unit, color: "#e09142" },
    { tag: tags.brace, color: "#e09142" },

    // --- Group 8: Greyish Purple (#6c6783) - COMMENTS & BRACKETS ---
    { tag: tags.comment, color: "#6c6783" },
    { tag: tags.lineComment, color: "#6c6783" },
    { tag: tags.blockComment, color: "#6c6783" },
    { tag: tags.docComment, color: "#6c6783" },
    { tag: tags.bracket, color: "#6c6783" },
    { tag: tags.angleBracket, color: "#6c6783" },
    { tag: tags.squareBracket, color: "#6c6783" },
    { tag: tags.paren, color: "#6c6783" },
    { tag: tags.meta, color: "#6c6783" },

    // --- Misfits & Corrections ---
    { tag: tags.quote, color: "#ffcc99" },
    { tag: tags.invalid, color: "#ffcc99" },
];

// Match input tags against our style rules
// Rules are checked in order - first match wins (so more specific rules come first)
const matchStyle = (inputTags: readonly Tag[]): string | null => {
    // Create a Set of all input tags for fast lookup
    const inputTagSet = new Set<Tag>();
    for (const t of inputTags) {
        // Add the tag and all its parent tags
        for (const st of t.set) {
            inputTagSet.add(st);
        }
    }

    for (const rule of pythonStyleRules) {
        // Check if ALL tags in the rule's set are present in input
        const ruleTagSet = rule.tag.set;
        let allMatch = true;
        for (const ruleSubTag of ruleTagSet) {
            if (!inputTagSet.has(ruleSubTag)) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) {
            return `color: ${rule.color};`;
        }
    }
    return null;
};

// Highlighter object for highlightTree
const pythonHighlighter = {
    style: (inputTags: readonly Tag[]): string | null => {
        return matchStyle(inputTags);
    }
};

// Helper to escape HTML characters
const escapeHtml = (unsafe: string) =>
    unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

/**
 * Highlights Python code and returns HTML string with inline styles.
 * Matches the Duotone Dark theme used in CodeMirror editor.
 */
export const highlightPython = (code: string): string => {
    if (!code) return '';

    const tree = pythonLanguage.parser.parse(code);

    let output = "";
    let pos = 0;

    const appendText = (text: string, style: string) => {
        const escaped = escapeHtml(text);
        if (style) {
            output += `<span style="${style}">${escaped}</span>`;
        } else {
            output += escaped;
        }
    };

    highlightTree(tree, pythonHighlighter, (from, to, style) => {
        if (from > pos) {
            appendText(code.slice(pos, from), "");
        }
        appendText(code.slice(from, to), style);
        pos = to;
    });

    if (pos < code.length) {
        appendText(code.slice(pos), "");
    }

    return output;
};

/**
 * Checks if a language identifier should use Python highlighting (via Lezer).
 */
export const isPythonLanguage = (lang: string | undefined): boolean => {
    if (!lang) return false;
    const normalized = lang.toLowerCase().trim();
    return ['python', 'py', 'python3'].includes(normalized);
};

/**
 * Checks if a language is supported by highlight.js (lazy loaded).
 */
export const isSupportedLanguage = (lang: string | undefined): boolean => {
    if (!lang) return false;
    const normalized = lang.toLowerCase().trim();
    return normalized in languageLoaders;
};

/**
 * Lazily loads and highlights code with highlight.js.
 * Returns highlighted HTML or null if language not supported.
 */
export const highlightWithHljs = async (code: string, lang: string): Promise<string | null> => {
    const normalized = lang.toLowerCase().trim();
    const loader = languageLoaders[normalized];

    if (!loader) return null;

    const canonical = canonicalNames[normalized] || normalized;

    // Lazy load the language if not already loaded
    if (!loadedLanguages.has(canonical)) {
        try {
            const module = await loader();
            hljs.registerLanguage(canonical, module.default);
            loadedLanguages.add(canonical);
        } catch (e) {
            console.warn(`Failed to load highlight.js language: ${lang}`, e);
            return null;
        }
    }

    try {
        const result = hljs.highlight(code, { language: canonical });
        return result.value;
    } catch (e) {
        console.warn(`Failed to highlight code as ${lang}`, e);
        return null;
    }
};
