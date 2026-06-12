import { describe, expect, it } from "vitest";

import type { PaletteSources } from "./CommandPalette";
import { buildCommands, filterCommands } from "./CommandPalette";

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
});
