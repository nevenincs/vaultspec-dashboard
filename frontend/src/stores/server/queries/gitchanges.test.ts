// @vitest-environment happy-dom
// Split from queries.test.ts (module-decomposition mandate, 2026-07-12).

import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import {
  engineClient,
  type ChangedFile,
  type EngineStatus,
  type GitFileDiff,
} from "../engine";
import {
  GIT_QUERY_KEY_PART_MAX_CHARS,
  canReadGitFileDiff,
  canReadGitHistoricalFileDiff,
  deriveChangedFilesView,
  deriveChangesOverviewView,
  engineKeys,
  normalizeGitDiffRequest,
  normalizeGitQueryKeyPart,
  useChangedFiles,
  useChangesOverview,
  useGitFileDiff,
  useGitHistoricalFileDiff,
} from "./index";
import { renderHook } from "@testing-library/react";
import { testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("useChangedFiles git availability boundary", () => {
  const statusWithoutGit: EngineStatus = {
    ok: true,
    nodes: 0,
    edges: 0,
    degradations: [],
    tiers: {
      structural: { available: true },
    },
  };
  const statusWithGit: EngineStatus = {
    ...statusWithoutGit,
    git: { branch: "main", dirty: true },
  };
  const cachedChangedFile: ChangedFile = {
    path: "src/stale.ts",
    code: " M",
    letter: "M",
    group: "modified",
    vault: false,
    adds: 4,
    dels: 1,
  };

  it("does not issue changed-file reads or expose cached rows when git is unavailable", async () => {
    const client = testQueryClient();
    const scope = "scope-without-git";
    client.setQueryData(engineKeys.status(), statusWithoutGit);
    client.setQueryData(engineKeys.gitChanges(scope), [cachedChangedFile]);
    const gitRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/status") || input.includes("/ops/git/numstat")) {
        gitRequests.push(input);
      }
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(() => useChangedFiles(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toMatchObject({
      loading: false,
      errored: false,
      files: [],
      codeFiles: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gitRequests).toEqual([]);
    unmount();
  });

  it("does not issue changed-file reads for malformed scopes even when git is available", async () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.status(), statusWithGit);
    client.setQueryData(engineKeys.gitChanges(""), [cachedChangedFile]);
    const gitRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/status") || input.includes("/ops/git/numstat")) {
        gitRequests.push(input);
      }
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(
      () => useChangedFiles({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toMatchObject({
      loading: false,
      errored: false,
      files: [],
      codeFiles: [],
      documents: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gitRequests).toEqual([]);
    unmount();
  });

  it("keeps the changes overview on the degraded empty state with cached changed rows", () => {
    const client = testQueryClient();
    const scope = "scope-without-git";
    client.setQueryData(engineKeys.status(), statusWithoutGit);
    client.setQueryData(engineKeys.gitChanges(scope), [cachedChangedFile]);

    const { result, unmount } = renderHook(() => useChangesOverview(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toMatchObject({
      degraded: true,
      hasChanges: false,
      hasFiles: false,
      hasDocuments: false,
      files: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
    });
    unmount();
  });

  it("normalizes malformed changes overview scope to the no-scope state", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.status(), statusWithGit);
    client.setQueryData(engineKeys.gitChanges(""), [cachedChangedFile]);

    const { result, unmount } = renderHook(
      () => useChangesOverview({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toMatchObject({
      noScope: true,
      clean: false,
      hasChanges: false,
      files: [],
      documents: [],
    });
    unmount();
  });
});

describe("git diff selector argument normalization", () => {
  const availableGit = { git: { branch: "main", dirty: true } };

  it("uses one trimmed stores-layer identity for git diff cache and wire inputs", () => {
    expect(
      normalizeGitDiffRequest(
        "  wt-1  ",
        "  .vault/plan.md  ",
        "  HEAD~1  ",
        "  HEAD  ",
      ),
    ).toEqual({
      scope: "wt-1",
      path: ".vault/plan.md",
      from: "HEAD~1",
      to: "HEAD",
    });

    expect(
      normalizeGitDiffRequest({ scope: "wt-1" }, ["src/app.ts"], 1, Number.NaN),
    ).toEqual({
      scope: null,
      path: null,
      from: null,
      to: null,
    });
  });

  it("bounds git diff cache and wire identities before reads", () => {
    const oversized = "x".repeat(GIT_QUERY_KEY_PART_MAX_CHARS + 1);

    expect(
      normalizeGitQueryKeyPart(` ${"x".repeat(GIT_QUERY_KEY_PART_MAX_CHARS)} `),
    ).toHaveLength(GIT_QUERY_KEY_PART_MAX_CHARS);
    expect(normalizeGitQueryKeyPart(oversized)).toBe("");
    expect(normalizeGitDiffRequest("wt-1", oversized, "HEAD~1", "HEAD")).toEqual({
      scope: "wt-1",
      path: null,
      from: "HEAD~1",
      to: "HEAD",
    });
    expect(canReadGitFileDiff("wt-1", oversized, availableGit)).toBe(false);
    expect(
      canReadGitHistoricalFileDiff(
        "wt-1",
        ".vault/plan.md",
        oversized,
        "HEAD",
        availableGit,
      ),
    ).toBe(false);
    expect(engineKeys.gitDiff("wt-1", oversized)).toEqual([
      ...engineKeys.all,
      "git-diff",
      "wt-1",
      "",
    ]);
  });

  it("disables live and historical diff reads for blank presentation values", () => {
    expect(canReadGitFileDiff("wt-1", "   ", availableGit)).toBe(false);
    expect(canReadGitFileDiff({ scope: "wt-1" }, ".vault/plan.md", availableGit)).toBe(
      false,
    );
    expect(
      canReadGitHistoricalFileDiff(
        "wt-1",
        ".vault/plan.md",
        "HEAD~1",
        "  ",
        availableGit,
      ),
    ).toBe(false);
    expect(
      canReadGitHistoricalFileDiff(
        "wt-1",
        ".vault/plan.md",
        "HEAD~1",
        { rev: "HEAD" },
        availableGit,
      ),
    ).toBe(false);
  });
});

describe("useGitFileDiff git availability boundary", () => {
  const cachedDiff: GitFileDiff = {
    path: "src/app.ts",
    status: "M",
    hunks: [{ header: "@@ -1 +1 @@", lines: [] }],
  };

  it("does not issue a diff read when status carries no git payload", async () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    const diffRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/diff")) diffRequests.push(input);
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(
      () => useGitFileDiff("scope-without-git", "src/app.ts", "M"),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(diffRequests).toEqual([]);
    unmount();
  });

  it("does not expose cached working-tree diff data when git becomes unavailable", () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    client.setQueryData(engineKeys.gitDiff("scope-without-git", "src/app.ts"), {
      ...cachedDiff,
    });

    const { result, unmount } = renderHook(
      () => useGitFileDiff("scope-without-git", "src/app.ts", "M"),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    unmount();
  });

  it("does not issue a historical diff read when status carries no git payload", async () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    const diffRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/histdiff")) diffRequests.push(input);
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(
      () =>
        useGitHistoricalFileDiff(
          "scope-without-git",
          "src/app.ts",
          "HEAD~1",
          "HEAD",
          "M",
        ),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(diffRequests).toEqual([]);
    unmount();
  });

  it("does not expose cached historical diff data when git becomes unavailable", () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    client.setQueryData(
      engineKeys.gitHistoricalDiff("scope-without-git", "src/app.ts", "HEAD~1", "HEAD"),
      { ...cachedDiff },
    );

    const { result, unmount } = renderHook(
      () =>
        useGitHistoricalFileDiff(
          "scope-without-git",
          "src/app.ts",
          "HEAD~1",
          "HEAD",
          "M",
        ),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    unmount();
  });
});

describe("deriveChangedFilesView", () => {
  it("splits vault documents from source files and computes the summary once", () => {
    const files: ChangedFile[] = [
      {
        path: "src/app.ts",
        code: " M",
        letter: "M",
        group: "modified",
        vault: false,
        adds: 4,
        dels: 1,
      },
      {
        path: ".vault/plan/2026-06-18-plan.md",
        code: "A ",
        letter: "A",
        group: "added",
        vault: true,
        adds: 8,
        dels: 0,
      },
      {
        path: "assets/logo.png",
        code: " M",
        letter: "M",
        group: "modified",
        vault: false,
        adds: null,
        dels: null,
      },
    ];

    const view = deriveChangedFilesView(files, false, false);

    expect(view.codeFiles.map((file) => file.path)).toEqual([
      "src/app.ts",
      "assets/logo.png",
    ]);
    expect(view.documents.map((file) => file.path)).toEqual([
      ".vault/plan/2026-06-18-plan.md",
    ]);
    expect(view.summary).toEqual({
      files: 2,
      documents: 1,
      additions: 12,
      deletions: 1,
      total: 3,
    });
  });

  it("drops held rows while git is unavailable", () => {
    const view = deriveChangedFilesView(
      [
        {
          path: "src/stale.ts",
          code: " M",
          letter: "M",
          group: "modified",
          vault: false,
          adds: 4,
          dels: 1,
        },
      ],
      true,
      true,
      false,
    );

    expect(view).toMatchObject({
      loading: false,
      errored: false,
      files: [],
      codeFiles: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
    });
  });
});

describe("deriveChangesOverviewView", () => {
  const retry = () => undefined;
  const availableGit = {
    loading: false,
    errored: false,
    degraded: false,
    dirty: true,
    git: { branch: "main", dirty: true },
    retry,
  };

  it("combines git availability and changed-file rows into one render surface", () => {
    const changed = deriveChangedFilesView(
      [
        {
          path: "src/app.ts",
          code: " M",
          letter: "M",
          group: "modified",
          vault: false,
          adds: 4,
          dels: 1,
        },
        {
          path: ".vault/adr/2026-06-18-x.md",
          code: "A ",
          letter: "A",
          group: "added",
          vault: true,
          adds: 2,
          dels: 0,
        },
      ],
      false,
      false,
    );
    const view = deriveChangesOverviewView(availableGit, changed);

    expect(view.noScope).toBe(false);
    expect(view.hasChanges).toBe(true);
    expect(view.hasFiles).toBe(true);
    expect(view.hasDocuments).toBe(true);
    expect(view.loading).toBe(false);
    expect(view.clean).toBe(false);
    expect(view.files.map((file) => file.path)).toEqual(["src/app.ts"]);
    expect(view.files[0]).toMatchObject({
      path: "src/app.ts",
      basename: "app.ts",
      nodeId: "code:src/app.ts",
      group: "modified",
      dotColor: "var(--color-state-stale)",
      rowClassName:
        "flex h-[1.875rem] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      dotClassName: "size-2 shrink-0 rounded-full",
      basenameClassName: "min-w-0 flex-1 truncate font-mono text-[0.71875rem] text-ink",
      adds: 4,
      dels: 1,
      addsLabel: "4 added",
      delsLabel: "1 removed",
      addsClassName: "shrink-0 text-meta text-diff-add",
      delsClassName: "shrink-0 text-meta text-diff-remove",
      openArrowClassName: "shrink-0 text-body text-ink-faint",
    });
    expect(view.documents.map((file) => file.path)).toEqual([
      ".vault/adr/2026-06-18-x.md",
    ]);
    expect(view.documents[0]).toEqual({
      path: ".vault/adr/2026-06-18-x.md",
      title: "X",
      nodeId: "doc:2026-06-18-x",
      category: "adr",
      rowClassName:
        "flex h-[1.875rem] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      fallbackDotClassName: "size-2 shrink-0 rounded-full bg-ink-faint",
      titleClassName: "min-w-0 flex-1 truncate text-[0.78125rem] text-ink",
      openArrowClassName: "shrink-0 text-body text-ink-faint",
    });
    expect(view.summary.total).toBe(2);
    expect(view.summaryLabels).toEqual({
      files: "1 file",
      documents: "1 document",
      additions: "+6",
      deletions: "−1",
    });
    expect(view.noScopeLabel).toBe(
      "No worktree selected — pick one in the left rail first.",
    );
    expect(view.filesSectionLabel).toBe("Changed files — open diff or source");
    expect(view.filesListAriaLabel).toBe("changed files");
    expect(view.documentsSectionLabel).toBe("Changed documents — open reader");
    expect(view.documentsListAriaLabel).toBe("changed documents");
    expect(view.noScopeClassName).toBe("text-label text-ink-faint");
    expect(view.rootClassName).toBe("space-y-fg-3 text-label");
    expect(view.summaryClassName).toBe("flex flex-wrap items-center gap-fg-1-5");
    expect(view.summaryPrimaryClassName).toBe("text-label font-medium text-ink-muted");
    expect(view.summaryDividerClassName).toBe("text-ink-faint");
    expect(view.summaryAdditionsClassName).toBe("text-meta text-diff-add");
    expect(view.summaryDeletionsClassName).toBe("text-meta text-diff-remove");
    expect(view.loadingClassName).toBe(
      "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
    );
    expect(view.degradedClassName).toBe(
      "rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted",
    );
    expect(view.errorRootClassName).toBe("flex items-center gap-fg-2");
    expect(view.errorTitleClassName).toBe("flex-1 text-label text-state-broken");
    expect(view.retryButtonClassName).toBe(
      "rounded-fg-xs text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    );
    expect(view.sectionLabelClassName).toBe("mb-fg-1");
    expect(view.listClassName).toBe("space-y-fg-1");
    expect(view.cleanClassName).toBe("text-label text-ink-faint");
    expect(view.retry).toBe(retry);
  });

  it("prioritizes designed empty/loading/degraded/error states only when no rows exist", () => {
    const empty = deriveChangedFilesView([], false, false);

    expect(
      deriveChangesOverviewView({ ...availableGit, loading: true }, empty),
    ).toMatchObject({
      loading: true,
      clean: false,
      hasChanges: false,
      loadingLabel: "reading changes…",
    });
    expect(
      deriveChangesOverviewView(
        { ...availableGit, git: undefined, degraded: true, dirty: false },
        empty,
      ),
    ).toMatchObject({
      degraded: true,
      clean: false,
      hasChanges: false,
      degradedLabel: "repository state unavailable",
    });
    expect(
      deriveChangesOverviewView(
        { ...availableGit, git: undefined, errored: true, dirty: false },
        empty,
      ),
    ).toMatchObject({
      errored: true,
      clean: false,
      hasChanges: false,
      errorTitle: "changes unavailable",
      retryLabel: "retry",
    });
    expect(deriveChangesOverviewView(availableGit, empty)).toMatchObject({
      clean: true,
      hasFiles: false,
      hasDocuments: false,
      cleanLabel: "working tree clean — no changes to review.",
    });
  });

  it("projects the no-scope display state for the rail renderer", () => {
    const empty = deriveChangedFilesView([], false, false);

    expect(deriveChangesOverviewView(availableGit, empty, null)).toMatchObject({
      noScope: true,
      clean: false,
      hasChanges: false,
      hasFiles: false,
      hasDocuments: false,
      noScopeLabel: "No worktree selected — pick one in the left rail first.",
    });
  });

  it("projects changed-file dot color from the git status group", () => {
    const changed = deriveChangedFilesView(
      [
        {
          path: "src/new.ts",
          code: "A ",
          letter: "A",
          group: "added",
          vault: false,
          adds: 1,
          dels: 0,
        },
        {
          path: "src/old.ts",
          code: "D ",
          letter: "D",
          group: "deleted",
          vault: false,
          adds: 0,
          dels: 2,
        },
        {
          path: "src/moved.ts",
          code: "R ",
          letter: "R",
          group: "renamed",
          vault: false,
          adds: 0,
          dels: 0,
        },
      ],
      false,
      false,
    );

    expect(
      deriveChangesOverviewView(availableGit, changed).files.map((file) => [
        file.group,
        file.dotColor,
      ]),
    ).toEqual([
      ["added", "var(--color-diff-add)"],
      ["deleted", "var(--color-diff-remove)"],
      ["renamed", "var(--color-diff-remove)"],
    ]);
  });

  it("does not let stale changed rows mask unavailable git", () => {
    const stale = deriveChangedFilesView(
      [
        {
          path: "src/stale.ts",
          code: " M",
          letter: "M",
          group: "modified",
          vault: false,
          adds: 4,
          dels: 1,
        },
      ],
      false,
      false,
    );

    const view = deriveChangesOverviewView(
      { ...availableGit, git: undefined, degraded: true, dirty: false },
      stale,
    );

    expect(view).toMatchObject({
      degraded: true,
      hasChanges: false,
      hasFiles: false,
      hasDocuments: false,
      files: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
      summaryLabels: {
        files: "0 files",
        documents: "0 documents",
        additions: "+0",
        deletions: "−0",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// deriveCoreStatusView — vaultspec-core status rollup interpretation.
// App chrome consumes this view rather than interpreting status.core directly.
// ---------------------------------------------------------------------------
