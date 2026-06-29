// @vitest-environment happy-dom
//
// Node-detail wire-shape regression guard (mock-mirrors-live-wire-shape). The live
// `/nodes/{id}` route serves a NESTED envelope — `{data:{detail:{bundle:{node,…}},
// summary}, tiers}` (the orchestration-era context bundle) — but the internal
// `NodeDetail` shape the stores layer consumes is FLAT: `{node, summary?, tiers}`.
// `adaptNodeDetail` (wired into `engineClient.node()`) bridges the two.
//
// WHY THIS TEST EXISTS: the divergence shipped latent because the unit tests inject
// a FLAT literal via `setQueryData` and so NEVER drove the real nested wire. Without
// the adapter, `useNodeDetailView` read `data.node` off the nested body, found
// `undefined`, and silently degraded EVERY node to `unavailable` (the hover card and
// the inspector). This test drives the REAL wire through the adapter against the live
// `vaultspec serve` over the committed fixture vault, so the flatten — and the lazy
// doc-body summary fill — cannot silently regress again.

import { describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";

describe("node detail live wire shape (adaptNodeDetail regression guard)", () => {
  it("flattens the nested /nodes/{id} bundle to a top-level node + lazy summary", async () => {
    const client = createLiveClient();
    const scope = await liveScope();

    // A fixture document with real body prose (alpha research). The pre-fix bug
    // left the node nested under `detail.bundle.node`, so `detail.node` was
    // undefined and the consuming view degraded to `unavailable`.
    const detail = await client.node("doc:2026-01-01-alpha-research", scope);

    // The flatten worked: identity is at the TOP level.
    expect(detail.node).toBeDefined();
    expect(detail.node.id).toBe("doc:2026-01-01-alpha-research");
    expect(detail.node.doc_type).toBe("research");

    // The lazy first-prose-paragraph summary the engine route fills for doc nodes.
    expect(typeof detail.summary).toBe("string");
    expect((detail.summary ?? "").length).toBeGreaterThan(0);
    expect(detail.summary).toContain("alpha investigation");

    // The tiers block rides every envelope (every-wire-response-carries-the-tiers-block).
    expect(detail.tiers).toBeDefined();
  });
});
