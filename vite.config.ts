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
            if (id.includes('katex')) return 'katex';
            if (id.includes('@milkdown') || id.includes('prosemirror')) return 'milkdown';
            if (id.includes('solid-js') || id.includes('solid-dnd')) return 'framework';
            if (id.includes('marked') || id.includes('dompurify')) return 'markdown';
            
            return 'vendor';
          }
        }
      }
    }
  }
})