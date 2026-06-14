import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  docMarkName,
  entryStem,
  freshnessLabel,
  groupEntries,
  isFresh,
} from "./VaultBrowser";

const entry = (path: string, docType: string, modified?: string): VaultTreeEntry => ({
  path,
  doc_type: docType,
  feature_tags: ["demo"],
  dates: { modified },
});

describe("groupEntries (G2.c)", () => {
  it("groups by .vault subtree in canonical order, sorted within", () => {
    const groups = groupEntries([
      entry(".vault/plan/b-plan.md", "plan"),
      entry(".vault/research/a-research.md", "research"),
      entry(".vault/plan/a-plan.md", "plan"),
    ]);
    expect([...groups.keys()]).toEqual(["research", "plan"]);
    expect(groups.get("plan")!.map((e) => e.path)).toEqual([
      ".vault/plan/a-plan.md",
      ".vault/plan/b-plan.md",
    ]);
  });

  it("appends unknown groups instead of dropping them", () => {
    const groups = groupEntries([entry(".vault/notes/x.md", "notes")]);
    expect([...groups.keys()]).toEqual(["notes"]);
  });
});

describe("entry presentation", () => {
  it("gives every canonical doc type a distinct Phosphor mark with a fallback", () => {
    // Grayscale-by-shape gate (iconography ADR): each doc type maps to a
    // shape-distinct Phosphor mark; the squint test is shape, so the marks
    // must not collide. Unknown types fall back to the dashed-file mark.
    const types = ["research", "adr", "plan", "exec", "audit", "reference", "index"];
    const marks = types.map(docMarkName);
    expect(new Set(marks).size).toBe(marks.length);
    // An unknown doc type resolves to the dashed-file fallback mark, which is
    // genuinely distinct from every assigned mark (not an alias of one of them).
    const fallback = docMarkName("mystery");
    expect(fallback).toMatch(/FileDashed/);
    expect(marks).not.toContain(fallback);
  });

  it("labels freshness in compact buckets and cools to silence", () => {
    const now = Date.parse("2026-06-12T12:00:00Z");
    expect(freshnessLabel("2026-06-12T11:30:00Z", now)).toBe("now");
    expect(freshnessLabel("2026-06-12T03:00:00Z", now)).toBe("9h");
    expect(freshnessLabel("2026-06-09T12:00:00Z", now)).toBe("3d");
    expect(freshnessLabel("2026-05-30T12:00:00Z", now)).toBe("1w");
    expect(freshnessLabel("2026-01-01T00:00:00Z", now)).toBe("");
    expect(freshnessLabel(undefined, now)).toBe("");
  });

  it("tints only genuinely-fresh items (the <1h 'now' bucket) with the accent", () => {
    // The accent freshness cue is a purposeful liveness signal tied to real
    // recency, not ambient decoration — only "now" is accent-tinted.
    expect(isFresh("now")).toBe(true);
    expect(isFresh("9h")).toBe(false);
    expect(isFresh("3d")).toBe(false);
    expect(isFresh("")).toBe(false);
  });

  it("derives the display stem from the path", () => {
    expect(entryStem(".vault/adr/2026-06-12-x-adr.md")).toBe("2026-06-12-x-adr");
  });
});
