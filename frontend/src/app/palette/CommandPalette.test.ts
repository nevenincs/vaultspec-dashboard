import { describe, expect, it } from "vitest";

import type { PaletteSources } from "./CommandPalette";
import { buildCommands, filterCommands, groupByFamily } from "./CommandPalette";

function sources(over: Partial<PaletteSources> = {}): PaletteSources {
  return {
    featureTags: ["auth-flow", "sync-service"],
    lensNames: ["broken links"],
    query: "",
    applyLens: () => undefined,
    saveLens: () => undefined,
    runOp: () => undefined,
    navigate: () => undefined,
    ...over,
  };
}

describe("buildCommands (G2.a / G5.c)", () => {
  it("fronts navigation, lenses, and the whitelisted ops verbs", () => {
    const commands = buildCommands(sources());
    const ids = commands.map((c) => c.id);
    expect(ids).toContain("nav:auth-flow");
    expect(ids).toContain("lens:broken links");
    expect(ids).toContain("ops:core:vault-check");
    expect(ids).toContain("ops:rag:reindex");
    // Ops verbs require confirmation; navigation does not.
    expect(commands.find((c) => c.id === "ops:rag:reindex")?.confirm).toBe(true);
    expect(commands.find((c) => c.id === "nav:auth-flow")?.confirm).toBeUndefined();
  });

  it("tags each command with its family (object-then-action taxonomy)", () => {
    const commands = buildCommands(sources());
    expect(commands.find((c) => c.id === "nav:auth-flow")?.family).toBe("navigate");
    expect(commands.find((c) => c.id === "lens:broken links")?.family).toBe("filters");
    expect(commands.find((c) => c.id === "ops:core:vault-check")?.family).toBe("core");
    expect(commands.find((c) => c.id === "ops:rag:reindex")?.family).toBe("rag");
  });

  it("offers save-lens only when a name is typed", () => {
    expect(buildCommands(sources()).some((c) => c.id.startsWith("save-lens:"))).toBe(
      false,
    );
    const withQuery = buildCommands(sources({ query: "my sprint" }));
    expect(withQuery.some((c) => c.id === "save-lens:my sprint")).toBe(true);
  });

  it("runs the wired actions", () => {
    const navigated: string[] = [];
    const commands = buildCommands(sources({ navigate: (id) => navigated.push(id) }));
    commands.find((c) => c.id === "nav:sync-service")!.run();
    expect(navigated).toEqual(["feature:sync-service"]);
  });
});

describe("filterCommands", () => {
  it("matches case-insensitively on the label and passes empty through", () => {
    const commands = buildCommands(sources());
    expect(filterCommands(commands, "BROKEN")).toHaveLength(1);
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
    expect(filterCommands(commands, "zzz")).toHaveLength(0);
  });

  it("is forgiving of word order and partial tokens", () => {
    const commands = buildCommands(sources());
    // "auth go" matches "go to auth-flow" regardless of token order.
    const hits = filterCommands(commands, "auth go");
    expect(hits.map((c) => c.id)).toContain("nav:auth-flow");
    // A partial fragment still matches.
    expect(filterCommands(commands, "sync").map((c) => c.id)).toContain(
      "nav:sync-service",
    );
  });
});

describe("groupByFamily", () => {
  it("groups in canonical family order and drops empty families", () => {
    const commands = buildCommands(sources());
    const groups = groupByFamily(commands);
    expect(groups.map((g) => g.family)).toEqual(["navigate", "filters", "core", "rag"]);
    // Every command lands in exactly one group.
    const grouped = groups.flatMap((g) => g.commands);
    expect(grouped).toHaveLength(commands.length);
  });

  it("omits a family with no commands", () => {
    const navOnly = buildCommands(
      sources({ lensNames: [], featureTags: ["only-feature"] }),
    ).filter((c) => c.family === "navigate");
    const groups = groupByFamily(navOnly);
    expect(groups.map((g) => g.family)).toEqual(["navigate"]);
  });
});
