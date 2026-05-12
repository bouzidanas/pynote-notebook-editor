import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// Vitest config is intentionally separate from `vite.config.ts` so the dev
// build pipeline (workers, manualChunks, Tailwind plugin) doesn't interfere
// with test runs. New test files just need to live next to the code they
// cover and match the `include` glob below — no further wiring required.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    // Solid requires the "browser" + "development" conditions to load the
    // correct entry points when running under jsdom.
    conditions: ["browser", "development"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    // Stable, machine-readable output suitable for CI ingestion.
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "./reports/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./reports/coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "src/**/*.d.ts",
        "src/index.tsx",
        "src/App.tsx",
      ],
    },
  },
});
