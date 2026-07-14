// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { EngineError, engineClient } from "../engine";
import type {
  HistoryResponse,
  IssuesResponse,
  PRsResponse,
  TiersBlock,
} from "../engine";
import {
  DEFAULT_HISTORY_LIMIT,
  ENGINE_SEARCH_BUDGET_MS,
  MAX_HISTORY_LIMIT,
  SEARCH_MAX_RESULTS,
  SEARCH_QUERY_TIMEOUT_MS,
  deriveHistoryView,
  deriveIssuesView,
  derivePRsView,
  derivePullRequestsSectionView,
  deriveStatusTabSectionsView,
  engineKeys,
  normalizeEngineEventsRequestIdentity,
  normalizeGraphDiffRequestIdentity,
  normalizeHistoryCommitForView,
  normalizeHistoryCommitsForView,
  normalizeHistoryLimit,
  normalizeHistoryRequestIdentity,
  normalizeIssuesRequestIdentity,
  normalizePullRequestsRequestIdentity,
  normalizeSearchRequestIdentity,
  normalizeSettingUpdate,
  useEngineEvents,
  useEngineSearch,
  useGraphDiff,
  useHistoryView,
  useIssuesView,
  useNodeHistory,
  usePRsView,
} from "./index";
import { UNIFIED_SEARCH_RESULTS_MAX_ITEMS } from "../searchController";
import { testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("remaining scoped query cache boundaries", () => {
  it("does not expose cached history data when no scope is selected", () => {
    const client = testQueryClient();
    const history: HistoryResponse = {
      commits: [
        {
          hash: "abc123",
          short_hash: "abc123",
          subject: "cached commit",
          body: "",
          ts: Date.parse("2026-06-19T00:00:00Z"),
          node_ids: ["commit:abc123", "doc:cached"],
        },
      ],
      truncated: null,
      next_cursor: null,
      tiers: { structural: { available: true } },
    };
    client.setQueryData(engineKeys.history("", DEFAULT_HISTORY_LIMIT), history);
    client.setQueryData(engineKeys.history("scope-a", DEFAULT_HISTORY_LIMIT), history);

    expect(normalizeHistoryRequestIdentity(" scope-a ", 24.7)).toEqual({
      scope: "scope-a",
      limit: 24,
    });
    expect(normalizeHistoryRequestIdentity({ scope: "scope-a" }, "50")).toEqual({
      scope: null,
      limit: DEFAULT_HISTORY_LIMIT,
    });

    const raw = renderHook(() => useNodeHistory(null), {
      wrapper: wrapper(client),
    });
    const view = renderHook(() => useHistoryView(null), {
      wrapper: wrapper(client),
    });
    const malformedRaw = renderHook(
      () => useNodeHistory({ scope: "scope-a" }, DEFAULT_HISTORY_LIMIT),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedView = renderHook(
      () => useHistoryView({ scope: "scope-a" }, DEFAULT_HISTORY_LIMIT),
      {
        wrapper: wrapper(client),
      },
    );

    expect(raw.result.current.data).toBeUndefined();
    expect(view.result.current.showList).toBe(false);
    expect(view.result.current.commits).toEqual([]);
    expect(malformedRaw.result.current.data).toBeUndefined();
    expect(malformedView.result.current.showList).toBe(false);
    expect(malformedView.result.current.commits).toEqual([]);
  });

  it("does not expose cached PR or issue data when no scope is selected", () => {
    const client = testQueryClient();
    const prs: PRsResponse = {
      prs: [],
      available: true,
      reason: null,
      tiers: {},
    };
    const issues: IssuesResponse = {
      issues: [],
      available: true,
      reason: null,
      tiers: {},
    };
    client.setQueryData(engineKeys.prs("", "open"), prs);
    client.setQueryData(engineKeys.issues("", "open"), issues);
    client.setQueryData(engineKeys.prs("scope-a", "open"), prs);
    client.setQueryData(engineKeys.issues("scope-a", "open"), issues);

    expect(normalizePullRequestsRequestIdentity(" scope-a ", "merged")).toEqual({
      scope: "scope-a",
      state: "merged",
    });
    expect(normalizePullRequestsRequestIdentity({ scope: "scope-a" }, "draft")).toEqual(
      {
        scope: null,
        state: "open",
      },
    );
    expect(normalizeIssuesRequestIdentity(" scope-a ", "closed")).toEqual({
      scope: "scope-a",
      state: "closed",
    });
    expect(normalizeIssuesRequestIdentity({ scope: "scope-a" }, "merged")).toEqual({
      scope: null,
      state: "open",
    });

    const prView = renderHook(() => usePRsView(null), {
      wrapper: wrapper(client),
    });
    const issueView = renderHook(() => useIssuesView(null), {
      wrapper: wrapper(client),
    });
    const malformedPrView = renderHook(() => usePRsView({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });
    const malformedIssueView = renderHook(() => useIssuesView({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });

    expect(prView.result.current.available).toBe(false);
    expect(prView.result.current.showList).toBe(false);
    expect(issueView.result.current.available).toBe(false);
    expect(issueView.result.current.showList).toBe(false);
    expect(malformedPrView.result.current.available).toBe(false);
    expect(malformedPrView.result.current.showList).toBe(false);
    expect(malformedIssueView.result.current.available).toBe(false);
    expect(malformedIssueView.result.current.showList).toBe(false);
  });

  it("does not expose cached event data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.events("", {}), {
      events: [
        {
          id: "evt:cached",
          ts: "2026-06-19",
          kind: "commit",
          ref: "abc",
          node_ids: [],
        },
      ],
      tiers: {},
    });
    client.setQueryData(
      engineKeys.events("scope-a", { from: "2026-06-01", to: "2026-06-30" }, "day"),
      {
        events: [
          {
            id: "evt:cached",
            ts: "2026-06-19",
            kind: "commit",
            ref: "abc",
            node_ids: [],
          },
        ],
        tiers: {},
      },
    );

    expect(
      normalizeEngineEventsRequestIdentity(
        " scope-a ",
        { from: " 2026-06-01 ", to: " 2026-06-30 " },
        " day ",
      ),
    ).toEqual({
      scope: "scope-a",
      range: { from: "2026-06-01", to: "2026-06-30" },
      bucket: "day",
    });
    expect(
      normalizeEngineEventsRequestIdentity(
        { scope: "scope-a" },
        { from: 1, to: { value: "2026-06-30" } },
        { bucket: "day" },
      ),
    ).toEqual({
      scope: null,
      range: { from: undefined, to: undefined },
      bucket: undefined,
    });

    const { result } = renderHook(() => useEngineEvents(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () =>
        useEngineEvents(
          { scope: "scope-a" },
          { from: "2026-06-01", to: "2026-06-30" },
          "day",
        ),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });

  it("does not expose cached graph diff data when no scope or no window is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.diff("", 1, 2), { ops: [], tiers: {} });
    client.setQueryData(engineKeys.diff("scope-a", 1, 1), { ops: [], tiers: {} });
    client.setQueryData(engineKeys.diff("scope-a", 1, 2), { ops: [], tiers: {} });

    expect(
      normalizeGraphDiffRequestIdentity(
        " scope-a ",
        " 1 ",
        2,
        ' {"feature_tags":["state"]} ',
      ),
    ).toEqual({
      scope: "scope-a",
      from: "1",
      to: 2,
      filter: '{"feature_tags":["state"]}',
    });
    expect(
      normalizeGraphDiffRequestIdentity({ scope: "scope-a" }, Number.NaN, "", {
        filter: "ignored",
      }),
    ).toEqual({
      scope: null,
      from: null,
      to: null,
      filter: undefined,
    });

    const noScope = renderHook(() => useGraphDiff(null, 1, 2), {
      wrapper: wrapper(client),
    });
    const emptyWindow = renderHook(() => useGraphDiff("scope-a", 1, 1), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(() => useGraphDiff({ scope: "scope-a" }, 1, 2), {
      wrapper: wrapper(client),
    });
    const malformedWindow = renderHook(() => useGraphDiff("scope-a", { from: 1 }, 2), {
      wrapper: wrapper(client),
    });

    expect(noScope.result.current.data).toBeUndefined();
    expect(emptyWindow.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
    expect(malformedWindow.result.current.data).toBeUndefined();
  });

  it("does not expose cached search data when no scope or no query is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.search("", "cached", "vault"), {
      results: [{ id: "doc:cached" }],
      tiers: {},
    });
    client.setQueryData(engineKeys.search("scope-a", "", "vault"), {
      results: [{ id: "doc:cached" }],
      tiers: {},
    });
    client.setQueryData(engineKeys.search("scope-a", "cached", "vault"), {
      results: [{ id: "doc:cached" }],
      tiers: {},
    });

    expect(normalizeSearchRequestIdentity(" cached ", "code", " scope-a ")).toEqual({
      scope: "scope-a",
      query: "cached",
      target: "code",
    });
    expect(
      normalizeSearchRequestIdentity(
        { query: "cached" },
        { target: "code" },
        {
          scope: "scope-a",
        },
      ),
    ).toEqual({
      scope: null,
      query: "",
      target: "vault",
    });

    const noScope = renderHook(() => useEngineSearch(null, "cached"), {
      wrapper: wrapper(client),
    });
    const emptyQuery = renderHook(() => useEngineSearch("scope-a", ""), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useEngineSearch({ scope: "scope-a" }, "cached"),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedQuery = renderHook(
      () => useEngineSearch("scope-a", { query: "cached" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(emptyQuery.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
    expect(malformedQuery.result.current.data).toBeUndefined();
  });

  // rag-integration-hardening D2/D5: the client budget ordering and the app-bounded
  // search payload are load-bearing invariants pinned here so a later edit that
  // breaks the ordering (or drifts the result bound) fails CI deterministically.
  it("keeps the client search budget strictly above the engine budget plus margin (D2)", () => {
    // The whole degradation architecture depends on the tiers envelope landing
    // before the client aborts: client budget MUST strictly exceed the engine's
    // search budget, with real transport headroom.
    expect(SEARCH_QUERY_TIMEOUT_MS).toBeGreaterThan(ENGINE_SEARCH_BUDGET_MS);
    expect(SEARCH_QUERY_TIMEOUT_MS - ENGINE_SEARCH_BUDGET_MS).toBeGreaterThanOrEqual(
      1_000,
    );
  });

  it("bounds the search payload to the merged-view need, under the engine ceiling (D5)", () => {
    // The app-chosen per-target `max_results` is sized to the unified palette's
    // merged-view bound — fetching up to N per target keeps the top-N merge
    // correct when one corpus dominates — and must not drift from it.
    expect(SEARCH_MAX_RESULTS).toBe(UNIFIED_SEARCH_RESULTS_MAX_ITEMS);
    // It must stay at or below the engine's MAX_SEARCH_RESULTS ceiling (50 in
    // engine/crates/vaultspec-api/src/routes/ops.rs), or the engine 400-rejects.
    expect(SEARCH_MAX_RESULTS).toBeLessThanOrEqual(50);
  });

  it("normalizes settings update payloads before the settings mutation", () => {
    expect(
      normalizeSettingUpdate({
        key: " theme ",
        value: "dark",
        scope: " scope-a ",
      }),
    ).toEqual({
      key: "theme",
      value: "dark",
      scope: "scope-a",
    });
    expect(
      normalizeSettingUpdate({
        key: "label_filter",
        value: "  semantic only  ",
        scope: "   ",
      }),
    ).toEqual({
      key: "label_filter",
      value: "  semantic only  ",
      scope: undefined,
    });
    expect(normalizeSettingUpdate({ key: "   ", value: "dark" })).toBeNull();
    expect(normalizeSettingUpdate({ key: "theme", value: 42 })).toBeNull();
    expect(normalizeSettingUpdate("theme")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deriveHistoryView (Status overview recent-commit degradation, contract §2 /
// status-overview ADR): degradation is read from the served `tiers` block (the
// `structural` tier the commit read resolves through), never guessed from a bare
// transport error — and a FRESH error envelope's tiers win over a stale block.
// ---------------------------------------------------------------------------

function historyWith(
  tiers: TiersBlock | undefined,
  commits: HistoryResponse["commits"] = [],
): HistoryResponse {
  return { commits, truncated: null, next_cursor: null, tiers: tiers ?? {} };
}

describe("history selector limit normalization", () => {
  it("uses the same bounded limit before history cache keys and wire reads", () => {
    expect(normalizeHistoryLimit(Number.NaN)).toBe(DEFAULT_HISTORY_LIMIT);
    expect(normalizeHistoryLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_HISTORY_LIMIT);
    expect(normalizeHistoryLimit(0)).toBe(1);
    expect(normalizeHistoryLimit(20.9)).toBe(20);
    expect(normalizeHistoryLimit(MAX_HISTORY_LIMIT + 50)).toBe(MAX_HISTORY_LIMIT);
  });

  it("normalizes history commit rows before stores projections consume them", () => {
    expect(
      normalizeHistoryCommitForView({
        hash: "  abc12345  ",
        short_hash: "",
        subject: "  feat: normalize history  ",
        body: 42,
        ts: Number.NaN,
        node_ids: [" commit:abc12345 ", " doc:x ", "", "doc:x", 7],
      }),
    ).toEqual({
      hash: "abc12345",
      short_hash: "abc12345",
      subject: "feat: normalize history",
      body: "",
      ts: 0,
      node_ids: ["commit:abc12345", "doc:x"],
    });
    expect(normalizeHistoryCommitForView({ short_hash: "abc" })).toBeNull();
    expect(
      normalizeHistoryCommitsForView([
        null,
        {
          hash: " kept ",
          short_hash: " k ",
          subject: "",
          body: "",
          ts: 1,
          node_ids: [],
        },
      ]),
    ).toEqual([
      { hash: "kept", short_hash: "k", subject: "", body: "", ts: 1, node_ids: [] },
    ]);
    expect(normalizeHistoryCommitsForView(null)).toEqual([]);
  });
});

describe("deriveHistoryView", () => {
  it("reports available with the commit list when structural is served", () => {
    const now = 1_000_000_000_000;
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        {
          hash: "abc123",
          short_hash: "abc123",
          subject: "feat: x",
          body: "",
          ts: now - 5 * 60_000,
          node_ids: ["commit:abc123", "doc:x", "code:src/x.ts"],
        },
      ]),
      undefined,
      false,
      now,
    );
    expect(view).toMatchObject({ loading: false, degraded: false, errored: false });
    expect(view.available).toBe(true);
    expect(view).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      showList: true,
      loadingClassName:
        "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      unavailableClassName: "text-label text-ink-muted",
      emptyClassName: "text-label text-ink-faint",
      listRootClassName: "space-y-fg-1-5",
      listClassName: "space-y-fg-1-5",
      commitBodyClassName:
        "ml-fg-5 mt-fg-0-5 whitespace-pre-wrap rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label text-ink-muted",
      showMoreButtonClassName:
        "w-full rounded-fg-xs px-fg-2 py-fg-1 text-center text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    });
    expect(view.commits).toHaveLength(1);
    expect(view.recentCommitRows).toEqual([
      {
        commit: view.commits[0],
        eventId: "commit:abc123",
        touchedNodeIds: ["doc:x", "code:src/x.ts"],
        selectable: true,
        hasBody: false,
        subjectLabel: "feat: x",
        rowAriaLabel: "commit abc123: feat: x",
        messageToggleLabel: expect.any(Function),
        ageLabel: "5m",
      },
    ]);
    expect(view.recentCommitRows[0]!.messageToggleLabel(false)).toBe(
      "expand message for abc123",
    );
    expect(view.recentCommitRows[0]!.messageToggleLabel(true)).toBe(
      "collapse message for abc123",
    );
    expect(view.canShowMore).toBe(false);
  });

  it("derives recent commit subject fallback and row labels in the stores view", () => {
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        {
          hash: "empty-subject",
          short_hash: "empty",
          subject: "",
          body: "",
          ts: 1,
          node_ids: ["doc:x"],
        },
      ]),
      undefined,
      false,
      1_000_000,
    );

    expect(view.recentCommitRows[0]).toMatchObject({
      subjectLabel: "(no subject)",
      rowAriaLabel: "commit empty: (no subject)",
    });
  });

  it("normalizes malformed cached history rows before deriving recent rows", () => {
    const commits = [
      {
        hash: "  abcdef12  ",
        short_hash: "",
        subject: "  subject  ",
        body: 17,
        ts: Number.POSITIVE_INFINITY,
        node_ids: [" commit:abcdef12 ", " doc:x ", "doc:x", "", { id: "doc:y" }],
      },
      {
        hash: "",
        short_hash: "drop",
        subject: "dropped",
        body: "",
        ts: 1,
        node_ids: ["doc:dropped"],
      },
    ] as unknown as HistoryResponse["commits"];

    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
    );

    expect(view.commits).toEqual([
      {
        hash: "abcdef12",
        short_hash: "abcdef12",
        subject: "subject",
        body: "",
        ts: 0,
        node_ids: ["commit:abcdef12", "doc:x"],
      },
    ]);
    expect(view.recentCommitRows).toHaveLength(1);
    expect(view.recentCommitRows[0]).toMatchObject({
      eventId: "commit:abcdef12",
      touchedNodeIds: ["doc:x"],
      selectable: true,
      hasBody: false,
      subjectLabel: "subject",
      rowAriaLabel: "commit abcdef12: subject",
      ageLabel: "",
    });
  });

  it("derives commit body expansion and bounded show-more state in the stores view", () => {
    const commits = Array.from({ length: 20 }, (_, i) => ({
      hash: `hash-${i}`,
      short_hash: `h${i}`,
      subject: `commit ${i}`,
      body: i === 0 ? "\n\nbody text\n" : "",
      ts: i,
      node_ids: [`commit:hash-${i}`],
    }));
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      20,
    );

    expect(view.canShowMore).toBe(true);
    expect(view.recentCommitRows[0].hasBody).toBe(true);
    expect(view.recentCommitRows[1].hasBody).toBe(false);

    const capped = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      200,
    );
    expect(capped.canShowMore).toBe(false);
  });

  it("projects recent-history visibility states in stores", () => {
    expect(deriveHistoryView(undefined, undefined, true)).toMatchObject({
      showLoading: true,
      showUnavailable: false,
      showEmpty: false,
      showList: false,
    });
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: false } }, []),
        undefined,
        false,
      ),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: true,
      showEmpty: false,
      showList: false,
    });
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, []),
        undefined,
        false,
      ),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: true,
      showList: false,
    });
  });

  it("derives recent commit age labels inside the stores row projection", () => {
    const now = 1_000_000_000_000;
    const commits = [
      {
        hash: "just-now",
        short_hash: "just-now",
        subject: "fresh",
        body: "",
        ts: now - 30_000,
        node_ids: ["doc:fresh"],
      },
      {
        hash: "hours",
        short_hash: "hours",
        subject: "hourly",
        body: "",
        ts: now - 3 * 3_600_000,
        node_ids: ["doc:hourly"],
      },
      {
        hash: "days",
        short_hash: "days",
        subject: "daily",
        body: "",
        ts: now - 2 * 86_400_000,
        node_ids: ["doc:daily"],
      },
      {
        hash: "missing-time",
        short_hash: "missing",
        subject: "missing",
        body: "",
        ts: 0,
        node_ids: ["doc:missing"],
      },
    ];

    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      now,
    );

    expect(view.recentCommitRows.map((row) => row.ageLabel)).toEqual([
      "just now",
      "3h",
      "2d",
      "",
    ]);
  });

  it("renders recent commit rows from the requested bounded history limit", () => {
    const commits = Array.from({ length: 45 }, (_, i) => ({
      hash: `hash-${i}`,
      short_hash: `h${i}`,
      subject: `commit ${i}`,
      body: "",
      ts: i,
      node_ids: [`commit:hash-${i}`, `doc:touched-${i}`],
    }));
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      20,
    );

    expect(view.commits).toHaveLength(45);
    expect(view.recentCommitRows).toHaveLength(20);
    expect(view.recentCommitRows.map((row) => row.eventId)).toEqual(
      commits.slice(0, 20).map((commit) => `commit:${commit.hash}`),
    );
    expect(view.recentCommitRows[0].touchedNodeIds).toEqual(["doc:touched-0"]);

    const expanded = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      40,
    );
    expect(expanded.recentCommitRows).toHaveLength(40);
  });

  it("bounds malformed history render limits at the projection seam", () => {
    const commits = Array.from({ length: MAX_HISTORY_LIMIT + 5 }, (_, i) => ({
      hash: `hash-${i}`,
      short_hash: `h${i}`,
      subject: `commit ${i}`,
      body: "",
      ts: i,
      node_ids: [],
    }));

    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, commits),
        undefined,
        false,
        1_000_000,
        Number.POSITIVE_INFINITY,
      ).recentCommitRows,
    ).toHaveLength(DEFAULT_HISTORY_LIMIT);
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, commits),
        undefined,
        false,
        1_000_000,
        -10,
      ).recentCommitRows,
    ).toHaveLength(1);
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, commits),
        undefined,
        false,
        1_000_000,
        MAX_HISTORY_LIMIT + 100,
      ).recentCommitRows,
    ).toHaveLength(MAX_HISTORY_LIMIT);
  });

  it("does not expose held commits while the history query is loading", () => {
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        {
          hash: "abc",
          short_hash: "abc",
          subject: "held",
          body: "",
          ts: 1,
          node_ids: [],
        },
      ]),
      undefined,
      true,
    );

    expect(view.loading).toBe(true);
    expect(view.available).toBe(false);
    expect(view.commits).toEqual([]);
    expect(view.recentCommitRows).toEqual([]);
  });

  it("treats an absent structural tier as designed degradation (absence != available)", () => {
    const view = deriveHistoryView(historyWith({}, []), undefined, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
    expect(view.commits).toHaveLength(0);
    expect(view.recentCommitRows).toHaveLength(0);
  });

  it("surfaces a tiers-bearing error envelope (backend answered) as degradation", () => {
    const err = new EngineError("/history", 400, {
      tiers: { structural: { available: false, reason: "no readable history" } },
    });
    const view = deriveHistoryView(undefined, err, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
    expect(view.reasons.structural).toBe("no readable history");
  });

  it("surfaces a tiers-less transport fault as the errored branch, not degradation", () => {
    const err = new EngineError("/history", 500);
    const view = deriveHistoryView(undefined, err, false);
    expect(view.errored).toBe(true);
    expect(view.degraded).toBe(false);
  });

  it("lets a FRESH error envelope's tiers override a stale held-success block", () => {
    // A held success block reports structural available, but the latest request
    // failed with a structural-down envelope — the fresh error must win.
    const err = new EngineError("/history", 400, {
      tiers: { structural: { available: false } },
    });
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        { hash: "abc", short_hash: "abc", subject: "x", body: "", ts: 1, node_ids: [] },
      ]),
      err,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.commits).toHaveLength(0);
  });

  it("reports loading while in flight with no data or error", () => {
    const view = deriveHistoryView(undefined, undefined, true);
    expect(view.loading).toBe(true);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
    expect(view.loadingLabel).toBe("reading recent commits...");
    expect(view.unavailableLabel).toBe("recent history unavailable");
    expect(view.emptyLabel).toBe("no commits yet on this branch.");
    expect(view.showMoreLabel).toBe("Show more");
  });
});

