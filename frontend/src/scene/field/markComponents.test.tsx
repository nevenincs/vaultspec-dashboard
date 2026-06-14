// @vitest-environment happy-dom
//
// The React chrome plane for the domain-mark family (S37): the SAME mark source
// the texture seam consumes, rendered as DOM SVG. These tests prove the chrome
// and the canvas share one silhouette source and that the chrome inherits hue
// through currentColor (never hard-coding a color), so a mark is theme-correct
// for free.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DocTypeMark, MarkById, StateMark, TierMark } from "./markComponents";
import { DOC_TYPE_MARK_DEFS, STATE_MARK_DEFS, TIER_MARK_DEFS } from "./marks";

afterEach(cleanup);

/**
 * The first path `d` (or a stable geometry token) from a mark body. Comparing
 * this against the rendered SVG proves the chrome draws the SAME source as the
 * texture seam, without depending on DOM serialization quirks (the serializer
 * rewrites `<path/>` to `<path></path>`, so exact innerHTML equality is brittle).
 */
function firstGeometry(body: string): string {
  const d = /d="([^"]+)"/.exec(body);
  if (d) return d[1];
  const r = /r="([^"]+)"/.exec(body);
  if (r) return `r="${r[1]}"`;
  throw new Error("no geometry token in body");
}

describe("DocTypeMark", () => {
  it("renders the SAME mark body the texture seam consumes (shared source)", () => {
    const { container } = render(<DocTypeMark kind="adr" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // The rendered SVG carries the doc-type def's own geometry — one source.
    expect(svg!.innerHTML).toContain(firstGeometry(DOC_TYPE_MARK_DEFS.adr.body));
  });

  it("inherits hue through currentColor, hard-coding no color", () => {
    const { container } = render(<DocTypeMark kind="plan" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("fill")).toBe("currentColor");
    // The raw currentColor source survives to the DOM (real cascade resolves
    // it) — no white-ink substitution on the chrome plane.
    expect(svg.innerHTML).toContain("currentColor");
  });

  it("renders nothing for an unknown kind rather than throwing", () => {
    const { container } = render(<DocTypeMark kind="not-a-kind" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("TierMark and StateMark", () => {
  it("render the authored tier mark bodies", () => {
    const { container } = render(<TierMark tier="declared" />);
    expect(container.querySelector("svg")!.innerHTML).toContain(
      firstGeometry(TIER_MARK_DEFS.declared.body),
    );
  });

  it("render the authored state mark bodies", () => {
    const { container } = render(<StateMark state="broken" />);
    expect(container.querySelector("svg")!.innerHTML).toContain(
      firstGeometry(STATE_MARK_DEFS.broken.body),
    );
  });
});

describe("MarkById and accessibility", () => {
  it("resolves any mark by its stable id", () => {
    const { container } = render(<MarkById id="tier:semantic" />);
    expect(container.querySelector("svg")!.innerHTML).toContain(
      firstGeometry(TIER_MARK_DEFS.semantic.body),
    );
  });

  it("is decorative (aria-hidden) without a title, labeled with one", () => {
    const { container: bare } = render(<DocTypeMark kind="exec" />);
    expect(bare.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");

    const { container: labeled } = render(
      <DocTypeMark kind="exec" title="execution record" />,
    );
    const svg = labeled.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("execution record");
  });

  it("honors the size prop on both width and height", () => {
    const { container } = render(<DocTypeMark kind="research" size={24} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
  });
});
