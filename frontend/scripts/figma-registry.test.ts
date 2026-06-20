import { describe, expect, it } from "vitest";

import {
  BINDING_FIGMA_FILE_KEY,
  type BindingKind,
  buildRegistry,
  validateRegistry,
  type Component,
  type Registry,
} from "./figma-registry-lib";

const discovered: Component[] = [
  { name: "AppShell", source: "src/app/AppShell.tsx" },
  { name: "LeftRail", source: "src/app/left/LeftRail.tsx" },
];

function entry(
  component: Component,
  overrides: Partial<Registry["components"][number]> = {},
): Registry["components"][number] {
  return {
    ...component,
    designSurface: true,
    figmaNodeId: null,
    figmaUrl: null,
    figmaNodeName: null,
    bindingKind: null,
    ...overrides,
  };
}

describe("figma registry", () => {
  it("builds a registry with null Figma bindings, preserving existing ones", () => {
    const existing: Registry = {
      components: [
        entry(discovered[0], {
          figmaNodeId: "12:34",
          figmaUrl: `https://www.figma.com/design/${BINDING_FIGMA_FILE_KEY}?node-id=12-34`,
          figmaNodeName: "ShellFrame",
          bindingKind: "needs-review",
        }),
      ],
    };
    const reg = buildRegistry(discovered, existing);
    expect(reg.components.map((c) => c.name)).toEqual(["AppShell", "LeftRail"]);
    expect(reg.components[0].figmaNodeId).toBe("12:34"); // preserved
    expect(reg.components[0].figmaNodeName).toBe("ShellFrame"); // preserved
    expect(reg.components[0].bindingKind).toBe<BindingKind>("needs-review"); // preserved
    expect(reg.components[1].figmaNodeId).toBeNull(); // new, unbound
    expect(reg.components[1].figmaNodeName).toBeNull(); // new, unaliased
    expect(reg.components[1].bindingKind).toBeNull(); // new, unclassified until bound
  });

  it("passes a complete, drift-free registry", () => {
    const reg = buildRegistry(discovered);
    expect(validateRegistry(reg, discovered)).toEqual([]);
  });

  it("flags a missing component", () => {
    const reg: Registry = { components: [entry(discovered[0])] };
    const problems = validateRegistry(reg, discovered);
    expect(problems.join("\n")).toContain("missing: component LeftRail");
  });

  it("flags a stale entry, source drift, a bad node id, and retired Figma URLs", () => {
    const reg: Registry = {
      components: [
        entry(
          { name: "AppShell", source: "src/app/Wrong.tsx" },
          {
            figmaNodeId: "not-an-id",
            figmaUrl:
              "https://www.figma.com/design/8WDmXNOURdRQwdefWNGsBb?node-id=12-34",
            bindingKind: "surface",
          },
        ),
        entry({ name: "Gone", source: "src/app/Gone.tsx" }),
        entry(discovered[1]),
      ],
    };
    const out = validateRegistry(reg, discovered).join("\n");
    expect(out).toContain("stale: registry entry Gone");
    expect(out).toContain("source drift: AppShell");
    expect(out).toContain('figmaNodeId "not-an-id"');
    expect(out).toContain(`live Figma file ${BINDING_FIGMA_FILE_KEY}`);
  });

  it("requires bound components to classify alias metadata", () => {
    const reg: Registry = {
      components: [
        entry(discovered[0], {
          figmaNodeId: "12:34",
          figmaUrl: `https://www.figma.com/design/${BINDING_FIGMA_FILE_KEY}?node-id=12-34`,
          figmaNodeName: " ",
        }),
        entry(discovered[1], {
          figmaNodeName: "LeftRail",
        }),
      ],
    };
    const out = validateRegistry(reg, discovered).join("\n");
    expect(out).toContain("AppShell: figmaNodeName must not be empty");
    expect(out).toContain("AppShell: bound Figma nodes must declare bindingKind");
    expect(out).toContain("LeftRail: figmaNodeName set but figmaNodeId missing");
  });
});
