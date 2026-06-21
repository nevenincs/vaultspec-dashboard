// Left-rail context-menu resolvers (W03.P07): each resolver is a PURE function
// of its entity descriptor, so it is tested by calling it directly — no React,
// no rendering, no global state. We assert the action ids and sections each menu
// offers, that every mutating action carries the `disabledInTimeTravel` gate the
// registry applies centrally, that the no-safe-store-path actions are
// disabled-with-reason, and that a directory row omits the file-only actions.

import { describe, expect, it } from "vitest";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { WORKTREE_ACTIVATE_SCOPE_ACTION } from "../../../stores/server/worktreeActions";
import { codeFileMenu } from "./codeFileMenu";
import { vaultDocMenu } from "./vaultDocMenu";
import { workspaceMenu } from "./workspaceMenu";
import { worktreeMenu } from "./worktreeMenu";

const ids = (actions: ActionDescriptor[]) => actions.map((a) => a.id);
const byId = (actions: ActionDescriptor[], id: string) =>
  actions.find((a) => a.id === id);

describe("workspaceMenu", () => {
  it("offers copy path, reveal, and remove-from-registry", () => {
    const actions = workspaceMenu({
      kind: "workspace",
      id: " ws1 ",
      path: " /abs/project ",
      isLaunchDefault: false,
    });
    expect(ids(actions)).toEqual([
      "workspace:copy-path",
      "workspace:reveal",
      "workspace:forget",
    ]);
    expect(byId(actions, "workspace:copy-path")?.section).toBe("copy");
    expect(byId(actions, "workspace:copy-path")?.dispatch?.payload).toEqual({
      text: "/abs/project",
      what: "path",
    });
  });

  it("forget is a destructive, confirm-guarded, time-travel-gated session mutation", () => {
    const action = byId(
      workspaceMenu({ kind: "workspace", id: "ws1", path: "/abs/project" }),
      "workspace:forget",
    );
    expect(action?.section).toBe("danger");
    expect(action?.confirm).toBe(true);
    expect(action?.disabledInTimeTravel).toBe(true);
    expect(action?.disabled).toBeUndefined();
    expect(action?.dispatch).toEqual({
      type: "session:put",
      payload: { forget_workspace: "/abs/project" },
    });
  });

  it("the launch project cannot be removed (disabled-with-reason)", () => {
    const action = byId(
      workspaceMenu({
        kind: "workspace",
        id: "ws1",
        path: "/p",
        isLaunchDefault: true,
      }),
      "workspace:forget",
    );
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("the launch project cannot be removed");
    expect(action?.dispatch).toBeUndefined();
  });

  it("omits copy/reveal when the workspace carries no path; forget is disabled", () => {
    const actions = workspaceMenu({ kind: "workspace", id: "ws1" });
    expect(ids(actions)).toEqual(["workspace:forget"]);
    expect(byId(actions, "workspace:forget")?.disabled).toBe(true);
    expect(byId(actions, "workspace:forget")?.disabledReason).toBe("no project path");
  });

  it("rejects non-workspace entities at resolver ingress", () => {
    expect(workspaceMenu({ kind: "worktree", id: "wt1" })).toEqual([]);
    expect(workspaceMenu(null)).toEqual([]);
  });
});

describe("worktreeMenu", () => {
  it("offers switch-scope (navigate), copy branch, and reveal", () => {
    const actions = worktreeMenu({
      kind: "worktree",
      id: " wt1 ",
      branch: " feature/x ",
      path: " /abs/wt ",
      hasVault: true,
    });
    expect(ids(actions)).toEqual([
      "worktree:switch-scope",
      "worktree:copy-branch",
      "worktree:copy-id",
      "worktree:reveal",
    ]);
    expect(byId(actions, "worktree:switch-scope")?.section).toBe("navigate");
  });

  it("switch-scope is mutating: it carries disabledInTimeTravel and dispatches through the seam", () => {
    const action = byId(
      worktreeMenu({ kind: "worktree", id: "wt1", branch: "b", hasVault: true }),
      "worktree:switch-scope",
    );
    expect(action?.disabledInTimeTravel).toBe(true);
    expect(action?.run).toBeUndefined();
    expect(action?.dispatch).toEqual({
      type: WORKTREE_ACTIVATE_SCOPE_ACTION,
      payload: { scope: "wt1" },
    });
  });

  it("rejects non-worktree entities at resolver ingress", () => {
    expect(worktreeMenu({ kind: "workspace", id: "ws1" })).toEqual([]);
    expect(worktreeMenu(null)).toEqual([]);
  });

  it("switch-scope is disabled-with-reason on a bare (no-vault) worktree", () => {
    const action = byId(
      worktreeMenu({ kind: "worktree", id: "wt1", branch: "b", hasVault: false }),
      "worktree:switch-scope",
    );
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("no vault corpus to switch to");
    expect(action?.run).toBeUndefined();
    expect(action?.dispatch).toBeUndefined();
  });
});

