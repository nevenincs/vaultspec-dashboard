import { describe, expect, it } from "vitest";

import {
  isWorktreeActivateScopePayload,
  normalizeWorktreeActivateScopePayload,
  WORKTREE_ACTIVATE_SCOPE_ACTION,
  worktreeActivateScopeDispatch,
} from "./worktreeActions";

describe("worktree activation dispatch seam", () => {
  it("names the single worktree activation action", () => {
    expect(WORKTREE_ACTIVATE_SCOPE_ACTION).toBe("worktree:activate-scope");
  });

  it("accepts only non-empty scope payloads before dispatch can mutate session state", () => {
    expect(isWorktreeActivateScopePayload({ scope: "scope-a" })).toBe(true);
    expect(normalizeWorktreeActivateScopePayload({ scope: " scope-a " })).toEqual({
      scope: "scope-a",
    });
    expect(isWorktreeActivateScopePayload({ scope: "  " })).toBe(false);
    expect(isWorktreeActivateScopePayload({ scope: 1 })).toBe(false);
    expect(isWorktreeActivateScopePayload({})).toBe(false);
    expect(isWorktreeActivateScopePayload(null)).toBe(false);
  });

  it("builds the activation dispatch body inside the stores seam", () => {
    expect(worktreeActivateScopeDispatch(" scope-a ")).toEqual({
      type: WORKTREE_ACTIVATE_SCOPE_ACTION,
      payload: { scope: "scope-a" },
    });
    expect(() => worktreeActivateScopeDispatch("   ")).toThrow(
      /non-empty scope payload/,
    );
  });
});
