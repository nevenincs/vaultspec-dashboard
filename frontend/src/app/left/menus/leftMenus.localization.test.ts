import { describe, expect, it } from "vitest";

import type {
  ActionDescriptor,
  ActionPresentation,
} from "../../../platform/actions/action";
import { resolveActionPresentation } from "../../../platform/actions/action";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../../localization/testing";
import { resolveMessageResult } from "../../../platform/localization/fallback";
import { worktreeMenu } from "./worktreeMenu";

function action(actions: readonly ActionDescriptor[], id: string): ActionDescriptor {
  const match = actions.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`Missing action: ${id}`);
  return match;
}

function migratedPresentations(): readonly ActionPresentation[] {
  const available = worktreeMenu({
    kind: "worktree",
    id: "scope-internal-id",
    branch: "private-branch-value",
    path: "/private/path/value",
    hasVault: true,
  });
  const unavailable = worktreeMenu({
    kind: "worktree",
    id: "scope-internal-id",
    hasVault: false,
  });

  return [
    action(available, "worktree:switch-scope").label,
    action(available, "worktree:copy-branch").label,
    action(unavailable, "worktree:switch-scope").disabledReason!,
  ];
}

describe("localized worktree menu", () => {
  it("resolves migrated presentation through genuine English, French, and Arabic catalogs", () => {
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
          /scope-internal-id|private-branch-value|private\/path|\b(?:scope|workspace|registry|corpus|id)\b|—/iu,
        );
      }
    }
  });

  it("omits transport identity while preserving optional branch and reveal actions", () => {
    expect(
      worktreeMenu({
        kind: "worktree",
        id: "scope-internal-id",
        branch: "private-branch-value",
        path: "/private/path/value",
        hasVault: true,
      }).map(({ id }) => id),
    ).toEqual(["worktree:switch-scope", "worktree:copy-branch", "worktree:reveal"]);
    expect(
      worktreeMenu({
        kind: "worktree",
        id: "scope-internal-id",
        hasVault: true,
      }).map(({ id }) => id),
    ).toEqual(["worktree:switch-scope"]);
  });
});
