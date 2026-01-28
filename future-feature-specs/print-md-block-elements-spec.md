# print_md Block Element Detection Spec

## Overview

Currently, `print_md()` in `MarkdownWithUI` handles:
- Headings (`#`, `##`, etc.) - detected via regex `^(#{1,6})\s+`
- Horizontal rules (`---`) - parsed as separate paragraph type
- Paragraphs - default wrapper for text/UI content

Additional block-level markdown elements need individual detection to render correctly when mixed with UI components.

## Elements to Support

### Blockquotes
```markdown
> This is a quote with {ui_element}
```
- Detect: `^>\s+`
- Wrap mixed content in `<blockquote>` instead of `<p>`
- Handle nested blockquotes (`>>`)

### Unordered Lists
```markdown
- Item with {ui_element}
* Another item
```
- Detect: `^[-*+]\s+`
- Wrap in `<ul><li>` structure
- Handle nested lists (indentation)

### Ordered Lists
```markdown
1. First item with {ui_element}
2. Second item
```
- Detect: `^\d+\.\s+`
- Wrap in `<ol><li>` structure
- Handle nested lists

### Code Blocks
```markdown
```python
code here
```
```
- Detect: opening/closing triple backticks
- These likely won't have UI elements inside, but need proper detection to avoid wrapping in `<p>`

### Tables
```markdown
| Header | Value |
|--------|-------|
| Cell   | {ui}  |
```
- Complex detection needed
- Wrap in `<table><tr><td>` structure

## Implementation Approach

1. In the `paragraphs` memo, detect block element type at start of text segment
2. Store block type in paragraph metadata: `{ type: "blockquote" | "list-item" | "paragraph", items: [...] }`
3. In render, use appropriate wrapper based on block type
4. For lists, may need to group consecutive list items into single `<ul>` or `<ol>`
5. **Do NOT add `<br/>` after block element containers** - similar to headings, block elements like blockquotes, lists, code blocks, and tables should not have `<br/>` inserted after their `<div style="display: contents">` wrapper. These block elements have their own margin/spacing via prose styles. Currently this is done by checking `const isHeading = /^<h[1-6]/.test(html);` - extend this pattern to detect other block elements:
   ```tsx
   const isBlockElement = /^<(h[1-6]|blockquote|ul|ol|pre|table)/.test(html);
   // ...
   {!isLastParagraph && !isBlockElement && <br />}
   ```

## Priority

Medium - Current implementation handles most common use cases (headings, paragraphs, hr). Block quotes and lists are less commonly used with inline UI elements.

## Related Files

- `src/components/Output.tsx` - `MarkdownWithUI` component

## Already Implemented

### UI-Only Paragraphs (Block Display)
When a paragraph contains only UI elements (no text), they are wrapped in `<div class="w-full">` instead of `<span class="inline-block align-middle">`. This allows `width: 100%` to work correctly on UI components like sliders.

```tsx
const isUIOnly = paragraph.every(item => item.type === "ui");
// ...
return isUIOnly ? (
  <div class="w-full">
    <UIOutputRenderer data={item.data} />
  </div>
) : (
  <span class="inline-block align-middle">
    <UIOutputRenderer data={item.data} />
  </span>
);
```

Mixed content (text + UI) still uses `inline-block` span for proper inline flow.
