import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Vitest's Oxc path currently treats some .test.tsx files as plain TypeScript.
  // Keep JSX handling explicit until that upstream parser behavior is resolved.
  oxc: false,
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": currentDirectory,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["components/**/*.test.tsx"],
  },
});
