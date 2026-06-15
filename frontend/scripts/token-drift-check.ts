/**
 * Token drift gate (plan W01.P05.S21).
 *
 * Fails the build when the generator-managed color regions in `src/styles.css` no longer
 * match a fresh regeneration from the DTCG source under `tokens/` — i.e. someone edited
 * the tokens without running `npm run tokens:build`, or hand-edited inside the markers.
 * Runs as part of the frontend lint gate (`just dev lint frontend`).
 *
 * Comparison is on parsed declaration values, so prettier's formatting of styles.css is
 * not drift. Run: `node scripts/token-drift-check.ts` (exit 0 = in sync; 1 = drift).
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { generateRegions, MARKERS, STYLES_FILE } from "../style-dictionary.config.ts";
import { compareDecls, extractRegion, parseScopedDecls } from "./token-css-diff.ts";

async function main(): Promise<void> {
  const fresh = await generateRegions();
  const css = readFileSync(STYLES_FILE, "utf8");

  const current = {
    colors: extractRegion(css, MARKERS.colors.begin, MARKERS.colors.end),
    themes: extractRegion(css, MARKERS.themes.begin, MARKERS.themes.end),
  };

  const diffs = [
    ...compareDecls(
      parseScopedDecls(current.colors, ":root"),
      parseScopedDecls(fresh.colors, ":root"),
    ),
    ...compareDecls(
      parseScopedDecls(current.themes, ":root"),
      parseScopedDecls(fresh.themes, ":root"),
    ),
  ];

  if (diffs.length === 0) {
    console.log("token-drift: OK — styles.css color regions match the DTCG source.");
    return;
  }
  console.error("token-drift: DRIFT — run `npm run tokens:build` and commit styles.css.");
  console.error(diffs.join("\n"));
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
