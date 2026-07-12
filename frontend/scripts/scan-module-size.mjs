#!/usr/bin/env node
// Module-size gate (module-decomposition mandate, 2026-07-12): fails when a source
// module reaches monolith size. A module at or over the limit is a decomposition
// target, never a place to keep writing. The gate is a RATCHET:
//
//   - a file NOT in the baseline that reaches the limit fails (no new monoliths),
//   - a baselined (grandfathered) file that GROWS past its recorded size fails
//     (existing monoliths may only shrink),
//   - a baselined file that drops under the limit is a stale entry and fails
//     until removed (the list cannot rot),
//   - `--ratchet` rewrites every baseline entry DOWN to the current count
//     (never up), so partial decompositions lock in.
//
// Scope: frontend/src (*.ts/*.tsx, tests included — test monoliths rot the same
// way) and engine/crates (*.rs). Generated artifacts and dependency/output dirs
// are excluded.
//
// Usage:
//   node scripts/scan-module-size.mjs             scan and exit non-zero on violation
//   node scripts/scan-module-size.mjs --init      (re)seed the baseline from violators
//   node scripts/scan-module-size.mjs --ratchet   tighten baseline entries downward

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const LIMIT = 1500;

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..");
const repoRoot = join(frontendRoot, "..");
const baselinePath = join(here, "module-size-baseline.json");

const ROOTS = [
  { dir: join(frontendRoot, "src"), ext: /\.tsx?$/ },
  { dir: join(repoRoot, "engine", "crates"), ext: /\.rs$/ },
];

// Dependency, build-output, and generated trees are not authored modules.
const EXCLUDE_DIR_SEGMENTS = ["node_modules", "target", "dist", "generated"];

function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIR_SEGMENTS.includes(entry)) continue;
      walk(full, ext, out);
    } else if (ext.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function countLines(file) {
  const raw = readFileSync(file, "utf8");
  if (raw.length === 0) return 0;
  let lines = raw.split("\n").length;
  if (raw.endsWith("\n")) lines -= 1;
  return lines;
}

function toRel(file) {
  return relative(repoRoot, file).split(sep).join("/");
}

const sizes = new Map();
for (const { dir, ext } of ROOTS) {
  for (const file of walk(dir, ext)) {
    const lines = countLines(file);
    if (lines >= LIMIT) sizes.set(toRel(file), lines);
  }
}

const init = process.argv.includes("--init");
const ratchet = process.argv.includes("--ratchet");

if (init) {
  const baseline = Object.fromEntries(
    [...sizes.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `module-size: seeded baseline with ${sizes.size} grandfathered file(s).`,
  );
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  baseline = {};
}

if (ratchet) {
  let tightened = 0;
  const next = {};
  for (const [rel, granted] of Object.entries(baseline)) {
    const current = sizes.get(rel);
    if (current === undefined) continue; // dropped under the limit — leave out
    next[rel] = Math.min(granted, current);
    if (next[rel] < granted) tightened += 1;
  }
  writeFileSync(
    baselinePath,
    JSON.stringify(
      Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
      null,
      2,
    ) + "\n",
  );
  console.log(
    `module-size: ratcheted ${tightened} entry(s) down; ${Object.keys(next).length} remain grandfathered.`,
  );
  process.exit(0);
}

const newMonoliths = [];
const grown = [];
for (const [rel, lines] of sizes) {
  const granted = baseline[rel];
  if (granted === undefined) {
    newMonoliths.push([rel, lines]);
  } else if (lines > granted) {
    grown.push([rel, lines, granted]);
  }
}
const stale = Object.keys(baseline).filter((rel) => !sizes.has(rel));

let failed = false;
if (newMonoliths.length) {
  failed = true;
  console.error(
    `\nmodule-size: new monolith(s) at or over ${LIMIT} lines — split into scoped submodules:\n`,
  );
  for (const [rel, lines] of newMonoliths) console.error(`  ${lines}  ${rel}`);
}
if (grown.length) {
  failed = true;
  console.error(
    `\nmodule-size: grandfathered module(s) GREW — a monolith may only shrink:\n`,
  );
  for (const [rel, lines, granted] of grown)
    console.error(`  ${rel}: ${lines} lines (baseline ${granted})`);
}
if (stale.length) {
  failed = true;
  console.error(
    `\nmodule-size: stale baseline entries (now under ${LIMIT} — remove them):\n`,
  );
  for (const rel of stale) console.error(`  ${rel}`);
}

if (failed) {
  console.error(
    `\nmodule-size FAILED. Split the module into constrained, well-scoped ` +
      `submodules (each under ${LIMIT} lines); run --ratchet after a partial ` +
      `decomposition to lock the gains in scripts/module-size-baseline.json.\n`,
  );
  process.exit(1);
}

console.log(
  `module-size: clean. ${Object.keys(baseline).length} file(s) grandfathered (pending decomposition).`,
);
