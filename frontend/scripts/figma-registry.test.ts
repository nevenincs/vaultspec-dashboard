import { describe, expect, it } from "vitest";

import {
  buildRegistry,
  validateRegistry,
  type Component,
  type Registry,
} from "./figma-registry-lib";

const discovered: Component[] = [
  { name: "AppShell", source: "src/app/AppShell.tsx" },
  { name: "LeftRail", source: "src/app/left/LeftRail.tsx" },
];

describe("figma registry", () => {
  it("builds a registry with null Figma bindings, preserving existing ones", () => {
    const existing: Registry = {
      components: [
        {
          name: "AppShell",
          source: "src/app/AppShell.tsx",
          designSurface: true,
          figmaNodeId: "12:34",
          figmaUrl: "u",
        },
      ],
    };
    const reg = buildRegistry(discovered, existing);
    expect(reg.components.map((c) => c.name)).toEqual(["AppShell", "LeftRail"]);
    expect(reg.components[0].figmaNodeId).toBe("12:34"); // preserved
    expect(reg.components[1].figmaNodeId).toBeNull(); // new, unbound
  });

  it("passes a complete, drift-free registry", () => {
    const reg = buildRegistry(discovered);
    expect(validateRegistry(reg, discovered)).toEqual([]);
  });

  it("flags a missing component", () => {
    const reg: Registry = { components: [discovered[0]].map((c) => ({ ...c, designSurface: true, figmaNodeId: null, figmaUrl: null })) };
    const problems = validateRegistry(reg, discovered);
    expect(problems.join("\n")).toContain("missing: component LeftRail");
  });

  it("flags a stale entry, source drift, and a bad node id", () => {
    const reg: Registry = {
      components: [
        { name: "AppShell", source: "src/app/Wrong.tsx", figmaNodeId: "not-an-id", figmaUrl: null },
        { name: "Gone", source: "src/app/Gone.tsx", figmaNodeId: null, figmaUrl: null },
        { name: "LeftRail", source: "src/app/left/LeftRail.tsx", figmaNodeId: null, figmaUrl: null },
      ],
    };
    const out = validateRegistry(reg, discovered).join("\n");
    expect(out).toContain("stale: registry entry Gone");
    expect(out).toContain("source drift: AppShell");
    expect(out).toContain('figmaNodeId "not-an-id"');
  });
});
