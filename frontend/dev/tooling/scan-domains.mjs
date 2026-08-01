#!/usr/bin/env node
// domain-scan gate — the production/dev fence.
//
// Production code and development scaffolding are separate domains. `frontend/src`
// ships; `frontend/dev` never does. The boundary is one-way:
//
//     dev/**  ──may import──▶  src/**     the harness renders REAL components
//     src/**  ──may import──▶  dev/**     FORBIDDEN
//
// A component gallery was built in this repo once and removed, because it needed a
// seeded engine wire to render populated chrome and that wire ended up living
// outside the test gates. Alongside it, the preview concern leaked into production
// four separate ways: a dev-only prop on a shipped component, a dev module inside the
// production stores layer, dev copy compiled into the shipped localization catalog,
// and five harnesses under `src/`. Every one of those passed code review at the time.
// A convention did not hold the line, so this gate does.
//
// Checks:
//   A  no dev-shaped directory under src/
//   B  no src/** -> dev/** import
//   C  no dev-only preview affordance on a production component
//   D  no dev HTML entry at the frontend root
//   E  the production build input is exactly index.html
//   F  tooling lives in dev/tooling, not at the frontend root
//
// Usage: node dev/tooling/scan-domains.mjs

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..", "..");
const srcRoot = join(frontendRoot, "src");

const SCAN_EXT = /\.(?:tsx?|css)$/;
const SKIP_DIRS = new Set(["node_modules", "dist"]);

// Directory names that mark development scaffolding. A directory matching one of
// these under src/ is dev code sitting in the production tree.
const DEV_DIR_SHAPES = [
  /-visual$/,
  /-lab$/,
  /^labs$/,
  /^gallery$/,
  /^prototype$/,
  /^scratch$/,
  /^spike$/,
];

// Prop/field names whose ONLY purpose is to let a harness override what a component
// would otherwise derive. A production component must derive its own state; a harness
// drives a presentational view by passing that state as a normal required prop
// instead. See the visual-review-harness ADR (D1/D2).
const PREVIEW_AFFORDANCE = /\b(?:stateOverride|modeOverride|forceState|previewState|__harness\w*)\b/;

// Known-pending violations, each with the step that retires it. This is a RATCHET,
// not an allowlist: entries may only be removed, never added. A new violation fails
// the gate even if the file is listed for a different reason.
const PENDING = new Map();

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (SCAN_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative POSIX path, so findings read the same on every platform. */
function rel(file) {
  return relative(frontendRoot, file).split(sep).join("/");
}

/** Strip comments so prose describing a rule never trips the rule. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));
}

const findings = [];
function report(check, path, detail) {
  findings.push({ check, path, detail });
}

// ---- A: no dev-shaped directory under src/ -------------------------------------
(function checkDevDirsInSrc(dir = srcRoot) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory() || SKIP_DIRS.has(entry)) continue;
    if (DEV_DIR_SHAPES.some((re) => re.test(entry))) {
      report("A", rel(full), `dev-shaped directory in the production tree`);
    }
    checkDevDirsInSrc(full);
  }
})();

// ---- B + C: per-file checks over src/ -------------------------------------------
const srcFiles = walk(srcRoot);
for (const file of srcFiles) {
  const path = rel(file);
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const lines = code.split("\n");

  lines.forEach((line, i) => {
    // B: any import that escapes into the dev tree.
    const importMatch = line.match(/\b(?:from|import)\s+["']([^"']+)["']/);
    if (importMatch) {
      const spec = importMatch[1];
      if (/(^|\/)dev\//.test(spec) || spec.startsWith("@dev/")) {
        report("B", `${path}:${i + 1}`, `production imports the dev tree: ${spec}`);
      }
    }
    // C: a dev-only preview affordance on a production component.
    const affordance = line.match(PREVIEW_AFFORDANCE);
    if (affordance) {
      report("C", `${path}:${i + 1}`, `preview affordance \`${affordance[0]}\``);
    }
  });
}

// ---- D: no dev HTML entry at the frontend root ----------------------------------
for (const entry of readdirSync(frontendRoot)) {
  if (entry.endsWith(".html") && entry !== "index.html") {
    report("D", entry, "dev HTML entry at the production root — move it under dev/");
  }
}

// ---- F: tooling lives in dev/tooling, not at the frontend root -------------------
// Gates, scanners, and the figma/token tooling ship nothing, so they belong in the
// dev domain with everything else that never reaches a bundle. A reappearing
// `scripts/` directory is the specific regression this catches: it is where all of
// this lived before, and it is where a new scanner would land by habit.
if (existsSync(join(frontendRoot, "scripts"))) {
  report("F", "scripts/", "tooling directory outside the dev domain — use dev/tooling/");
}
for (const entry of readdirSync(frontendRoot)) {
  if (/^(?:scan|figma|token)-.*\.(?:mjs|ts)$/.test(entry)) {
    report("F", entry, "tooling module at the production root — move it to dev/tooling/");
  }
}

// ---- E: the production build input is exactly index.html ------------------------
{
  const viteConfig = join(frontendRoot, "vite.config.ts");
  if (existsSync(viteConfig)) {
    const text = readFileSync(viteConfig, "utf8");
    const inputs = [...text.matchAll(/resolve\(import\.meta\.dirname,\s*"([^"]+\.html)"\)/g)].map(
      (m) => m[1],
    );
    const stray = inputs.filter((i) => i !== "index.html");
    if (stray.length) {
      report("E", "vite.config.ts", `non-index build input(s): ${stray.join(", ")}`);
    }
  }
}

// ---- verdict --------------------------------------------------------------------
const CHECK_LABEL = {
  A: "dev-shaped directory under src/",
  B: "src/** importing dev/**",
  C: "dev-only preview affordance in production",
  D: "dev HTML entry at the frontend root",
  F: "tooling outside the dev domain",
  E: "production build input is not exactly index.html",
};

const pendingHit = new Set();
const live = [];
for (const f of findings) {
  const filePath = f.path.split(":")[0];
  if (PENDING.has(filePath)) pendingHit.add(filePath);
  else live.push(f);
}

let failed = false;

if (live.length) {
  failed = true;
  console.error("\ndomain-scan: production/dev fence violated:\n");
  const byCheck = new Map();
  for (const f of live) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }
  for (const [check, items] of [...byCheck].sort()) {
    console.error(`  [${check}] ${CHECK_LABEL[check]}`);
    for (const f of items) console.error(`      ${f.path} — ${f.detail}`);
    console.error("");
  }
}

const staleP = [...PENDING.keys()].filter((p) => !pendingHit.has(p));
if (staleP.length) {
  failed = true;
  console.error("\ndomain-scan: stale pending entries (now clean — delete them):\n");
  for (const p of staleP) console.error(`  ${p}`);
  console.error("");
}

if (failed) {
  console.error(
    "domain-scan FAILED. Development scaffolding belongs under frontend/dev/, and " +
      "production components must never carry an affordance that exists only to " +
      "serve a harness. Imports are one-way: dev/** may import src/**, never the " +
      "reverse.\n",
  );
  process.exit(1);
}

console.log(
  `domain-scan: clean. ${PENDING.size} pending violation(s) awaiting their retiring step.`,
);
