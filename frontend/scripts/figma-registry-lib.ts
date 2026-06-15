/**
 * Code↔Figma mapping-registry library (plan W01.P08). Pure discovery + validation helpers,
 * dependency-free so both the generator, the validator, and tests can import them.
 *
 * The registry is the Pro-tier stand-in for Figma Code Connect (which is Enterprise-only):
 * a version-controlled 1:1 mapping from each React chrome component to its Figma node, with
 * a naming-parity contract enforced in CI. See figma/README.md.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export type Component = { name: string; source: string };

export type RegistryEntry = {
  name: string;
  source: string;
  figmaNodeId: string | null;
  figmaUrl: string | null;
};

export type Registry = { $schema?: string; components: RegistryEntry[] };

/** PascalCase with at least one lowercase letter — a React component, not a SCREAMING const. */
const COMPONENT_EXPORT =
  /^export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b/gm;

/** Recursively list .tsx files under a dir, excluding tests and stories. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) tsxFiles(p, acc);
    else if (
      ent.name.endsWith(".tsx") &&
      !ent.name.endsWith(".test.tsx") &&
      !ent.name.endsWith(".stories.tsx")
    ) {
      acc.push(p);
    }
  }
  return acc;
}

/**
 * Discover exported React components under `appDir`. Returns one entry per exported
 * component, keyed by name; `source` is POSIX-relative to `frontendRoot`.
 */
export function discoverComponents(appDir: string, frontendRoot: string): Component[] {
  const found = new Map<string, string>();
  for (const file of tsxFiles(appDir)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(frontendRoot, file).split("\\").join("/");
    let m: RegExpExecArray | null;
    COMPONENT_EXPORT.lastIndex = 0;
    while ((m = COMPONENT_EXPORT.exec(text))) {
      const name = m[1];
      if (!found.has(name)) found.set(name, rel);
    }
  }
  return [...found.entries()]
    .map(([name, source]) => ({ name, source }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Validate a registry against discovered components. Returns problem descriptions. */
export function validateRegistry(registry: Registry, discovered: Component[]): string[] {
  const problems: string[] = [];
  const discByName = new Map(discovered.map((c) => [c.name, c]));
  const regByName = new Map(registry.components.map((e) => [e.name, e]));

  for (const c of discovered) {
    if (!regByName.has(c.name)) {
      problems.push(`missing: component ${c.name} (${c.source}) is not in the registry`);
    }
  }
  for (const e of registry.components) {
    const disc = discByName.get(e.name);
    if (!disc) {
      problems.push(`stale: registry entry ${e.name} no longer exists in the code`);
      continue;
    }
    if (disc.source !== e.source) {
      problems.push(`source drift: ${e.name} is at ${disc.source}, registry says ${e.source}`);
    }
    // Naming parity: a populated Figma binding must use the component name verbatim.
    if (e.figmaUrl !== null && e.figmaNodeId === null) {
      problems.push(`${e.name}: figmaUrl set but figmaNodeId missing`);
    }
    if (e.figmaNodeId !== null && !/^\d+[:-]\d+$/.test(e.figmaNodeId)) {
      problems.push(`${e.name}: figmaNodeId "${e.figmaNodeId}" is not a valid node id`);
    }
  }
  return problems;
}

/** Build a fresh registry from discovered components, preserving existing Figma bindings. */
export function buildRegistry(discovered: Component[], existing?: Registry): Registry {
  const prev = new Map((existing?.components ?? []).map((e) => [e.name, e]));
  return {
    $schema: "./registry.schema.json",
    components: discovered.map((c) => ({
      name: c.name,
      source: c.source,
      figmaNodeId: prev.get(c.name)?.figmaNodeId ?? null,
      figmaUrl: prev.get(c.name)?.figmaUrl ?? null,
    })),
  };
}
