/**
 * Token drift gate (plan W01.P05.S21).
 *
 * Fails the build when the committed generated color CSS (`src/styles.generated.css`) no
 * longer matches a fresh regeneration from the DTCG source, i.e. someone edited the
 * tokens without regenerating, or hand-edited the generated file. Runs as part of the
 * frontend lint gate (`just dev lint frontend`).
 *
 * Run: `node scripts/token-drift-check.ts` (exit 0 = in sync; exit 1 = drift).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { generateCss } from "../style-dictionary.config.ts";
import { diffCss } from "./token-css-diff.ts";

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = join(here, "..", "src", "styles.generated.css");

async function main(): Promise<void> {
  const fresh = await generateCss();
  let committed: string;
  try {
    committed = readFileSync(committedPath, "utf8");
  } catch {
    console.error(
      "token-drift: src/styles.generated.css is missing. Run `npm run tokens:build`.",
    );
    process.exit(1);
    return;
  }

  const diffs = diffCss(committed, fresh);
  if (diffs.length === 0) {
    console.log("token-drift: OK — committed generated CSS matches the DTCG source.");
    return;
  }
  console.error("token-drift: DRIFT — regenerate with `npm run tokens:build` and commit.");
  console.error(diffs.join("\n"));
  process.exit(1);
}

// Run only when invoked directly, so tests can import helpers without side effects.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
