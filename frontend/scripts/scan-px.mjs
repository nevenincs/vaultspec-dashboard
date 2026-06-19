#!/usr/bin/env node
// px-scan gate (relative-units-migration ADR): fails when hardcoded px appears in
// DOM CSS or *.tsx Tailwind arbitrary values. The WebGL scene layer, test fixtures,
// dev labs, and the CLI-managed token regions of styles.css are sanctioned exceptions.
//
// Usage:
//   node scripts/scan-px.mjs            scan and exit non-zero on any violation
//   node scripts/scan-px.mjs --init     (re)seed the allowlist from current violators
//
// The allowlist (scripts/px-allowlist.json) is a SHRINKING set of files still pending
// conversion. Each converted surface is removed from it; an allowlisted file that no
// longer contains px is reported as stale and fails the gate, so the list cannot rot.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..");
const srcRoot = join(frontendRoot, "src");
const allowlistPath = join(here, "px-allowlist.json");

// Directories/patterns where px is intrinsic or the file is not shipped DOM styling.
const EXCLUDE_DIR_SEGMENTS = ["scene", "graph-lab", "three-lab", "prototype"];
const EXCLUDE_FILE_RE = /\.(test|spec|gate\.test)\.[tj]sx?$/;
const SCAN_EXT_RE = /\.(css|tsx)$/;

// A line may opt out explicitly with this directive (e.g. a genuine 1px hairline a
// reviewer has signed off on); kept for escape-hatch parity, expected to stay empty.
const IGNORE_DIRECTIVE = "px-scan-ignore";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIR_SEGMENTS.includes(entry)) continue;
      walk(full, out);
    } else if (SCAN_EXT_RE.test(entry) && !EXCLUDE_FILE_RE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Blank out a span while preserving newlines so line numbers stay accurate.
function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

// Strip CLI-managed generated regions (any vaultspec:generated:*:begin/end pair).
function stripManagedRegions(content) {
  return content.replace(
    /\/\*\s*vaultspec:generated:[\w-]+:begin\s*\*\/[\s\S]*?\/\*\s*vaultspec:generated:[\w-]+:end\s*\*\//g,
    blank,
  );
}

// Strip block and line comments (CSS /* */, JS/JSX // and /* */), preserving newlines.
function stripComments(content) {
  let out = content.replace(/\/\*[\s\S]*?\*\//g, blank);
  out = out
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, (m) => blank(m)))
    .join("\n");
  return out;
}

const PX_RE = /\b\d*\.?\d+px\b/;

function findViolations(file) {
  const raw = readFileSync(file, "utf8");
  let scrubbed = raw;
  if (file.endsWith(".css")) scrubbed = stripManagedRegions(scrubbed);
  scrubbed = stripComments(scrubbed);
  const scrubbedLines = scrubbed.split("\n");
  const rawLines = raw.split("\n");
  const hits = [];
  for (let i = 0; i < scrubbedLines.length; i++) {
    if (rawLines[i] && rawLines[i].includes(IGNORE_DIRECTIVE)) continue;
    if (PX_RE.test(scrubbedLines[i])) {
      hits.push({ line: i + 1, text: rawLines[i].trim() });
    }
  }
  return hits;
}

function toRel(file) {
  return relative(frontendRoot, file).split(sep).join("/");
}

const files = walk(srcRoot);
const violators = new Map();
for (const file of files) {
  const hits = findViolations(file);
  if (hits.length) violators.set(toRel(file), hits);
}

const init = process.argv.includes("--init");
if (init) {
  const list = [...violators.keys()].sort();
  writeFileSync(allowlistPath, JSON.stringify(list, null, 2) + "\n");
  console.log(`px-scan: seeded allowlist with ${list.length} pending file(s).`);
  process.exit(0);
}

let allow = [];
try {
  allow = JSON.parse(readFileSync(allowlistPath, "utf8"));
} catch {
  allow = [];
}
const allowSet = new Set(allow);

const newViolations = [];
for (const [rel, hits] of violators) {
  if (!allowSet.has(rel)) newViolations.push([rel, hits]);
}
const staleAllow = allow.filter((rel) => !violators.has(rel));

let failed = false;
if (newViolations.length) {
  failed = true;
  console.error("\npx-scan: hardcoded px found outside the allowlist:\n");
  for (const [rel, hits] of newViolations) {
    console.error(`  ${rel}`);
    for (const h of hits) console.error(`    ${h.line}: ${h.text}`);
  }
}
if (staleAllow.length) {
  failed = true;
  console.error("\npx-scan: stale allowlist entries (no px left — remove them):\n");
  for (const rel of staleAllow) console.error(`  ${rel}`);
}

if (failed) {
  console.error(
    `\npx-scan FAILED. Pending (allowlisted): ${allowSet.size - staleAllow.length}. ` +
      `Convert px to rem (16px basis) or em (font-relative), routed through the ` +
      `--*-fg-* token scale, then drop the file from scripts/px-allowlist.json.\n`,
  );
  process.exit(1);
}

console.log(
  `px-scan: clean. ${allowSet.size} file(s) still allowlisted (pending conversion).`,
);
