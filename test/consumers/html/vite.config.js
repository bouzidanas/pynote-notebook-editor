import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Every page of the site (Vite builds only index.html by default).
const page = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  build: { rollupOptions: { input: { index: page("index"), settings: page("settings"), csp: page("csp"), components: page("components") } } },
});
