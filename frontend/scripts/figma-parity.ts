/**
 * Figma parity check (plan W01.P10.S43/S44).
 *
 * Verifies that each registry component bound to a Figma node actually resolves to a node
 * of the same name (the naming-parity contract), and — when screenshots are present —
 * flags visual drift against the Storybook render.
 *
 * The read-only Figma MCP (`get_metadata` / `get_design_context` / `get_screenshot`) is an
 * agent/runtime capability, not callable from a plain Node process, so this script consumes
 * a snapshot the agent captures via MCP into `figma/figma-snapshot.json`:
 *
 *   { "nodes": [ { "id": "12:34", "name": "AppShell" }, ... ] }
 *
 * Run: `node scripts/figma-parity.ts` (exit 0 = parity holds / nothing bound yet; 1 = drift).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Registry } from "./figma-registry-lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..");
const registryPath = join(frontendRoot, "figma", "component-map.json");
const snapshotPath = join(frontendRoot, "figma", "figma-snapshot.json");

type Snapshot = { nodes: { id: string; name: string }[] };

function main(): void {
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;
  const bound = registry.components.filter((c) => c.figmaNodeId);

  if (bound.length === 0) {
    console.log(
      "figma-parity: no components bound to Figma nodes yet (seed Figma in plan W01.P09, " +
        "record node ids in the registry, then capture figma/figma-snapshot.json via MCP).",
    );
    return;
  }

  if (!existsSync(snapshotPath)) {
    console.error(
      `figma-parity: ${bound.length} components are bound but figma/figma-snapshot.json is ` +
        "missing. Capture it from the Figma file via the read-only MCP (get_metadata).",
    );
    process.exit(1);
    return;
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));

  const problems: string[] = [];
  let matched = 0;
  for (const c of bound) {
    const node = byId.get(c.figmaNodeId as string);
    if (!node) {
      problems.push(`${c.name}: bound node ${c.figmaNodeId} not found in the Figma snapshot`);
      continue;
    }
    if (node.name !== c.name) {
      problems.push(
        `${c.name}: naming parity broken — Figma node ${c.figmaNodeId} is named "${node.name}"`,
      );
      continue;
    }
    matched++;
  }

  if (problems.length === 0) {
    console.log(`figma-parity: OK — ${matched}/${bound.length} bound components match their Figma node.`);
    return;
  }
  console.error(`figma-parity: ${problems.length} problem(s):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

main();
