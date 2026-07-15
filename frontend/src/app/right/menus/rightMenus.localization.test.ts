import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../../localization/testing";
import type {
  ActionDescriptor,
  ActionPresentation,
} from "../../../platform/actions/action";
import { resolveActionPresentation } from "../../../platform/actions/action";
import { resolveMessageResult } from "../../../platform/localization/fallback";
import { commitMenu } from "./commitMenu";
import { prMenu } from "./prMenu";
import { searchResultMenu } from "./searchResultMenu";

function action(actions: readonly ActionDescriptor[], id: string): ActionDescriptor {
  const match = actions.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`Missing action: ${id}`);
  return match;
}

function migratedPresentations(): readonly ActionPresentation[] {
  const commit = {
    kind: "commit" as const,
    id: "private-full-hash",
    shortHash: "private-short-hash",
    subject: "Private authored commit message",
    ts: 1_700_000_000_000,
  };
  const availableCommit = commitMenu(commit, {
    timeTravel: false,
    scope: "/private/project",
  });
  const codeCommit = commitMenu(commit, {
    timeTravel: false,
    corpus: "code",
    scope: "/private/project",
  });
  const staleCommit = commitMenu(
    { kind: "commit", id: "private-full-hash" },
    { timeTravel: false, scope: "/private/project" },
  );
  const unselectedCommit = commitMenu(commit);
  const pullRequest = prMenu({
    kind: "pull-request",
    id: "private-pr-number",
    url: "https://private.example/pull/42",
  });
  const stalePullRequest = prMenu({
    kind: "pull-request",
    id: "private-pr-number",
  });
  const searchResult = searchResultMenu({
    kind: "search-result",
    id: "private-search-id",
    source: "private/source/path.ts",
    nodeId: "private-node-id",
    score: 0.93,
    isCode: true,
  });
  const unavailableSearchResult = searchResultMenu({
    kind: "search-result",
    id: "private-search-id",
    source: "private/source/path.ts",
    score: 0.93,
    isCode: true,
  });

  return [
    ...availableCommit.map(({ label }) => label),
    action(codeCommit, "commit:view-at-commit").disabledReason!,
    action(staleCommit, "commit:view-at-commit").disabledReason!,
    action(unselectedCommit, "commit:view-at-commit").disabledReason!,
    ...pullRequest.map(({ label }) => label),
    action(stalePullRequest, "pull-request:open").disabledReason!,
    action(searchResult, "search-result:focus").label,
    action(unavailableSearchResult, "search-result:focus").disabledReason!,
  ];
}

describe("localized right-rail entity menus", () => {
  it("resolves every migrated presentation through genuine English, French, and Arabic catalogs", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;

    for (const presentation of migratedPresentations()) {
      const results = runtimes.map((runtime) =>
        resolveActionPresentation(presentation, (descriptor) =>
          resolveMessageResult(runtime, descriptor),
        ),
      );
      expect(results.every(({ usedFallback }) => usedFallback === false)).toBe(true);
      expect(new Set(results.map(({ message }) => message)).size).toBe(3);
      for (const { message } of results) {
        expect(message).not.toMatch(
          /private-|private\.example|private\/source|authored commit|\b(?:corpus|scope|registry|transport|id|score|vector|semantic|json)\b|—/iu,
        );
      }
    }
  });

  it("preserves permitted authored and source data in clipboard payloads", () => {
    const commitActions = commitMenu(
      {
        kind: "commit",
        id: "full-hash-value",
        shortHash: "short-hash-value",
        subject: "Authored subject value",
        ts: 1_700_000_000_000,
      },
      { timeTravel: false, scope: "/project" },
    );
    const pullRequestActions = prMenu({
      kind: "pull-request",
      id: "42",
      url: "https://example.com/pull/42",
    });
    const searchResultActions = searchResultMenu({
      kind: "search-result",
      id: "search-id",
      source: "src/exact-path.ts",
      nodeId: "code:src/exact-path.ts",
      score: 0.93,
      isCode: true,
    });

    expect(action(commitActions, "commit:copy-hash").dispatch).toMatchObject({
      payload: { text: "full-hash-value", what: "id" },
    });
    expect(action(commitActions, "commit:copy-short-hash").dispatch).toMatchObject({
      payload: { text: "short-hash-value", what: "id" },
    });
    expect(action(commitActions, "commit:copy-subject").dispatch).toMatchObject({
      payload: { text: "Authored subject value", what: "title" },
    });
    expect(action(pullRequestActions, "pull-request:copy-url").dispatch).toMatchObject({
      payload: { text: "https://example.com/pull/42", what: "path" },
    });
    expect(
      action(pullRequestActions, "pull-request:copy-number").dispatch,
    ).toMatchObject({
      payload: { text: "42", what: "id" },
    });
    expect(
      action(searchResultActions, "search-result:copy-source").dispatch,
    ).toMatchObject({
      payload: { text: "src/exact-path.ts", what: "path" },
    });
    expect(searchResultActions.map(({ id }) => id)).not.toContain(
      "search-result:copy-score",
    );
    expect(searchResultActions.map(({ id }) => id)).not.toContain(
      "search-result:copy-full",
    );
  });
});
