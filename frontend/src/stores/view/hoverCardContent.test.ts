// Pure derivation of the typed hover-card content (node-hover-typed-card). These
// assertions pin the per-type field-sourcing contract against the wire shape —
// each type's content is derived from the EngineNode projection (and, for plans,
// the bounded plan-interior), never fabricated. The recorded data gaps (adr
// supersedes-count, exec parent-plan title, research/audit findings counts,
// per-node git-dirty) are asserted as graceful absence, NOT invented values.

import { describe, expect, it } from "vitest";

import type { EngineNode, PlanInterior } from "../server/engine";
import {
  deriveTypeContent,
  languageFromPath,
  phasesLeftFromInterior,
  relativeDate,
} from "./hoverCardContent";

function node(
  partial: Partial<EngineNode> & Pick<EngineNode, "id" | "kind">,
): EngineNode {
  return { title: partial.id, ...partial };
}

describe("deriveTypeContent — per-type field sourcing", () => {
  it("plan: status pill from lifecycle.state, tier, and step counts", () => {
    const content = deriveTypeContent(
      node({
        id: "doc:p",
        kind: "plan",
        tier: "L2",
        lifecycle: { state: "active", progress: { done: 7, total: 12 } },
      }),
    );
    expect(content.kind).toBe("plan");
    if (content.kind !== "plan") return;
    expect(content.status).toBe("In progress");
    expect(content.tier).toBe("L2");
    expect(content.steps).toEqual({ done: 7, total: 12 });
    // No interior supplied → phasesLeft is a recorded gap, gracefully absent.
    expect(content.phasesLeft).toBeUndefined();
  });

  it("plan: phasesLeft derived from a supplied plan-interior (open phases)", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:p",
      waves: [],
      phases: [
        {
          node_id: "n1",
          id: "P01",
          steps: [{ node_id: "s1", id: "S01", done: true }],
        },
        {
          node_id: "n2",
          id: "P02",
          steps: [{ node_id: "s2", id: "S02", done: false }],
        },
      ],
      steps: [],
      truncated: null,
    };
    const content = deriveTypeContent(
      node({ id: "doc:p", kind: "plan", lifecycle: { state: "active" } }),
      { interior },
    );
    if (content.kind !== "plan") throw new Error("expected plan content");
    // One phase (P02) has an open step; P01 is fully done.
    expect(content.phasesLeft).toBe(1);
  });

  it("adr: status from status_value, references from the total degree", () => {
    const content = deriveTypeContent(
      node({
        id: "doc:a",
        kind: "adr",
        status_value: "accepted",
        status_class: "affirmed",
        degree_by_tier: { declared: 2, structural: 1, temporal: 1 },
      }),
    );
    if (content.kind !== "adr") throw new Error("expected adr content");
    expect(content.status).toBe("accepted");
    // The distinct "supersedes N" is a recorded GAP (not on the node wire); the
    // references proxy is the summed incident degree.
    expect(content.references).toBe(4);
  });

  it("exec: no per-type status on the wire, no parent-plan title (recorded gaps)", () => {
    const content = deriveTypeContent(node({ id: "doc:e", kind: "exec" }));
    if (content.kind !== "exec") throw new Error("expected exec content");
    expect(content.status).toBeUndefined();
    expect(content.inPlan).toBeUndefined();
  });

  it("research: relative date from created; findings count is a recorded gap", () => {
    const now = Date.parse("2026-06-16T00:00:00Z");
    const content = deriveTypeContent(
      node({
        id: "doc:r",
        kind: "research",
        dates: { created: "2026-06-13T00:00:00Z" },
      }),
      { now },
    );
    if (content.kind !== "research") throw new Error("expected research content");
    expect(content.when).toBe("3 days ago");
    expect(content.findings).toBeUndefined();
  });

  it("audit: severity surfaced as the wire's nearest verdict; findings a gap", () => {
    const content = deriveTypeContent(
      node({
        id: "doc:au",
        kind: "audit",
        status_value: "high",
        status_class: "graded",
      }),
    );
    if (content.kind !== "audit") throw new Error("expected audit content");
    expect(content.severity).toBe("high");
    expect(content.findings).toBeUndefined();
  });

  it("feature/index map onto the topic shape with member_count documents", () => {
    const feat = deriveTypeContent(
      node({ id: "feature:x", kind: "feature", member_count: 9 }),
    );
    if (feat.kind !== "topic") throw new Error("expected topic content");
    expect(feat.documents).toBe(9);

    const idx = deriveTypeContent(
      node({ id: "doc:i", kind: "index", member_count: 4 }),
    );
    if (idx.kind !== "topic") throw new Error("expected topic content");
    expect(idx.documents).toBe(4);
  });

  it("code: path from the code: id, language from the extension, git-dirty optional", () => {
    const content = deriveTypeContent(
      node({ id: "code:src/app/HoverCard.tsx", kind: "code" }),
      { gitDirty: true },
    );
    if (content.kind !== "code") throw new Error("expected code content");
    expect(content.path).toBe("src/app/HoverCard.tsx");
    expect(content.language).toBe("TypeScript");
    expect(content.gitDirty).toBe(true);
  });

  it("an unmapped doc-type renders generic content (no fabricated fields)", () => {
    const content = deriveTypeContent(node({ id: "doc:rule", kind: "rule" }));
    expect(content.kind).toBe("generic");
  });
});

describe("phasesLeftFromInterior", () => {
  it("spans waves[].phases for the L3/L4 shape", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:p",
      waves: [
        {
          node_id: "w1",
          id: "W01",
          phases: [
            {
              node_id: "p1",
              id: "P01",
              steps: [{ node_id: "s", id: "S01", done: false }],
            },
          ],
        },
      ],
      phases: [],
      steps: [],
      truncated: null,
    };
    expect(phasesLeftFromInterior(interior)).toBe(1);
  });

  it("returns undefined when there are no phases (L1 flat-steps plan)", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:p",
      waves: [],
      phases: [],
      steps: [{ node_id: "s", id: "S01", done: false }],
      truncated: null,
    };
    expect(phasesLeftFromInterior(interior)).toBeUndefined();
  });
});

describe("languageFromPath / relativeDate helpers", () => {
  it("maps known extensions, undefined for unknown", () => {
    expect(languageFromPath("a/b/c.rs")).toBe("Rust");
    expect(languageFromPath("a/b/c.py")).toBe("Python");
    expect(languageFromPath("a/b/c")).toBeUndefined();
    expect(languageFromPath("a/b/c.xyz")).toBeUndefined();
  });

  it("formats coarse relative dates deterministically against a clock", () => {
    const now = Date.parse("2026-06-16T12:00:00Z");
    expect(relativeDate("2026-06-16T06:00:00Z", now)).toBe("today");
    expect(relativeDate("2026-06-15T06:00:00Z", now)).toBe("yesterday");
    expect(relativeDate("2026-06-01T12:00:00Z", now)).toBe("15 days ago");
    expect(relativeDate("2026-03-16T12:00:00Z", now)).toBe("3 months ago");
    expect(relativeDate(undefined, now)).toBeUndefined();
  });
});
