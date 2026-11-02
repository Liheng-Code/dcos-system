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
    // the scheduling engine package keeps its reference suite next to its code (doc 35 E8)
    include: ["**/*.test.ts", "../../packages/scheduling-engine/__tests__/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