describe("vaultDocMenu", () => {
  it("offers focus, reveal, open-in-editor, copy, relate, and new document", () => {
    const actions = vaultDocMenu({
      kind: "vault-doc",
      id: " doc:my-stem ",
      path: " .vault/adr/my-stem.md ",
      stem: " my-stem ",
      nodeId: " doc:my-stem ",
    });
    expect(ids(actions)).toEqual([
      "vault-doc:focus",
      "vault-doc:reveal",
      "vault-doc:open-in-editor",
      "vault-doc:copy-path",
      "vault-doc:copy-stem",
      "vault-doc:relate",
      "left-rail:new-document",
    ]);
    expect(byId(actions, "vault-doc:focus")?.section).toBe("navigate");
    expect(byId(actions, "vault-doc:copy-stem")?.section).toBe("copy");
    expect(byId(actions, "left-rail:new-document")?.section).toBe("transform");
  });

  it("relate is disabled-with-reason when no document is focused", () => {
    const actions = vaultDocMenu({
      kind: "vault-doc",
      id: "doc:my-stem",
      path: ".vault/adr/my-stem.md",
      stem: "my-stem",
    });
    const relate = byId(actions, "vault-doc:relate");
    expect(relate?.disabled).toBe(true);
    expect(relate?.disabledReason).toBe("focus a document to relate to");
    expect(relate?.dispatch).toBeUndefined();
  });

  it("relate dispatches a link-add op when a DIFFERENT document is focused", () => {
    const actions = vaultDocMenu(
      {
        kind: "vault-doc",
        id: "doc:my-stem",
        path: ".vault/adr/my-stem.md",
        stem: "my-stem",
        scope: "scope-a",
      },
      { timeTravel: false, selectedNodeId: "doc:other-stem" },
    );
    const relate = byId(actions, "vault-doc:relate");
    expect(relate?.disabled).toBeUndefined();
    expect(relate?.disabledInTimeTravel).toBe(true);
    expect(relate?.dispatch).toEqual({
      type: "ops:run",
      payload: {
        target: "core",
        verb: "link-add",
        mode: "link",
        body: { scope: "scope-a", src: "my-stem", dst: "other-stem" },
      },
    });
  });

  it("relate is disabled when the focused node is this same document", () => {
    const actions = vaultDocMenu(
      {
        kind: "vault-doc",
        id: "doc:my-stem",
        path: ".vault/adr/my-stem.md",
        stem: "my-stem",
      },
      { timeTravel: false, selectedNodeId: "doc:my-stem" },
    );
    const relate = byId(actions, "vault-doc:relate");
    expect(relate?.disabled).toBe(true);
    expect(relate?.disabledReason).toBe("already this document");
  });

  it("rejects non-vault-doc entities at resolver ingress", () => {
    expect(vaultDocMenu({ kind: "workspace", id: "ws1" })).toEqual([]);
    expect(vaultDocMenu(null)).toEqual([]);
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
      id: " code:src/main.rs ",
      path: " src/main.rs ",
      isDir: false,
      nodeId: " code:src/main.rs ",
    });
    expect(ids(actions)).toEqual([
      "code-file:focus",
      "code-file:reveal",
      "code-file:open-in-editor",
      "code-file:copy-path",
    ]);
    expect(byId(actions, "code-file:focus")?.run).toBeTypeOf("function");
  });

  it("rejects non-code-file entities at resolver ingress", () => {
    expect(codeFileMenu({ kind: "workspace", id: "ws1" })).toEqual([]);
    expect(codeFileMenu(null)).toEqual([]);
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
