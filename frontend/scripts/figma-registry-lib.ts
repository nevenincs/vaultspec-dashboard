/**
 * Code↔Figma mapping-registry library (plan W01.P08). Pure discovery + validation helpers,
 * dependency-free so both the generator, the validator, and tests can import them.
 *
 * The registry is the live-file map that lets local checks and Code Connect agree on the
 * same binding nodes. Every populated URL must point at the binding Figma file, with
 * explicit aliases declaring the Figma node name when the code component intentionally
 * binds to a differently named live primitive. See figma/README.md.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const BINDING_FIGMA_FILE_KEY = "SlhonORmySdoSMTQgDWw3w";

export type Component = { name: string; source: string };

export type BindingKind =
  | "surface"
  | "primitive"
  | "composite-state"
  | "needs-review"
  | null;

export type RegistryEntry = {
  name: string;
  source: string;
  /**
   * Whether this export is a visual DESIGN SURFACE that should have a Figma node.
   * False for non-visual exports the discovery scan picks up but which have nothing to
   * draw (PixiJS scene-layer wrappers, keyboard/behaviour handlers, or the AppShell
   * composition itself). Only design surfaces are expected to bind to Figma.
   */
  designSurface: boolean;
  figmaNodeId: string | null;
  figmaUrl: string | null;
  /**
   * The live Figma node name when it intentionally differs from `name`.
   * Null means the bound Figma node is expected to use the local component name.
   */
  figmaNodeName: string | null;
  /**
   * The binding's semantic classification. Bound entries must be classified so alias
   * bindings stay reviewable instead of hiding behind raw node ids.
   */
  bindingKind: BindingKind;
};

export type Registry = { $schema?: string; components: RegistryEntry[] };

/** PascalCase with at least one lowercase letter — a React component, not a SCREAMING const. */
const COMPONENT_EXPORT =
  /^export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b/gm;

/** Recursively list .tsx files under a dir, excluding tests. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) tsxFiles(p, acc);
    else if (ent.name.endsWith(".tsx") && !ent.name.endsWith(".test.tsx")) {
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
export function validateRegistry(
  registry: Registry,
  discovered: Component[],
): string[] {
  const problems: string[] = [];
  const discByName = new Map(discovered.map((c) => [c.name, c]));
  const regByName = new Map(registry.components.map((e) => [e.name, e]));

  for (const c of discovered) {
    if (!regByName.has(c.name)) {
      problems.push(
        `missing: component ${c.name} (${c.source}) is not in the registry`,
      );
    }
  }
  for (const e of registry.components) {
    const figmaNodeName = e.figmaNodeName ?? null;
    const bindingKind = e.bindingKind ?? null;
    const disc = discByName.get(e.name);
    if (!disc) {
      problems.push(`stale: registry entry ${e.name} no longer exists in the code`);
      continue;
    }
    if (disc.source !== e.source) {
      problems.push(
        `source drift: ${e.name} is at ${disc.source}, registry says ${e.source}`,
      );
    }
    if (e.figmaUrl !== null && e.figmaNodeId === null) {
      problems.push(`${e.name}: figmaUrl set but figmaNodeId missing`);
    }
    if (e.figmaNodeId !== null && e.figmaUrl === null) {
      problems.push(`${e.name}: figmaNodeId set but figmaUrl missing`);
    }
    if (
      e.figmaUrl !== null &&
      !e.figmaUrl.includes(`/design/${BINDING_FIGMA_FILE_KEY}`)
    ) {
      problems.push(
        `${e.name}: figmaUrl must point at live Figma file ${BINDING_FIGMA_FILE_KEY}`,
      );
    }
    if (e.figmaNodeId !== null && !/^\d+[:-]\d+$/.test(e.figmaNodeId)) {
      problems.push(`${e.name}: figmaNodeId "${e.figmaNodeId}" is not a valid node id`);
    }
    if (figmaNodeName !== null && e.figmaNodeId === null) {
      problems.push(`${e.name}: figmaNodeName set but figmaNodeId missing`);
    }
    if (figmaNodeName !== null && figmaNodeName.trim() === "") {
      problems.push(`${e.name}: figmaNodeName must not be empty`);
    }
    if (e.figmaNodeId !== null && bindingKind === null) {
      problems.push(`${e.name}: bound Figma nodes must declare bindingKind`);
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
      designSurface: prev.get(c.name)?.designSurface ?? true,
      figmaNodeId: prev.get(c.name)?.figmaNodeId ?? null,
      figmaUrl: prev.get(c.name)?.figmaUrl ?? null,
      figmaNodeName: prev.get(c.name)?.figmaNodeName ?? null,
      bindingKind: prev.get(c.name)?.bindingKind ?? null,
    })),
  };
}
