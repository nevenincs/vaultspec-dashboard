// @vitest-environment happy-dom
//
// Hover-card render test (W03.P08.S50): the binding graph/HoverCard 84:2 as a DUMB
// projection. The card takes a typed model (the projection a stores selector
// supplies) and renders identity + the bounded evidence groups — it never fetches,
// never reads the raw tiers block. The assertions pin the identity header, the
// grouped evidence lines, the resolution-state tint on a code line, the "+N more"
// overflow tail, and the identity-tail monospace id.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HoverCard, type HoverCardModel } from "./HoverCard";
import { deriveEvidenceGroups } from "./hoverCardEvidence";
import type { NodeEvidence } from "../../../stores/server/engine";

afterEach(cleanup);

const tiers = {} as NodeEvidence["tiers"];

const model = (over: Partial<HoverCardModel> = {}): HoverCardModel => ({
  id: "doc:2026-foo-adr",
  kind: "adr",
  title: "Foo decision",
  category: "adr",
  evidence: deriveEvidenceGroups({
    documents: [{ path: ".vault/research/2026-foo-research.md", doc_type: "research" }],
    code_locations: [
      { path: "src/lib.rs", symbol: "build", line: 42, state: "resolved" },
      { path: "src/gone.rs", state: "broken" },
    ],
    commits: [{ sha: "abcdef1234", subject: "land the thing" }],
    tiers,
  }),
  ...over,
});

describe("HoverCard (binding graph/HoverCard 84:2)", () => {
  it("renders the identity header (title + monospace id)", () => {
    render(<HoverCard model={model()} />);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
      "adr Foo decision",
    );
    expect(screen.getByText("Foo decision")).toBeTruthy();
    expect(screen.getByText("doc:2026-foo-adr")).toBeTruthy();
  });

  it("renders the three evidence groups with their lines", () => {
    render(<HoverCard model={model()} />);
    expect(screen.getByText("documents")).toBeTruthy();
    expect(screen.getByText("code")).toBeTruthy();
    expect(screen.getByText("commits")).toBeTruthy();
    expect(screen.getByText("2026-foo-research.md")).toBeTruthy();
    expect(screen.getByText("lib.rs#build")).toBeTruthy();
    expect(screen.getByText("abcdef1")).toBeTruthy();
  });

  it("tints a code line by its resolution state", () => {
    render(<HoverCard model={model()} />);
    expect(screen.getByText("(resolved)").className).toContain("text-state-active");
    expect(screen.getByText("(broken)").className).toContain("text-state-broken");
  });

  it("surfaces the '+N more' overflow tail when a group exceeds the cap", () => {
    const docs = Array.from({ length: 9 }, (_, i) => ({
      path: `.vault/research/r${i}.md`,
      doc_type: "research",
    }));
    render(
      <HoverCard
        model={model({
          evidence: deriveEvidenceGroups({
            documents: docs,
            code_locations: [],
            commits: [],
            tiers,
          }),
        })}
      />,
    );
    expect(screen.getByText("+5 more")).toBeTruthy();
  });

  it("renders identity only when the node carries no evidence (no empty groups)", () => {
    render(<HoverCard model={model({ evidence: [] })} />);
    expect(screen.queryByText("documents")).toBeNull();
    expect(screen.getByText("Foo decision")).toBeTruthy();
  });
});
