import js from "@eslint/js";
import tseslint from "typescript-eslint";

import stableSelectors from "./eslint-rules/stable-selectors.js";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { local: { rules: { "stable-selectors": stableSelectors } } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Structural guard for the stable-selectors project rule: fail the build
      // on a store selector that returns a freshly-minted reference.
      "local/stable-selectors": "error",
    },
  },
);
