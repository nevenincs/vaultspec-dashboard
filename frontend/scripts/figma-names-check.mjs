#!/usr/bin/env node
// figma:names gate (figma-naming-contract campaign). The Figma <-> code join is
// name-as-contract: a component's Figma node name equals its React export symbol, with a
// cited-node fallback for aliases/sub-frames (see frontend/figma/README.md). There is no
// component-map.json registry and no Code Connect.
//
// This gate validates the OPT-IN canonical citation marker wherever it appears in source:
//
//   // @figma <Name> · SlhonORmySdoSMTQgDWw3w · <nodeId>[ · alias-of <ReactExport>]
//
// It does NOT touch free-prose Figma mentions ("binding Figma kit 135:2") — only lines
// carrying the literal `@figma` marker opt in. The check is local and fast (no Figma API):
//   - the marker is well-formed (Name · fileKey · nodeId, optional alias-of);
//   - the fileKey is the binding file;
//   - the nodeId is well-formed (\d+:\d+);
//   - no two non-alias headers cite the same nodeId.
//
// Usage: node scripts/figma-names-check.mjs

import { readdirSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src");
const repoRoot = join(here, "..", "..");

const BINDING_FILE_KEY = "SlhonORmySdoSMTQgDWw3w";
// Canonical: `@figma <Name> · <fileKey> · <nodeId>` with optional ` · alias-of <Symbol>`.
// Middot (·) separators; surrounding whitespace tolerated.
const MARKER = /@figma\s+(.+?)\s+·\s+(\S+)\s+·\s+(\S+?)(?:\s+·\s+alias-of\s+(\S+))?\s*$/;
const NODE_ID = /^\d+:\d+$/;

const exts = new Set([".ts", ".tsx"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules") continue;
      walk(p);
    } else if (exts.has(p.slice(p.lastIndexOf(".")))) {
      files.push(p);
    }
  }
})(srcRoot);

const violations = [];
const byNode = new Map(); // nodeId -> first non-alias citation location
let validated = 0;

for (const file of files) {
  const rel = relative(repoRoot, file).split(sep).join("/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.includes("@figma")) return;
    const loc = `${rel}:${i + 1}`;
    const m = line.match(MARKER);
    if (!m) {
      violations.push(`${loc}  malformed @figma marker — want: @figma <Name> · ${BINDING_FILE_KEY} · <nodeId>[ · alias-of <Export>]`);
      return;
    }
    validated += 1;
    const [, name, fileKey, nodeId, alias] = m;
    if (fileKey !== BINDING_FILE_KEY)
      violations.push(`${loc}  fileKey "${fileKey}" is not the binding file ${BINDING_FILE_KEY}`);
    if (!NODE_ID.test(nodeId))
      violations.push(`${loc}  nodeId "${nodeId}" is not well-formed (want \\d+:\\d+)`);
    if (!name.trim())
      violations.push(`${loc}  empty component name in @figma marker`);
    if (!alias) {
      const prev = byNode.get(nodeId);
      if (prev) violations.push(`${loc}  nodeId ${nodeId} already cited at ${prev} (use · alias-of <Export> if intentional)`);
      else byNode.set(nodeId, loc);
    }
  });
}

if (violations.length) {
  console.error(`figma:names — ${violations.length} violation(s):\n` + violations.map((v) => "  " + v).join("\n"));
  process.exit(1);
}
console.log(`figma:names — OK (${validated} canonical @figma citation${validated === 1 ? "" : "s"} validated against ${BINDING_FILE_KEY})`);
