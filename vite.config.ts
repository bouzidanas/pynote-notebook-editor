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
          // =================================================================
          // NOTEBOOK CONTENT - Large string literals, split into own chunks
          // =================================================================
          if (id.includes('/notebooks/no-magic/')) return 'notebooks-nomagic';
          if (id.includes('/notebooks/tutorials/')) return 'notebooks-tutorials';
          if (id.includes('/notebooks/testing/')) return 'notebooks-testing';

          if (id.includes('node_modules')) {
            // =================================================================
            // CHART LIBRARIES - Lazy loaded, separate chunks
            // These are only loaded when user creates a chart component
            // =================================================================

            // Observable Plot - keep only the plot library in its own chunk
            // d3 modules go to vendor (they're shared and tree-shaken anyway)
            if (id.includes('@observablehq/plot')) return 'chart-observable';

            // uPlot - high-performance time-series
            if (id.includes('uplot')) return 'chart-uplot';

            // Frappe Charts - pie, donut, heatmap
            if (id.includes('frappe-charts')) return 'chart-frappe';

            // =================================================================
            // CORE LIBRARIES - Always loaded
            // =================================================================

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