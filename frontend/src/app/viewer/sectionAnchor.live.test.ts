// Live-wire proof that the reader's section-selector builder anchors EXACTLY on the
// real engine (authoring-surface W02.P05.S17).
//
// The crux of the comment feature: a comment created from the reader must list as
// ANCHORED, which happens only when the selector's `expected_content_hash` equals
// what the backend computes for that section. This test builds a selector the SAME
// way the compose box does — `parseHeadingBlocks` over the served body +
// `sectionSelectorForBlock` (git blob oid of the section bytes) — creates the comment
// over the REAL `vaultspec serve` wire, and asserts the engine resolves it as
// anchored. It never mocks the wire, and it deletes the comment it creates.

import { beforeAll, describe, expect, it } from "vitest";

import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import { AuthoringClient, newIdempotencyKey } from "../../stores/server/authoring";
import { parseDocument } from "../../stores/server/parseDocument";
import { parseHeadingBlocks, sectionSelectorForBlock } from "./sectionAnchor";

const RESEARCH_NODE_ID = "doc:2026-01-01-alpha-research";
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let client: AuthoringClient;
let scope: string;

async function humanToken(label: string): Promise<string> {
  const issued = await client.issueActorToken({
    actor: { id: `human:${label}-${run}`, kind: "human" },
  });
  return issued.raw_token;
}

beforeAll(async () => {
  client = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
  scope = await liveScope();
});

describe("reader section selector (live)", () => {
  it("anchors a comment built from the reader's own selector math against the real body", async () => {
    const engine = createLiveClient();
    const content = await engine.content(RESEARCH_NODE_ID, scope);
    // Parse the frontmatter-stripped body exactly as the reader does, then build the
    // selector for a live section with the shared compose-box builder.
    const blocks = parseHeadingBlocks(parseDocument(content.text).body);
    expect(blocks.length).toBeGreaterThan(0);
    const selector = await sectionSelectorForBlock(blocks[0]);

    const token = await humanToken("reader-anchor");
    const created = await client.createComment(
      RESEARCH_NODE_ID,
      { selector, body: "a note from the reader selector builder" },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`reader-${run}`) },
    );
    try {
      const list = await client.listComments(RESEARCH_NODE_ID);
      const mine = list.comments.find(
        (entry) => entry.comment.comment_id === created.comment_id,
      );
      expect(mine).toBeDefined();
      // The reader-computed content hash matched the backend's — anchored, not orphaned.
      expect(mine!.orphaned).toBe(false);
      expect(mine!.anchor.state).toBe("anchored");
    } finally {
      await client.deleteComment(created.comment_id, { actorToken: token });
    }
  });
});
