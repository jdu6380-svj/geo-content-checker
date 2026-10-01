import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: currentDirectory });

const config = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      ".next/**",
      ".playwright-cli/**",
      "coverage/**",
      "design-qa/**",
      "design-qa-artifacts/**",
      "node_modules/**",
      "output/**",
      "outputs/**",
      "work/**",
    ],
  },
];

export default config;
