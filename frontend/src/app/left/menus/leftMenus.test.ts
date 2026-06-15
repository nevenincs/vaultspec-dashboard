// Left-rail context-menu resolvers (W03.P07): each resolver is a PURE function
// of its entity descriptor, so it is tested by calling it directly — no React,
// no rendering, no global state. We assert the action ids and sections each menu
// offers, that every mutating action carries the `disabledInTimeTravel` gate the
// registry applies centrally, that the no-safe-store-path actions are
// disabled-with-reason, and that a directory row omits the file-only actions.

import { describe, expect, it } from "vitest";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { codeFileMenu } from "./codeFileMenu";
import { vaultDocMenu } from "./vaultDocMenu";
import { workspaceMenu } from "./workspaceMenu";
import { worktreeMenu } from "./worktreeMenu";

const ids = (actions: ActionDescriptor[]) => actions.map((a) => a.id);
const byId = (actions: ActionDescriptor[], id: string) =>
  actions.find((a) => a.id === id);

describe("workspaceMenu", () => {
  it("offers set-launch-default (transform), copy path, and reveal", () => {
    const actions = workspaceMenu({
      kind: "workspace",
      id: "ws1",
      path: "/abs/project",
      isLaunchDefault: false,
    });
    expect(ids(actions)).toEqual([
      "workspace:set-launch-default",
      "workspace:copy-path",
      "workspace:reveal",
    ]);
    expect(byId(actions, "workspace:set-launch-default")?.section).toBe("transform");
    expect(byId(actions, "workspace:copy-path")?.section).toBe("copy");
  });

  it("set-launch-default is mutating: it carries disabledInTimeTravel", () => {
    const action = byId(
      workspaceMenu({ kind: "workspace", id: "ws1", path: "/p" }),
      "workspace:set-launch-default",
    );
    expect(action?.disabledInTimeTravel).toBe(true);
  });

  it("set-launch-default is disabled-with-reason (no safe store path)", () => {
    const action = byId(
      workspaceMenu({ kind: "workspace", id: "ws1", path: "/p" }),
      "workspace:set-launch-default",
    );
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("no-op pending host");
    expect(action?.run).toBeUndefined();
  });

  it("notes 'already the launch default' when the root is the default", () => {
    const action = byId(
      workspaceMenu({
        kind: "workspace",
        id: "ws1",
        path: "/p",
        isLaunchDefault: true,
      }),
      "workspace:set-launch-default",
    );
    expect(action?.disabledReason).toBe("already the launch default");
  });

  it("omits copy/reveal when the workspace carries no path", () => {
    expect(ids(workspaceMenu({ kind: "workspace", id: "ws1" }))).toEqual([
      "workspace:set-launch-default",
    ]);
  });
});

describe("worktreeMenu", () => {
  it("offers switch-scope (navigate), copy branch, and reveal", () => {
    const actions = worktreeMenu({
      kind: "worktree",
      id: "wt1",
      branch: "feature/x",
      path: "/abs/wt",
      hasVault: true,
    });
    expect(ids(actions)).toEqual([
      "worktree:switch-scope",
      "worktree:copy-branch",
      "worktree:reveal",
    ]);
    expect(byId(actions, "worktree:switch-scope")?.section).toBe("navigate");
  });

  it("switch-scope is mutating: it carries disabledInTimeTravel and a run", () => {
    const action = byId(
      worktreeMenu({ kind: "worktree", id: "wt1", branch: "b", hasVault: true }),
      "worktree:switch-scope",
    );
    expect(action?.disabledInTimeTravel).toBe(true);
    expect(typeof action?.run).toBe("function");
  });

  it("switch-scope is disabled-with-reason on a bare (no-vault) worktree", () => {
    const action = byId(
      worktreeMenu({ kind: "worktree", id: "wt1", branch: "b", hasVault: false }),
      "worktree:switch-scope",
    );
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("no vault corpus to switch to");
    expect(action?.run).toBeUndefined();
  });
});

describe("vaultDocMenu", () => {
  it("offers focus, reveal, open-in-editor, copy path, and copy stem", () => {
    const actions = vaultDocMenu({
      kind: "vault-doc",
      id: "doc:my-stem",
      path: ".vault/adr/my-stem.md",
      stem: "my-stem",
      nodeId: "doc:my-stem",
    });
    expect(ids(actions)).toEqual([
      "vault-doc:focus",
      "vault-doc:reveal",
      "vault-doc:open-in-editor",
      "vault-doc:copy-path",
      "vault-doc:copy-stem",
    ]);
    expect(byId(actions, "vault-doc:focus")?.section).toBe("navigate");
    expect(byId(actions, "vault-doc:copy-stem")?.section).toBe("copy");
  });

  it("focus is navigation, not mutating: no disabledInTimeTravel", () => {
    const action = byId(
      vaultDocMenu({
        kind: "vault-doc",
        id: "doc:s",
        path: "p.md",
        stem: "s",
      }),
      "vault-doc:focus",
    );
    expect(action?.disabledInTimeTravel).toBeUndefined();
    expect(typeof action?.run).toBe("function");
  });
});

describe("codeFileMenu", () => {
  it("a file offers focus, reveal, open-in-editor, and copy path", () => {
    const actions = codeFileMenu({
      kind: "code-file",
      id: "code:src/main.rs",
      path: "src/main.rs",
      isDir: false,
      nodeId: "code:src/main.rs",
    });
    expect(ids(actions)).toEqual([
      "code-file:focus",
      "code-file:reveal",
      "code-file:open-in-editor",
      "code-file:copy-path",
    ]);
    expect(byId(actions, "code-file:focus")?.run).toBeTypeOf("function");
  });

  it("a file with no linked node disables focus with a reason", () => {
    const action = byId(
      codeFileMenu({
        kind: "code-file",
        id: "code:src/main.rs",
        path: "src/main.rs",
        isDir: false,
      }),
      "code-file:focus",
    );
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("no graph node for this file yet");
    expect(action?.run).toBeUndefined();
  });

  it("a directory omits focus and open-in-editor", () => {
    const actions = codeFileMenu({
      kind: "code-file",
      id: "code:src",
      path: "src",
      isDir: true,
      nodeId: "code:src",
    });
    expect(ids(actions)).toEqual(["code-file:reveal", "code-file:copy-path"]);
    expect(byId(actions, "code-file:focus")).toBeUndefined();
    expect(byId(actions, "code-file:open-in-editor")).toBeUndefined();
  });

  it("focus is navigation, not mutating: no disabledInTimeTravel", () => {
    const action = byId(
      codeFileMenu({
        kind: "code-file",
        id: "code:f",
        path: "f",
        isDir: false,
        nodeId: "code:f",
      }),
      "code-file:focus",
    );
    expect(action?.disabledInTimeTravel).toBeUndefined();
  });
});
