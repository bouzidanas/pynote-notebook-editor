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
// Order matters: more specific tags (composite) should come first.
// Colors are var(--syntax-*) references into the shared syntax palette, so
// markdown Python blocks track the active scheme + overrides like the editor.
const pythonStyleRules: Array<{ tag: Tag, color: string }> = [
    // --- Functions - must come before variableName ---
    { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
    { tag: tags.function(tags.definition(tags.variableName)), color: "var(--syntax-function)" },
    { tag: tags.function(tags.propertyName), color: "var(--syntax-function)" },
    { tag: tags.definition(tags.name), color: "var(--syntax-function)" },

    // --- Keywords ---
    { tag: tags.keyword, color: "var(--syntax-keyword)" },
    { tag: tags.controlKeyword, color: "var(--syntax-keyword)" },
    { tag: tags.definitionKeyword, color: "var(--syntax-keyword)" },
    { tag: tags.moduleKeyword, color: "var(--syntax-keyword)" },
    { tag: tags.atom, color: "var(--syntax-keyword)" },
    { tag: tags.bool, color: "var(--syntax-keyword)" },
    { tag: tags.link, color: "var(--syntax-keyword)" },
    { tag: tags.attributeName, color: "var(--syntax-keyword)" },

    // --- Numbers ---
    { tag: tags.number, color: "var(--syntax-number)" },
    { tag: tags.integer, color: "var(--syntax-number)" },
    { tag: tags.float, color: "var(--syntax-number)" },

    // --- Identifiers ---
    { tag: tags.name, color: "var(--syntax-variable)" },
    { tag: tags.variableName, color: "var(--syntax-variable)" },
    { tag: tags.tagName, color: "var(--syntax-variable)" },
    { tag: tags.className, color: "var(--syntax-type)" },
    { tag: tags.namespace, color: "var(--syntax-variable)" },
    { tag: tags.macroName, color: "var(--syntax-variable)" },
    { tag: tags.self, color: "var(--syntax-variable)" },
    { tag: tags.special(tags.variableName), color: "var(--syntax-variable)" },
    { tag: tags.labelName, color: "var(--syntax-variable)" },

    // --- Types & URLs ---
    { tag: tags.typeName, color: "var(--syntax-type)" },
    { tag: tags.url, color: "var(--syntax-type)" },

    // --- Operators ---
    { tag: tags.operator, color: "var(--syntax-operator)" },
    { tag: tags.arithmeticOperator, color: "var(--syntax-operator)" },
    { tag: tags.logicOperator, color: "var(--syntax-operator)" },
    { tag: tags.bitwiseOperator, color: "var(--syntax-operator)" },
    { tag: tags.compareOperator, color: "var(--syntax-operator)" },
    { tag: tags.operatorKeyword, color: "var(--syntax-operator)" },

    // --- Strings ---
    { tag: tags.string, color: "var(--syntax-string)" },
    { tag: tags.character, color: "var(--syntax-string)" },
    { tag: tags.regexp, color: "var(--syntax-string)" },
    { tag: tags.special(tags.string), color: "var(--syntax-string)" },

    // --- Properties ---
    { tag: tags.propertyName, color: "var(--syntax-property)" },

    // --- Punctuation ---
    { tag: tags.punctuation, color: "var(--syntax-punctuation)" },
    { tag: tags.separator, color: "var(--syntax-punctuation)" },
    { tag: tags.unit, color: "var(--syntax-punctuation)" },
    { tag: tags.brace, color: "var(--syntax-punctuation)" },

    // --- Comments & Brackets ---
    { tag: tags.comment, color: "var(--syntax-comment)" },
    { tag: tags.lineComment, color: "var(--syntax-comment)" },
    { tag: tags.blockComment, color: "var(--syntax-comment)" },
    { tag: tags.docComment, color: "var(--syntax-comment)" },
    { tag: tags.bracket, color: "var(--syntax-comment)" },
    { tag: tags.angleBracket, color: "var(--syntax-comment)" },
    { tag: tags.squareBracket, color: "var(--syntax-comment)" },
    { tag: tags.paren, color: "var(--syntax-comment)" },
    { tag: tags.meta, color: "var(--syntax-comment)" },

    // --- Misfits & Corrections ---
    { tag: tags.quote, color: "var(--syntax-keyword)" },
    { tag: tags.invalid, color: "var(--syntax-keyword)" },
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
