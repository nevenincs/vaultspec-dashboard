// @vitest-environment happy-dom is NOT needed (pure adapter unit tests on captured samples).
// Split from liveAdapters.test.ts (module-decomposition mandate, 2026-07-12).

import { describe, expect, it } from "vitest";
import {
  HISTORY_COMMITS_MAX_ITEMS,
  HISTORY_COMMIT_BODY_MAX_CHARS,
  HISTORY_STRING_MAX_CHARS,
  adaptHistory,
  adaptIssues,
  adaptPrs,
  codeNodeIdFromPath,
  deriveSearchNodeId,
  featureNodeIdFromTag,
  featureTagFromNodeId,
} from "./index";
import { TIERS } from "./testFixtures";

describe("deriveSearchNodeId (node-id grammar, null floor — search ADR)", () => {
  it("the engine annotation always wins", () => {
    expect(deriveSearchNodeId({ node_id: "doc:explicit", path: "x.md" })).toBe(
      "doc:explicit",
    );
  });

  it("derives doc:{stem} for a vault hit when the annotation is absent", () => {
    expect(deriveSearchNodeId({ path: ".vault/adr/2026-06-12-auth-flow-adr.md" })).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
    expect(deriveSearchNodeId({ stem: "2026-06-12-auth-flow-adr" })).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
  });

  it("derives code:{path} for a code hit — NEVER papers a code hit as doc:", () => {
    // A non-.md path is a code hit; papering it as doc: would lose the directory
    // and point at no graph node (search ADR risk: phantom click-through).
    expect(deriveSearchNodeId({ path: "src/lib/auth.rs" })).toBe(
      "code:src/lib/auth.rs",
    );
    expect(deriveSearchNodeId({ source: "code", path: "engine/query.rs" })).toBe(
      "code:engine/query.rs",
    );
  });

  it("yields null when no honest id can be formed (never a guess)", () => {
    expect(deriveSearchNodeId({ score: 0.5 })).toBeNull();
    expect(deriveSearchNodeId({ source: "code" })).toBeNull();
  });
});

describe("codeNodeIdFromPath (shared code identity grammar)", () => {
  it("derives the contract code-artifact node id from a repo path", () => {
    expect(codeNodeIdFromPath("src/lib/auth.rs")).toBe("code:src/lib/auth.rs");
  });
});

describe("feature node identity grammar", () => {
  it("derives and parses synthesized feature node ids through one helper pair", () => {
    expect(featureNodeIdFromTag("auth-flow")).toBe("feature:auth-flow");
    expect(featureTagFromNodeId("feature:auth-flow")).toBe("auth-flow");
    expect(featureTagFromNodeId("doc:auth-flow")).toBeNull();
  });
});

