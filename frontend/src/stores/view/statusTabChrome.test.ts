import { beforeEach, describe, expect, it } from "vitest";

import {
  OPEN_RECENT_COMMIT_HASHES_CAP,
  RECENT_COMMITS_LIMIT_CAP,
  deriveRecentCommitsChromeView,
  deriveRecentCommitChromeRows,
  deriveStatusSectionChromeView,
  resetStatusTabChrome,
  showMoreRecentCommits,
  toggleRecentCommit,
  toggleStatusSection,
  useStatusTabChromeStore,
} from "./statusTabChrome";

describe("statusTabChrome store", () => {
  beforeEach(() => resetStatusTabChrome());

  it("tracks section disclosure state by stable section id", () => {
    toggleStatusSection("open-plans", true);
    toggleStatusSection("recent-prs", true);

    expect(useStatusTabChromeStore.getState().sections).toMatchObject({
      "open-plans": false,
      "recent-prs": false,
    });

    toggleStatusSection("open-plans", true);
    expect(useStatusTabChromeStore.getState().sections["open-plans"]).toBe(true);
  });

  it("rejects malformed section ids at the store boundary", () => {
    toggleStatusSection("unexpected-section" as never, true);

    expect(useStatusTabChromeStore.getState().sections).toEqual({});

    toggleStatusSection("open-issues", false);
    expect(useStatusTabChromeStore.getState().sections).toEqual({
      "open-issues": true,
    });
  });

  it("projects status section fold chrome behind the status-tab seam", () => {
    expect(deriveStatusSectionChromeView("open-plans", true)).toEqual({
      bodyId: "status-section-open-plans",
      twistyPx: 10,
      headerClassName:
        "flex w-full items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-1-5 text-left transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      bodyClassName: "px-fg-1 pb-fg-2 pt-fg-0-5",
      bodyVisible: true,
    });
    expect(deriveStatusSectionChromeView("open-plans", false)).toMatchObject({
      bodyVisible: false,
    });
  });

  it("tracks recent commit expansion and bounded paging chrome", () => {
    toggleRecentCommit("abc123");
    toggleRecentCommit("def456");
    showMoreRecentCommits(20, 20);

    expect(useStatusTabChromeStore.getState()).toMatchObject({
      openRecentCommitHashes: ["abc123", "def456"],
      recentCommitsLimit: 40,
    });

    toggleRecentCommit("abc123");
    expect(useStatusTabChromeStore.getState().openRecentCommitHashes).toEqual([
      "def456",
    ]);
  });

  it("caps recent commit expansion and paging accumulators", () => {
    for (let i = 0; i < OPEN_RECENT_COMMIT_HASHES_CAP + 3; i += 1) {
      toggleRecentCommit(`commit-${i}`);
    }

    expect(useStatusTabChromeStore.getState().openRecentCommitHashes).toEqual(
      Array.from(
        { length: OPEN_RECENT_COMMIT_HASHES_CAP },
        (_, i) => `commit-${i + 3}`,
      ),
    );

    showMoreRecentCommits(RECENT_COMMITS_LIMIT_CAP * 2, 20);
    expect(useStatusTabChromeStore.getState().recentCommitsLimit).toBe(
      RECENT_COMMITS_LIMIT_CAP,
    );
  });

  it("rejects empty recent commit expansion keys at the store boundary", () => {
    toggleRecentCommit("");
    toggleRecentCommit("   ");
    toggleRecentCommit(" abc123 ");

    expect(useStatusTabChromeStore.getState().openRecentCommitHashes).toEqual([
      "abc123",
    ]);

    toggleRecentCommit("abc123");
    expect(useStatusTabChromeStore.getState().openRecentCommitHashes).toEqual([]);
  });

  it("bounds malformed recent commit paging input at the store boundary", () => {
    showMoreRecentCommits(Number.NaN, 20);
    expect(useStatusTabChromeStore.getState().recentCommitsLimit).toBe(40);

    showMoreRecentCommits(-10, -5);
    expect(useStatusTabChromeStore.getState().recentCommitsLimit).toBe(41);

    resetStatusTabChrome();
    showMoreRecentCommits(0, 0);
    expect(useStatusTabChromeStore.getState().recentCommitsLimit).toBe(2);
  });

  it("normalizes recent commit chrome at the selector boundary", () => {
    const view = deriveRecentCommitsChromeView(
      Number.POSITIVE_INFINITY,
      [
        "",
        "abc123",
        " abc123 ",
        ...Array.from(
          { length: OPEN_RECENT_COMMIT_HASHES_CAP + 2 },
          (_, i) => `commit-${i}`,
        ),
      ],
      -10,
    );

    expect(view.limit).toBe(RECENT_COMMITS_LIMIT_CAP);
    expect(view.openHashes).toHaveLength(OPEN_RECENT_COMMIT_HASHES_CAP);
    expect(view.openHashes).not.toContain("");
    expect(view.openHashes[0]).toBe("commit-2");
    expect(view.openHashes[view.openHashes.length - 1]).toBe(
      `commit-${OPEN_RECENT_COMMIT_HASHES_CAP + 1}`,
    );
  });

  it("resets right-rail status chrome for a fresh corpus", () => {
    toggleStatusSection("recent-commits", true);
    toggleRecentCommit("abc123");
    showMoreRecentCommits(20, 20);

    resetStatusTabChrome();

    expect(useStatusTabChromeStore.getState()).toMatchObject({
      sections: {},
      openRecentCommitHashes: [],
      recentCommitsLimit: null,
    });
  });

  it("projects recent commit expansion rows behind the chrome seam", () => {
    const rows = [
      { commit: { hash: "with-body" }, hasBody: true, label: "body" },
      { commit: { hash: "without-body" }, hasBody: false, label: "empty" },
      { commit: { hash: "closed" }, hasBody: true, label: "closed" },
    ];

    expect(deriveRecentCommitChromeRows(rows, ["with-body", "without-body"])).toEqual([
      {
        row: rows[0],
        expanded: true,
        showBody: true,
        rootClassName: "",
        headerClassName: "flex items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-1",
        toggleClassName:
          "flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        rowButtonClassName:
          "flex min-w-0 flex-1 items-center gap-fg-1-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        shortHashClassName: "shrink-0 font-mono text-meta text-accent-text",
        subjectClassName: "min-w-0 flex-1 truncate text-label text-ink-muted",
        ageClassName: "shrink-0 text-meta text-ink-faint",
      },
      {
        row: rows[1],
        expanded: true,
        showBody: false,
        rootClassName: "",
        headerClassName: "flex items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-1",
        toggleClassName:
          "flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus opacity-40",
        rowButtonClassName:
          "flex min-w-0 flex-1 items-center gap-fg-1-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        shortHashClassName: "shrink-0 font-mono text-meta text-accent-text",
        subjectClassName: "min-w-0 flex-1 truncate text-label text-ink-muted",
        ageClassName: "shrink-0 text-meta text-ink-faint",
      },
      {
        row: rows[2],
        expanded: false,
        showBody: false,
        rootClassName: "",
        headerClassName: "flex items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-1",
        toggleClassName:
          "flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        rowButtonClassName:
          "flex min-w-0 flex-1 items-center gap-fg-1-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        shortHashClassName: "shrink-0 font-mono text-meta text-accent-text",
        subjectClassName: "min-w-0 flex-1 truncate text-label text-ink-muted",
        ageClassName: "shrink-0 text-meta text-ink-faint",
      },
    ]);
  });
});
