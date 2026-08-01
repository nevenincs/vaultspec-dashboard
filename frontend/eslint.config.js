import js from "@eslint/js";
import tseslint from "typescript-eslint";

import stableSelectors from "./eslint-rules/stable-selectors.js";

export default tseslint.config(
  // `dev/scratch` is unmaintained throwaway — one-off probe scripts kept only for
  // reference, never held to the maintained-code bar. `dev/tooling/fixtures` is
  // DELIBERATELY invalid source fed to the localization scanner as test input; linting
  // it would be linting the test data.
  { ignores: ["dist", "node_modules", "dev/scratch", "dev/tooling/fixtures"] },
  js.configs.recommended,
  {
    // The gate/build tooling under `dev/tooling` executes under bare `node`, so its
    // globals are Node's, not the browser's. Declaring the environment is the honest
    // fix; per-line disables would just hide the same fact repeatedly.
    files: ["dev/tooling/**/*.{ts,mjs,js}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        // Node 22 ships these as globals; the SPA's `engines` field already
        // requires it, so they are as available here as `process` is.
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  {
    // The browser-driving tooling passes callbacks to `page.evaluate` and
    // `page.waitForFunction`, which Playwright serialises and executes INSIDE
    // the page. Those bodies are browser code that merely lives in a Node file,
    // so `document` is genuinely defined where they run. Declaring it for these
    // files is the honest fix, matching the Node declaration above; per-line
    // disables would restate the same fact at every call site.
    files: ["dev/tooling/visual-review-*.mjs"],
    languageOptions: {
      globals: { document: "readonly", window: "readonly" },
    },
  },
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
