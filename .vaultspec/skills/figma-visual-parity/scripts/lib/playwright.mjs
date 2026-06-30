// Cross-platform Playwright resolver.
//
// The skill scripts must run identically on Windows, macOS, and Linux, and from
// any working directory. Playwright is rarely installed next to the skill, so we
// locate `@playwright/test` by searching a set of candidate roots and import its
// `chromium` launcher from wherever it actually lives.
//
// Resolution order:
//   1. $FIGMA_PARITY_PLAYWRIGHT (explicit directory containing node_modules)
//   2. every directory from the start dir up to the filesystem root
//   3. a sibling `frontend/` package (common in this monorepo)
//   4. every directory from this script's location up to the root
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function walkUp(startDir, limit = 16) {
  const out = [];
  let dir = resolve(startDir);
  for (let i = 0; i < limit; i += 1) {
    out.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function candidateRoots(startDir) {
  const roots = [];
  if (process.env.FIGMA_PARITY_PLAYWRIGHT) {
    roots.push(process.env.FIGMA_PARITY_PLAYWRIGHT);
  }
  roots.push(...walkUp(startDir));
  // Best-effort: many repos keep the web app (and Playwright) in a conventionally
  // named subdirectory. $FIGMA_PARITY_PLAYWRIGHT above is the deterministic path
  // when the layout does not match any of these.
  for (const sub of ["frontend", "web", "app", "client", "ui", "site"]) {
    roots.push(resolve(startDir, sub));
  }
  roots.push(...walkUp(here));
  return [...new Set(roots)];
}

/**
 * Resolve and import Playwright's chromium launcher.
 * @param {string} [startDir] directory to begin the upward search from
 * @returns {Promise<import('@playwright/test').BrowserType>}
 */
export async function loadChromium(startDir = process.cwd()) {
  for (const root of candidateRoots(startDir)) {
    const marker = join(root, "node_modules", "@playwright", "test", "package.json");
    if (!existsSync(marker)) continue;
    const require = createRequire(pathToFileURL(join(root, "package.json")).href);
    const entry = require.resolve("@playwright/test");
    const mod = await import(pathToFileURL(entry).href);
    // @playwright/test is CJS: under dynamic import() the launchers live on the
    // default export (module.exports), not as ESM named exports.
    const chromium = mod?.chromium ?? mod?.default?.chromium;
    if (chromium) return chromium;
  }
  throw new Error(
    [
      "Could not resolve @playwright/test.",
      "Install it where your app lives, e.g.:",
      "  npm install --save-dev @playwright/test && npx playwright install chromium",
      "or point the resolver at an existing install:",
      "  FIGMA_PARITY_PLAYWRIGHT=/path/to/project node <script>.mjs ...",
    ].join("\n"),
  );
}
