/**
 * Code↔Figma mapping-registry validator / generator (plan W01.P08.S36).
 *
 * Default (CI gate): discover the React chrome components, load `figma/component-map.json`,
 * and fail if the registry is missing entries, carries stale ones, has source drift, or an
 * invalid Figma binding — the naming-parity contract that stands in for Code Connect.
 *
 *   node scripts/figma-registry-check.ts            # validate (exit 1 on problems)
 *   node scripts/figma-registry-check.ts --write     # (re)generate the registry, keeping
 *                                                     # any existing Figma bindings
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildRegistry,
  discoverComponents,
  validateRegistry,
  type Registry,
} from "./figma-registry-lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..");
const appDir = join(frontendRoot, "src", "app");
const registryPath = join(frontendRoot, "figma", "component-map.json");

function main(): void {
  const write = process.argv.includes("--write");
  const discovered = discoverComponents(appDir, frontendRoot);

  if (write) {
    const existing: Registry | undefined = existsSync(registryPath)
      ? (JSON.parse(readFileSync(registryPath, "utf8")) as Registry)
      : undefined;
    const registry = buildRegistry(discovered, existing);
    writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
    const bound = registry.components.filter((c) => c.figmaNodeId).length;
    console.log(
      `figma-registry: wrote ${registry.components.length} components ` +
        `(${bound} bound to Figma) to figma/component-map.json`,
    );
    return;
  }

  if (!existsSync(registryPath)) {
    console.error("figma-registry: figma/component-map.json missing. Run with --write.");
    process.exit(1);
    return;
  }

  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;
  const problems = validateRegistry(registry, discovered);
  const bound = registry.components.filter((c) => c.figmaNodeId).length;

  if (problems.length === 0) {
    console.log(
      `figma-registry: OK — ${registry.components.length} components mapped, ` +
        `${bound} bound to Figma nodes.`,
    );
    return;
  }
  console.error(`figma-registry: ${problems.length} problem(s):`);
  for (const p of problems) console.error("  " + p);
  console.error("\nRun `npm run figma:registry -- --write` to sync the registry.");
  process.exit(1);
}

main();
