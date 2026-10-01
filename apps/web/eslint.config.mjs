import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import moduleBoundaries from "./eslint-rules/module-boundaries.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Business modules may only import each other through their public API.
    // Ownership map and public APIs: module-boundaries.mjs.
    files: ["**/*.{ts,tsx,mts}"],
    plugins: { dcos: { rules: { "module-boundaries": moduleBoundaries } } },
    rules: { "dcos/module-boundaries": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
