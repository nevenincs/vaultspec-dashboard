// @vitest-environment happy-dom
//
// The typed hover-card content plane (node-hover-typed-card; Figma 110:2). Each
// document type renders the facts its register carries, sourced from the wire
// projection. These assertions render the real component (no doubles) and pin:
//   - each type renders its correct fields (and only those),
//   - the category-accent strip + header read the per-category scene token,
//   - the card reads its type from the model (data-category / data-type-content),
//   - theme parity: the category token is a per-theme :root var, so flipping
//     [data-theme] changes the resolved hue without changing the markup.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EngineNode } from "../../stores/server/engine";
import { statusCardModelFromNode } from "../../stores/view/statusCard";
import { StatusHoverCard } from "./HoverCard";

function n(partial: Partial<EngineNode> & Pick<EngineNode, "id" | "kind">): EngineNode {
  return { title: partial.id, ...partial };
}

afterEach(cleanup);

describe("HoverCard — typed content per document type", () => {
  it("plan: renders tier + step counts in the plan content block", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(
          n({
            id: "doc:plan",
            kind: "plan",
            title: "A plan",
            tier: "L2",
            status_value: "L2",
            status_class: "tiered",
            lifecycle: { state: "active", progress: { done: 3, total: 8 } },
          }),
        )}
      />,
    );
    const block = document.querySelector('[data-type-content="plan"]');
    expect(block).toBeTruthy();
    expect(block?.textContent).toContain("L2");
    expect(block?.textContent).toContain("3/8 steps");
  });

  it("adr: renders the reference-degree line (the references proxy)", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(
          n({
            id: "doc:adr",
            kind: "adr",
            title: "A decision",
            status_value: "accepted",
            status_class: "affirmed",
            degree_by_tier: { declared: 2, structural: 1 },
          }),
        )}
      />,
    );
    const block = document.querySelector('[data-type-content="adr"]');
    expect(block?.textContent).toContain("3 references");
    // The status chip still carries the decision state.
    expect(document.querySelector("[data-status-chip]")?.textContent).toContain(
      "accepted",
    );
  });

  it("research: renders the relative-date line, no fabricated findings", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(
          n({
            id: "doc:r",
            kind: "research",
            title: "R",
            dates: { created: "2000-01-01" },
          }),
        )}
      />,
    );
    const block = document.querySelector('[data-type-content="research"]');
    expect(block).toBeTruthy();
    expect(block?.textContent).toMatch(/ago|today|yesterday/);
    // The findings count is a recorded GAP — never rendered as a number word.
    expect(block?.textContent).not.toContain("finding");
  });

  it("audit: surfaces the graded severity (wire's nearest verdict)", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(
          n({
            id: "doc:au",
            kind: "audit",
            title: "An audit",
            status_value: "high",
            status_class: "graded",
          }),
        )}
      />,
    );
    expect(
      document.querySelector('[data-type-content="audit"]')?.textContent,
    ).toContain("high");
  });

  it("feature: renders a document-count line from member_count", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(
          n({ id: "feature:x", kind: "feature", title: "Feature", member_count: 5 }),
        )}
      />,
    );
    expect(
      document.querySelector('[data-type-content="feature"]')?.textContent,
    ).toContain("5 documents");
  });
});

describe("HoverCard — category accent + type identity", () => {
  it("stamps the resolved category on the card and reads the category token", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(n({ id: "doc:plan", kind: "plan", title: "P" }))}
      />,
    );
    const card = document.querySelector("[data-hover-card]");
    expect(card?.getAttribute("data-category")).toBe("plan");
    const strip = document.querySelector("[data-category-strip]") as HTMLElement | null;
    expect(strip?.style.backgroundColor).toContain("--color-scene-category-plan");
  });

  it("stamps reference on its own category (terminology-standardization ADR D3)", () => {
    render(
      <StatusHoverCard
        model={statusCardModelFromNode(
          n({ id: "doc:ref", kind: "reference", title: "Ref" }),
        )}
      />,
    );
    expect(
      document.querySelector("[data-hover-card]")?.getAttribute("data-category"),
    ).toBe("reference");
  });
});

describe("HoverCard — theme parity (per-theme :root token)", () => {
  it("the same markup resolves the category token under each [data-theme]", () => {
    // The card markup is theme-agnostic: it references the category token by NAME
    // (var(--color-scene-category-*)). The token is declared per theme on :root,
    // so changing the theme attribute changes the resolved hue with NO markup
    // change. We assert the var() reference is stable across the three themes.
    for (const theme of ["light", "dark", "high-contrast"]) {
      document.documentElement.setAttribute("data-theme", theme);
      const { unmount } = render(
        <StatusHoverCard
          model={statusCardModelFromNode(n({ id: "doc:a", kind: "adr", title: "A" }))}
        />,
      );
      const strip = document.querySelector(
        "[data-category-strip]",
      ) as HTMLElement | null;
      expect(strip?.style.backgroundColor).toContain("var(--color-scene-category-adr)");
      unmount();
    }
    document.documentElement.removeAttribute("data-theme");
  });
});
