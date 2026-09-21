import { defineConfig } from "vitest/config";
import path from "node:path";

// Phase 1 (F4) — pure-function unit tests only (schedule-engine, delay-analysis,
// schedule-kpis…). No React/jsdom environment and no Supabase mocking; keep it
// that way so these stay fast and dependency-free.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
