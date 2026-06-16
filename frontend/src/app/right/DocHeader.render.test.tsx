// @vitest-environment happy-dom
//
// DocHeader (figma-frontend-rewrite W02.P06.S09; binding DocHeader board 283:1170):
// the document reader's crowning header, composed entirely from the centralized
// kit (Breadcrumb, Chip, Badge, PropertyRow, IconButton) plus the binding serif
// Reader/Title role. These assertions exercise the composed structure — the serif
// title, the path trail, the doc-type chip + tier badge, the metadata rows, and
// the close intent — driven by props (no broken-run baselines).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocHeader } from "./DocHeader";

afterEach(() => cleanup());

describe("DocHeader (Figma board 283:1170)", () => {
  it("renders the document title in the binding serif Reader/Title role", () => {
    render(
      createElement(DocHeader, {
        title: "figma-frontend-rewrite plan",
      }),
    );
    const title = document.querySelector("[data-doc-title]");
    expect(title?.textContent).toBe("figma-frontend-rewrite plan");
    // The title binds the serif typeface role (Fraunces via font-serif).
    expect(title?.className).toMatch(/\bfont-serif\b/);
  });

  it("renders the path trail as a kit Breadcrumb with the last segment current", () => {
    const onSelect = vi.fn();
    render(
      createElement(DocHeader, {
        title: "the plan",
        trail: [
          { label: ".vault", onSelect },
          { label: "plan", onSelect },
          { label: "2026-06-16-figma-frontend-rewrite-plan.md" },
        ],
      }),
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeTruthy();
    // The final segment is the current location and is not a button.
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("2026-06-16-figma-frontend-rewrite-plan.md");
    // A preceding segment fires its navigation intent.
    fireEvent.click(screen.getByRole("button", { name: ".vault" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders the doc-type chip and the tier badge from the centralized kit", () => {
    render(
      createElement(DocHeader, {
        title: "the plan",
        category: "plan",
        categoryLabel: "Plan",
        tier: "L3",
      }),
    );
    // The chip resolves to the canonical category token (kit Chip).
    const chip = document.querySelector('[data-kit="chip"][data-category="plan"]');
    expect(chip?.textContent).toContain("Plan");
    // The tier reads as a neutral kit Badge.
    const badge = document.querySelector('[data-kit="badge"]');
    expect(badge?.textContent).toBe("L3");
  });

  it("renders the metadata block as kit PropertyRows", () => {
    render(
      createElement(DocHeader, {
        title: "the plan",
        meta: [
          { label: "created", value: "2026-06-16" },
          { label: "modified", value: "2026-06-17" },
        ],
      }),
    );
    const block = document.querySelector("[data-doc-meta]");
    expect(block?.textContent).toContain("created");
    expect(block?.textContent).toContain("2026-06-16");
    expect(block?.textContent).toContain("modified");
    expect(block?.textContent).toContain("2026-06-17");
  });

  it("fires the close intent through the kit IconButton", () => {
    const onClose = vi.fn();
    render(
      createElement(DocHeader, { title: "the plan", onClose }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close document" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits the close affordance and tag row when not supplied", () => {
    render(createElement(DocHeader, { title: "bare" }));
    expect(screen.queryByRole("button", { name: "Close document" })).toBeNull();
    expect(document.querySelector('[data-kit="chip"]')).toBeNull();
    expect(document.querySelector("[data-doc-meta]")).toBeNull();
  });
});
