import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // KaTeX - math rendering (large, rarely changes)
            if (id.includes('katex')) return 'katex';

            // Milkdown + ProseMirror - markdown editor (large, tightly coupled)
            if (id.includes('@milkdown') || id.includes('prosemirror')) return 'milkdown';

            // CodeMirror - code editor (large, separate from milkdown)
            if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror';

            // Syntax highlighting libraries
            if (id.includes('highlight.js') || id.includes('prismjs')) return 'syntax-highlight';

            // SolidJS framework core
            if (id.includes('solid-js') || id.includes('solid-dnd') || id.includes('solid-primitives') || id.includes('solid-transition')) return 'framework';

            // Markdown parsing (marked + DOMPurify)
            if (id.includes('marked') || id.includes('dompurify')) return 'markdown';

            // Lucide icons
            if (id.includes('lucide')) return 'icons';

            // Remaining small utilities (clsx, tailwind-merge, etc.)
            return 'vendor';
          }
        }
      }
    }
  }
})