describe("adaptHistory (status-overview /history)", () => {
  it("adapts a live-shaped /history body, defaulting short_hash and dropping bad rows", () => {
    // A captured live-shape body: snake_case commit rows + tiers block, exactly
    // as `vaultspec-api` history.rs serves under the {data, tiers} envelope.
    const live = {
      commits: [
        {
          hash: "0123456789abcdef0123456789abcdef01234567",
          short_hash: "01234567",
          subject: "feat: the latest commit",
          ts: 1_700_000_002_000,
          node_ids: ["commit:0123456789abcdef0123456789abcdef01234567", "doc:x-plan"],
        },
        // A row missing short_hash: the adapter derives it from the hash.
        {
          hash: "abcdef0123456789abcdef0123456789abcdef01",
          subject: "fix: an older commit",
          ts: 1_700_000_001_000,
          node_ids: ["commit:abcdef0123456789abcdef0123456789abcdef01"],
        },
        // A malformed row (no hash): dropped, never crashing the list.
        { subject: "no hash here", ts: 1 },
      ],
      truncated: null,
      tiers: TIERS,
    };
    const res = adaptHistory(live);
    expect(res.commits).toHaveLength(2);
    expect(res.commits[0].subject).toBe("feat: the latest commit");
    // The sparse row's short_hash is derived from the full hash.
    expect(res.commits[1].short_hash).toBe("abcdef01");
    expect(res.commits[1].node_ids).toEqual([
      "commit:abcdef0123456789abcdef0123456789abcdef01",
    ]);
    expect(res.tiers).toBe(TIERS);
  });

  it("normalizes history identities at the live adapter boundary", () => {
    const res = adaptHistory({
      commits: [
        {
          hash: " abcdef0123456789abcdef0123456789abcdef01 ",
          short_hash: " abcdef01 ",
          subject: " fix: trim presentation identity ",
          body: "\n\nbody text\n",
          ts: Number.NaN,
          node_ids: [
            " doc:a ",
            "doc:a",
            "",
            "commit:abcdef0123456789abcdef0123456789abcdef01",
            42,
          ],
        },
        { hash: "   ", subject: "blank hash is malformed" },
      ],
      next_cursor: " cursor:2 ",
      tiers: TIERS,
    });

    expect(res.commits).toHaveLength(1);
    expect(res.commits[0]).toMatchObject({
      hash: "abcdef0123456789abcdef0123456789abcdef01",
      short_hash: "abcdef01",
      subject: "fix: trim presentation identity",
      body: "\n\nbody text\n",
      ts: 0,
      node_ids: ["doc:a", "commit:abcdef0123456789abcdef0123456789abcdef01"],
    });
    expect(res.next_cursor).toBe("cursor:2");
  });

  it("bounds history commit rows and string payloads at the adapter boundary", () => {
    const overlongString = "x".repeat(HISTORY_STRING_MAX_CHARS + 1);
    const overlongBody = "b".repeat(HISTORY_COMMIT_BODY_MAX_CHARS + 1);
    const commits = Array.from(
      { length: HISTORY_COMMITS_MAX_ITEMS + 1 },
      (_, index) => ({
        hash: `abcdef0123456789abcdef0123456789abcdef${String(index % 10).padStart(
          2,
          "0",
        )}`,
        short_hash: `short-${index}`,
        subject: index === 0 ? overlongString : `commit ${index}`,
        body: index === 0 ? overlongBody : "",
        ts: index,
      }),
    );

    const res = adaptHistory({
      commits,
      next_cursor: overlongString,
      tiers: TIERS,
    });

    expect(res.commits).toHaveLength(HISTORY_COMMITS_MAX_ITEMS);
    expect(res.commits[0].subject).toBe("");
    expect(res.commits[0].body).toHaveLength(HISTORY_COMMIT_BODY_MAX_CHARS);
    expect(res.next_cursor).toBeNull();
    expect(res.truncated).toEqual({
      requested: HISTORY_COMMITS_MAX_ITEMS + 1,
      returned: HISTORY_COMMITS_MAX_ITEMS,
      reason: "adapter commit ceiling",
    });
  });

  it("tolerates an absent body with an empty list + empty tiers (degraded read)", () => {
    const res = adaptHistory(undefined);
    expect(res.commits).toEqual([]);
    expect(res.truncated).toBeNull();
    expect(res.tiers).toEqual({});
  });

  it("forwards the truncated clamp block when the engine reports it", () => {
    const res = adaptHistory({
      commits: [],
      truncated: { requested: 5000, returned: 200, reason: "history limit ceiling" },
      tiers: TIERS,
    });
    expect(res.truncated).toEqual({
      requested: 5000,
      returned: 200,
      reason: "history limit ceiling",
    });
  });
});

describe("adaptGitHub work items (status-overview /prs and /issues)", () => {
  it("normalizes PR identities, text, dates, checks, and unavailable reason", () => {
    const res = adaptPrs({
      prs: [
        {
          number: 42,
          title: " Centralize status rows ",
          author: " octo ",
          state: " OPEN ",
          is_draft: true,
          url: " https://example.test/pr/42 ",
          created_at: " 2026-06-18T00:00:00Z ",
          updated_at: "   ",
          merged_at: " 2026-06-19T00:00:00Z ",
          review_decision: " APPROVED ",
          checks: { total: 3.8, passed: 3, failing: -1, pending: Number.NaN },
        },
        { number: 0, title: "invalid number" },
      ],
      available: false,
      reason: " gh not authenticated ",
      tiers: TIERS,
    });

    expect(res.prs).toHaveLength(1);
    expect(res.prs[0]).toMatchObject({
      number: 42,
      title: "Centralize status rows",
      author: "octo",
      state: "OPEN",
      is_draft: true,
      url: "https://example.test/pr/42",
      created_at: "2026-06-18T00:00:00Z",
      updated_at: null,
      merged_at: "2026-06-19T00:00:00Z",
      review_decision: "APPROVED",
      checks: { total: 3, passed: 3, failing: 0, pending: 0 },
    });
    expect(res.available).toBe(false);
    expect(res.reason).toBe("gh not authenticated");
    expect(res.tiers).toBe(TIERS);
  });

  it("normalizes issue rows and bounds labels at the adapter boundary", () => {
    const labels = Array.from({ length: 40 }, (_, i) => ` label-${i} `);
    const res = adaptIssues({
      issues: [
        {
          number: 7,
          title: " Harden state boundary ",
          author: " octo ",
          state: " OPEN ",
          url: " https://example.test/issues/7 ",
          created_at: " 2026-06-18T00:00:00Z ",
          updated_at: "   ",
          labels: [" state ", "ui", "state", "", 42, ...labels],
        },
        { number: Number.NaN, title: "invalid number" },
      ],
      available: true,
      reason: "   ",
      tiers: TIERS,
    });

    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]).toMatchObject({
      number: 7,
      title: "Harden state boundary",
      author: "octo",
      state: "OPEN",
      url: "https://example.test/issues/7",
      created_at: "2026-06-18T00:00:00Z",
      updated_at: null,
    });
    expect(res.issues[0].labels).toHaveLength(32);
    expect(res.issues[0].labels.slice(0, 4)).toEqual([
      "state",
      "ui",
      "label-0",
      "label-1",
    ]);
    expect(res.reason).toBeNull();
  });
});