describe("derivePRsView and deriveIssuesView", () => {
  const pr = (patch: Partial<PRsResponse["prs"][number]> = {}) => ({
    number: 42,
    title: "Centralize status rows",
    author: "octo",
    state: "OPEN",
    is_draft: false,
    url: "https://example.test/pr/42",
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T01:00:00Z",
    merged_at: null,
    review_decision: "",
    checks: { total: 3, passed: 3, failing: 0, pending: 0 },
    ...patch,
  });
  const issue = (patch: Partial<IssuesResponse["issues"][number]> = {}) => ({
    number: 7,
    title: "Harden state boundary",
    author: "octo",
    state: "OPEN",
    url: "https://example.test/issues/7",
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T01:00:00Z",
    labels: ["state", "ui", "extra", "hidden"],
    ...patch,
  });

  it("projects open PR row labels, checks, and state messages in stores", () => {
    const view = derivePRsView(
      { prs: [pr()], available: true, reason: null, tiers: {} },
      null,
      false,
      "open",
    );

    expect(view.loadingLabel).toBe("reading open PRs...");
    expect(view.emptyLabel).toBe("no open pull requests");
    expect(view.unavailableLabel).toBe(
      "pull requests unavailable - GitHub not reachable",
    );
    expect(view).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      showList: true,
      loadingClassName:
        "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      unavailableClassName: "text-label text-ink-faint",
      emptyClassName: "text-label text-ink-faint",
      listClassName: "space-y-fg-1-5",
    });
    expect(view.rows[0]).toMatchObject({
      numberLabel: "#42",
      titleLabel: "Centralize status rows",
      stateLabel: "open",
      stateTone: "accent",
      icon: "pull-request",
      iconTone: "accent",
      iconToneClass: "text-accent",
      authorLabel: "octo",
      checksLabel: "checks",
      checksTone: "active",
      checksToneClass: "text-state-active",
      mergedLabel: null,
    });
  });

  it("projects merged and draft PR rows without app-layer branching", () => {
    expect(
      derivePRsView(
        {
          prs: [
            pr({
              is_draft: true,
              checks: { total: 2, passed: 0, failing: 1, pending: 1 },
            }),
          ],
          available: true,
          reason: null,
          tiers: {},
        },
        null,
        false,
        "open",
      ).rows[0],
    ).toMatchObject({
      stateLabel: "draft",
      stateTone: "neutral",
      iconTone: "faint",
      iconToneClass: "text-ink-faint",
      checksLabel: "1 failing",
      checksTone: "broken",
      checksToneClass: "text-state-broken",
    });

    const merged = derivePRsView(
      {
        prs: [pr({ merged_at: "2026-06-18T01:00:00Z", checks: null })],
        available: true,
        reason: null,
        tiers: {},
      },
      null,
      false,
      "merged",
    );

    expect(merged.loadingLabel).toBe("reading recent PRs...");
    expect(merged.emptyLabel).toBe("no recently-merged pull requests");
    expect(merged.rows[0]).toMatchObject({
      icon: "merged",
      iconTone: "muted",
      iconToneClass: "text-ink-muted",
      stateLabel: "merged",
      stateTone: "neutral",
      checksLabel: null,
      checksToneClass: null,
      mergedLabel: "merged",
    });
  });

  it("projects unavailable PR and issue messages from capability-local reasons", () => {
    expect(
      derivePRsView(
        { prs: [pr()], available: false, reason: "gh auth missing", tiers: {} },
        null,
        false,
      ),
    ).toMatchObject({
      available: false,
      showLoading: false,
      showUnavailable: true,
      showEmpty: false,
      showList: false,
      prs: [],
      rows: [],
      unavailableLabel: "gh auth missing",
    });

    expect(
      deriveIssuesView(
        { issues: [issue()], available: false, reason: "gh unavailable", tiers: {} },
        null,
        false,
      ),
    ).toMatchObject({
      available: false,
      showLoading: false,
      showUnavailable: true,
      showEmpty: false,
      showList: false,
      issues: [],
      rows: [],
      unavailableLabel: "gh unavailable",
    });
  });

  it("projects issue row labels and capped issue chips in stores", () => {
    const view = deriveIssuesView(
      { issues: [issue()], available: true, reason: null, tiers: {} },
      null,
      false,
    );

    expect(view.loadingLabel).toBe("reading open issues...");
    expect(view.emptyLabel).toBe("no open issues");
    expect(view.unavailableLabel).toBe("issues unavailable - GitHub not reachable");
    expect(view).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      showList: true,
      loadingClassName:
        "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      unavailableClassName: "text-label text-ink-faint",
      emptyClassName: "text-label text-ink-faint",
      listClassName: "space-y-fg-1-5",
    });
    expect(view.rows[0]).toMatchObject({
      numberLabel: "#7",
      titleLabel: "Harden state boundary",
      authorLabel: "octo",
      labels: ["state", "ui", "extra"],
    });
  });

  it("projects PR and issue loading and empty visibility states in stores", () => {
    expect(derivePRsView(undefined, null, true, "open")).toMatchObject({
      showLoading: true,
      showUnavailable: false,
      showEmpty: false,
      showList: false,
    });
    expect(
      derivePRsView({ prs: [], available: true, reason: null, tiers: {} }, null, false),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: true,
      showList: false,
    });
    expect(deriveIssuesView(undefined, null, true)).toMatchObject({
      showLoading: true,
      showUnavailable: false,
      showEmpty: false,
      showList: false,
    });
    expect(
      deriveIssuesView(
        { issues: [], available: true, reason: null, tiers: {} },
        null,
        false,
      ),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: true,
      showList: false,
    });
  });

  it("projects status-tab section headers and count receipts in stores", () => {
    expect(
      deriveStatusTabSectionsView({
        openPlans: 2,
        openPrs: 0,
        openIssues: 4,
      }),
    ).toEqual({
      openPlans: { id: "open-plans", title: "Plans", count: 2 },
      pullRequests: { id: "pull-requests", title: "Pull requests", count: undefined },
      openIssues: { id: "open-issues", title: "Issues", count: 4 },
      recentCommits: { id: "recent-commits", title: "Commits" },
    });
  });

  it("composes the one Pull requests section from the open and merged views", () => {
    const loading = derivePRsView(undefined, null, true, "open");
    const openEmpty = derivePRsView(
      { prs: [], available: true, reason: null, tiers: {} },
      null,
      false,
      "open",
    );
    const openWithRows = derivePRsView(
      { prs: [pr()], available: true, reason: null, tiers: {} },
      null,
      false,
      "open",
    );
    const mergedLoading = derivePRsView(undefined, null, true, "merged");
    const mergedEmpty = derivePRsView(
      { prs: [], available: true, reason: null, tiers: {} },
      null,
      false,
      "merged",
    );
    const mergedWithRows = derivePRsView(
      {
        prs: [pr({ merged_at: "2026-06-18T01:00:00Z", checks: null })],
        available: true,
        reason: null,
        tiers: {},
      },
      null,
      false,
      "merged",
    );
    const unavailable = derivePRsView(
      { prs: [], available: false, reason: "gh auth missing", tiers: {} },
      null,
      false,
      "open",
    );

    // Open leads: its rows render while the merged read is still in flight.
    expect(derivePullRequestsSectionView(openWithRows, mergedLoading)).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      mergedRows: [],
    });
    // Open settled EMPTY while merged still loads → the skeleton holds (never a
    // momentary blank body: not empty, not loading, nothing listed).
    expect(derivePullRequestsSectionView(openEmpty, mergedLoading)).toMatchObject({
      showLoading: true,
      showEmpty: false,
    });
    // Both settled empty → the one empty state.
    expect(derivePullRequestsSectionView(openEmpty, mergedEmpty)).toMatchObject({
      showEmpty: true,
      emptyLabel: "No pull requests.",
    });
    // Open empty, merged populated → NEVER empty; the merged lane renders.
    const mergedOnly = derivePullRequestsSectionView(openEmpty, mergedWithRows);
    expect(mergedOnly.showEmpty).toBe(false);
    expect(mergedOnly.mergedRows).toHaveLength(1);
    expect(mergedOnly.mergedLabel).toBe("Recently merged");
    // Capability-down is led by the open view; no lane renders rows.
    expect(derivePullRequestsSectionView(unavailable, mergedWithRows)).toMatchObject({
      showUnavailable: true,
      openRows: [],
      mergedRows: [],
    });
    // Open still loading masks everything else.
    expect(derivePullRequestsSectionView(loading, mergedWithRows)).toMatchObject({
      showLoading: true,
      openRows: [],
      mergedRows: [],
    });
  });
});
