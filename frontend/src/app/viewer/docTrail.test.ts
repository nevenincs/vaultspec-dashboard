import { describe, expect, it } from "vitest";

import type { MarkdownHeaderView } from "../../stores/server/queries";
import { buildDocTrail } from "./docTrail";

function header(categoryLabel?: string): MarkdownHeaderView {
  return { title: "campaign audit", categoryLabel, featureTags: [] };
}

describe("buildDocTrail", () => {
  it("uses the caller's canonical localized type label", () => {
    expect(
      buildDocTrail(header("adr"), { rootLabel: "Vault", typeLabel: "Decisions" }),
    ).toEqual([
      { label: "Vault" },
      { label: "Decisions" },
      { label: "campaign audit" },
    ]);
  });

  it("omits an unknown document type instead of manufacturing a label", () => {
    expect(buildDocTrail(header("index"), { includeRoot: false })).toEqual([
      { label: "campaign audit" },
    ]);
  });
});
