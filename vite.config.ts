import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

// The default theme and every preset use JetBrains Mono Variable (the two
// non-mono preset body fonts are only downloaded when those themes are
// active, so they aren't preloaded; taxing every visitor for them would
// cost more than it saves). The browser only discovers the woff2 after
// downloading and parsing the CSS bundle, so preloading the latin subset
// from index.html starts that download immediately and first paint isn't
// waiting on the font. The file is content-hashed, which is why the tag is
// injected at build time.
const preloadThemeFont = (): Plugin => ({
  name: 'preload-theme-font',
  transformIndexHtml: {
    order: 'post',
    handler(_html, ctx) {
      if (!ctx.bundle) return; // dev server, assets aren't hashed
      return Object.keys(ctx.bundle)
        .filter((name) => /jetbrains-mono-latin-wght-normal.*\.woff2$/.test(name))
        .map((name) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: '/' + name, crossorigin: '' },
          injectTo: 'head' as const,
        }));
    },
  },
})

export default defineConfig({
  plugins: [solid(), tailwindcss(), preloadThemeFont()],
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