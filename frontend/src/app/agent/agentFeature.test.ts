// S44 — the cornerstone feature binding rules.
//
// The load-bearing assertion here is that the REQUIREMENT is read from the served
// `authoring_capability` and nothing else. The live drive found the composer starting
// document-authoring runs with no `feature_tag` at all, and the sibling refusing them
// with "requires a target feature tag" — a fact the served preset already carried.

import { describe, expect, it } from "vitest";

import type { TeamPreset } from "../../stores/server/agent/a2aTeam";
import {
  featureFromOpenDocument,
  featureStartBlocked,
  presetRequiresFeatureTag,
  resolveFeatureBinding,
} from "./agentFeature";

const preset = (capability?: string): TeamPreset => ({
  id: "preset",
  loadable: true,
  required_roles: [],
  is_mock: false,
  profiles: [],
  ...(capability === undefined ? {} : { authoring_capability: capability }),
});

const documents = [
  {
    stem: "2026-08-01-agent-panel-plan",
    title: "Agent panel plan",
    feature: "agent-panel",
  },
  { stem: "2026-07-31-orphan-research", title: "Orphan", feature: null },
];

describe("presetRequiresFeatureTag", () => {
  it("requires a feature for a served document-authoring lane", () => {
    expect(presetRequiresFeatureTag(preset("document_authoring"))).toBe(true);
  });

  it("does not require one for a coding lane", () => {
    // vaultspec-doc-editor and vaultspec-solo-coder are both served as `coding`;
    // gating them would block runs the sibling accepts.
    expect(presetRequiresFeatureTag(preset("coding"))).toBe(false);
  });

  it("fails OPEN when the capability is absent, leaving the sibling the enforcer", () => {
    expect(presetRequiresFeatureTag(preset())).toBe(false);
    expect(presetRequiresFeatureTag(null)).toBe(false);
  });
});

describe("featureFromOpenDocument", () => {
  it("reads the open document's feature", () => {
    expect(featureFromOpenDocument("doc:2026-08-01-agent-panel-plan", documents)).toBe(
      "agent-panel",
    );
  });

  it("is null for a document filed under no feature", () => {
    expect(featureFromOpenDocument("doc:2026-07-31-orphan-research", documents)).toBe(
      null,
    );
  });

  it("is null with no open document, and for a non-document tab", () => {
    expect(featureFromOpenDocument(null, documents)).toBe(null);
    // A `code:` node is not a vault document and carries no feature — deriving one
    // would bind the run to a feature nobody chose.
    expect(featureFromOpenDocument("code:src/main.tsx", documents)).toBe(null);
  });

  it("is null when the open document is not in the corpus yet", () => {
    expect(featureFromOpenDocument("doc:not-listed", documents)).toBe(null);
  });
});

describe("resolveFeatureBinding", () => {
  it("defaults from the open document and says so", () => {
    expect(
      resolveFeatureBinding({
        chosen: null,
        activeDocId: "doc:2026-08-01-agent-panel-plan",
        documents,
      }),
    ).toEqual({ tag: "agent-panel", source: "document" });
  });

  it("lets an explicit choice win over the open document", () => {
    expect(
      resolveFeatureBinding({
        chosen: "release-drive",
        activeDocId: "doc:2026-08-01-agent-panel-plan",
        documents,
      }),
    ).toEqual({ tag: "release-drive", source: "chosen" });
  });

  it("honours a choice outside the existing vocabulary", () => {
    // The vocabulary is derived from documents that already exist; a run may open a
    // feature that has none yet, so free entry must survive the resolve.
    expect(
      resolveFeatureBinding({ chosen: "brand-new", activeDocId: null, documents }),
    ).toEqual({ tag: "brand-new", source: "chosen" });
  });

  it("is unbound when nothing supplies a feature", () => {
    expect(
      resolveFeatureBinding({ chosen: null, activeDocId: null, documents }),
    ).toEqual({ tag: null, source: "none" });
  });
});

describe("featureStartBlocked", () => {
  it("blocks a document-authoring start with no feature bound", () => {
    expect(
      featureStartBlocked(preset("document_authoring"), { tag: null, source: "none" }),
    ).toBe(true);
  });

  it("releases the start once a feature is bound", () => {
    expect(
      featureStartBlocked(preset("document_authoring"), {
        tag: "agent-panel",
        source: "document",
      }),
    ).toBe(false);
  });

  it("never blocks a coding lane, bound or not", () => {
    expect(featureStartBlocked(preset("coding"), { tag: null, source: "none" })).toBe(
      false,
    );
  });
});
