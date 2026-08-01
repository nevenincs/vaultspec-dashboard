// `@`-evidence merge rules (agent-panel-shell-integration D3; plan P06.S21). Pure.
// The scoping guarantee itself is structural — the picker passes the SERVED active
// scope to providers that are idle without one — so what is pinned here is the part
// that could silently go wrong: which hits become evidence, what a chip carries,
// and that the merge can never hand back more than the cap or a duplicate.

import { describe, expect, it } from "vitest";

import {
  toProviderEntry,
  type SearchProviderEntry,
} from "../../stores/server/searchProviders";
import type { AgentMention } from "../../stores/view/agentComposer";
import {
  AGENT_EVIDENCE_RESULTS_CAP,
  evidenceBasename,
  evidenceDirname,
  evidenceMention,
  evidenceOptions,
  evidencePathFromNodeId,
} from "./composerEvidence";

/** Build a provider entry exactly as a provider does — through the shared wrapper,
 *  so the species is derived from the node id rather than asserted here. */
function entry(nodeId: string): SearchProviderEntry {
  return toProviderEntry(
    { score: 1, source: "codebase", node_id: nodeId },
    "strong-literal",
  );
}

describe("evidencePathFromNodeId", () => {
  it("reads a rel path out of the two node identities that carry one", () => {
    expect(evidencePathFromNodeId("code:src/app/stage/DockWorkspace.tsx")).toBe(
      "src/app/stage/DockWorkspace.tsx",
    );
    expect(evidencePathFromNodeId("doc:2026-08-01-agent-panel-plan")).toBe(
      "2026-08-01-agent-panel-plan",
    );
  });

  it("rejects an identity that is not evidence, and an empty tail", () => {
    // A feature node is not a file the agent can read; an empty tail is a malformed
    // id. Either would produce a chip pointing at nothing.
    expect(evidencePathFromNodeId("feature:agent-panel")).toBeNull();
    expect(evidencePathFromNodeId("code:")).toBeNull();
    expect(evidencePathFromNodeId("doc:")).toBeNull();
    expect(evidencePathFromNodeId("")).toBeNull();
  });
});

describe("path presentation", () => {
  it("splits a rel path into a basename and its dimmed parent", () => {
    expect(evidenceBasename("src/app/agent/Composer.tsx")).toBe("Composer.tsx");
    expect(evidenceDirname("src/app/agent/Composer.tsx")).toBe("src/app/agent");
    expect(evidenceBasename("README.md")).toBe("README.md");
    expect(evidenceDirname("README.md")).toBe("");
  });
});

describe("evidenceOptions", () => {
  it("keeps provider order and drops non-evidence identities", () => {
    const options = evidenceOptions(
      [[entry("doc:plan-a")], [entry("feature:x"), entry("code:src/a.ts")]],
      [],
    );
    expect(options.map((option) => option.value)).toEqual(["plan-a", "src/a.ts"]);
    expect(options[1]).toEqual({
      value: "src/a.ts",
      primary: "a.ts",
      secondary: "src",
    });
  });

  it("omits a root-level path's empty parent rather than rendering a blank line", () => {
    const [option] = evidenceOptions([[entry("code:README.md")]], []);
    expect(option).toEqual({ value: "README.md", primary: "README.md" });
  });

  it("dedupes across providers, vault identity winning", () => {
    // The same path reachable from both providers must offer ONE row; the vault
    // provider runs first, matching the unified search host's precedence.
    const options = evidenceOptions(
      [[entry("doc:notes/x")], [entry("code:notes/x"), entry("code:notes/x")]],
      [],
    );
    expect(options.map((option) => option.value)).toEqual(["notes/x"]);
  });

  it("hides paths already attached, so the cap is never spent on no-ops", () => {
    const attached: AgentMention[] = [
      { kind: "path", value: "src/a.ts", label: "a.ts" },
    ];
    const options = evidenceOptions(
      [[entry("code:src/a.ts"), entry("code:src/b.ts")]],
      attached,
    );
    expect(options.map((option) => option.value)).toEqual(["src/b.ts"]);
  });

  it("bounds the merged list", () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`code:src/f${i}.ts`));
    expect(evidenceOptions([many], []).length).toBe(AGENT_EVIDENCE_RESULTS_CAP);
    expect(evidenceOptions([many], [], 3).length).toBe(3);
  });
});

describe("evidenceMention", () => {
  it("carries the FULL path as the value and the basename as the label", () => {
    // The value is what dedupes the attachment and what travels in the prompt; the
    // label is only what the narrow chip shows.
    expect(evidenceMention("src/app/agent/Composer.tsx")).toEqual({
      kind: "path",
      value: "src/app/agent/Composer.tsx",
      label: "Composer.tsx",
    });
  });
});
