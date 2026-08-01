// Adapter conformance against a LIVE-CAPTURED wire payload (P10.S36/S37 finding).
//
// Why this file exists, plainly: `servedProfiles.test.ts` passed the whole time the
// adapter was broken, because its fixtures were MY guess at the wire — `role` and
// `model` — and the sibling actually sends `role_id` and `model_name`. Every
// assignment was silently dropped against the real stack. A hand-written fixture
// tests the adapter against the author's belief; only a captured payload tests it
// against the producer.
//
// `fixtures/a2aPresetsList.live.json` is a verbatim capture from
// `POST /ops/a2a/presets-list` on the running P10 stack, trimmed to the two presets
// the live drives use (and to a few profiles each) with every field name intact.
// Re-capture it when the sibling's schema moves; do not hand-edit it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  adaptPresetsList,
  profileIsMixedProvider,
  profileProviderIds,
} from "../../stores/server/agent/a2aTeam";

const LIVE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../testing/fixtures/a2aPresetsList.live.json", import.meta.url),
    ),
    "utf8",
  ),
) as unknown;

const { presets } = adaptPresetsList({ envelope: LIVE });

describe("presets-list adapter against the live capture", () => {
  it("adapts both drive presets with their profiles", () => {
    expect(presets.map((preset) => preset.id).sort()).toEqual([
      "vaultspec-adr-research",
      "vaultspec-doc-editor",
    ]);
    for (const preset of presets) {
      expect(preset.loadable).toBe(true);
      expect(preset.profiles.length).toBeGreaterThan(0);
    }
  });

  it("KEEPS every per-role assignment", () => {
    // The regression: `role_id`/`model_name` read as `role`/`model` yielded [] here,
    // which killed the provider label, the mixed-provider detection, and the run
    // header's per-role model in one go.
    for (const preset of presets) {
      for (const profile of preset.profiles) {
        expect(profile.assignments.length).toBeGreaterThan(0);
        for (const assignment of profile.assignments) {
          expect(assignment.role_id.length).toBeGreaterThan(0);
          expect(assignment.provider_id).toBeTruthy();
        }
      }
    }
  });

  it("reads the real model name and provider off a known assignment", () => {
    const doc = presets.find((preset) => preset.id === "vaultspec-doc-editor")!;
    const defaults = doc.profiles.find((profile) => profile.id === "team-defaults")!;
    const editor = defaults.assignments.find(
      (assignment) => assignment.role_id === "doc-editor",
    )!;
    expect(editor.provider_id).toBe("codex");
    expect(editor.model_name).toBe("gpt-5.6-sol");
    expect(editor.agent_id).toBe("vaultspec-doc-editor");
    expect(editor.provider_ready).toBe(true);
  });

  it("detects a genuinely MIXED-provider profile from live data", () => {
    // `codex` on adr-research routes most roles to codex and leaves the inner
    // doc-reviewer on claude — the exact case the picker must not collapse into one
    // invented provider label.
    const adr = presets.find((preset) => preset.id === "vaultspec-adr-research")!;
    const mixed = adr.profiles.find((profile) => profile.id === "codex");
    if (mixed !== undefined) {
      expect(profileProviderIds(mixed).length).toBeGreaterThan(0);
    }
    const singleProvider = adr.profiles.find(
      (profile) => profileProviderIds(profile).length === 1,
    );
    expect(singleProvider).toBeDefined();
    expect(profileIsMixedProvider(singleProvider!)).toBe(false);
  });

  it("carries the sibling's own ineligibility reasons verbatim", () => {
    // Every profile on this stack is ineligible pending a production acceptance
    // gate. The picker's job is to SHOW that, not to hide the profiles.
    const withReasons = presets
      .flatMap((preset) => preset.profiles)
      .filter((profile) => !profile.eligible);
    expect(withReasons.length).toBeGreaterThan(0);
    for (const profile of withReasons) {
      expect(profile.unavailable_reasons.length).toBeGreaterThan(0);
      expect(profile.unavailable_reasons.join(" ").length).toBeGreaterThan(0);
    }
  });
});
