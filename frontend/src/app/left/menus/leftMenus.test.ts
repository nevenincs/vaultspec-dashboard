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
import { vaultCategoryMenu } from "./vaultCategoryMenu";
import { vaultDocMenu } from "./vaultDocMenu";
import { vaultFeatureMenu } from "./vaultFeatureMenu";
import { vaultSectionMenu } from "./vaultSectionMenu";
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

describe("vaultFeatureMenu", () => {
  it("offers focus, expand, filter, new-document, autofix, copy-tag, and archive", () => {
    const actions = vaultFeatureMenu({
      kind: "vault-feature",
      id: "vault-feature:my-feature",
      feature: " my-feature ",
      scope: "scope-a",
      nodeId: " feature:my-feature ",
      expansionKey: " feat:my-feature ",
      expanded: false,
    });
    expect(ids(actions)).toEqual([
      "vault-feature:focus",
      "vault-feature:toggle",
      "vault-feature:filter",
      "left-rail:new-document",
      "vault-feature:autofix",
      "vault-feature:copy-tag",
      "vault-feature:archive",
    ]);
    expect(byId(actions, "vault-feature:focus")?.section).toBe("navigate");
    expect(byId(actions, "vault-feature:toggle")?.label).toBe("Expand feature");
    expect(byId(actions, "vault-feature:filter")?.section).toBe("navigate");
    expect(byId(actions, "vault-feature:filter")?.run).toBeTypeOf("function");
    expect(byId(actions, "vault-feature:filter")?.disabledInTimeTravel).toBeUndefined();
    expect(byId(actions, "left-rail:new-document")?.section).toBe("transform");
    expect(byId(actions, "vault-feature:copy-tag")?.section).toBe("copy");
  });

  it("toggle reads Collapse when the folder is expanded", () => {
    const action = byId(
      vaultFeatureMenu({
        kind: "vault-feature",
        id: "vault-feature:f",
        feature: "f",
        expansionKey: "feat:f",
        expanded: true,
      }),
      "vault-feature:toggle",
    );
    expect(action?.label).toBe("Collapse feature");
    expect(action?.disabledInTimeTravel).toBeUndefined();
  });

  it("focus is disabled-with-reason when the feature has no graph node yet", () => {
    const action = byId(
      vaultFeatureMenu({ kind: "vault-feature", id: "vault-feature:f", feature: "f" }),
      "vault-feature:focus",
    );
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("no graph node for this feature yet");
    expect(action?.run).toBeUndefined();
  });

  it("omits the toggle when no expansion key is carried", () => {
    const actions = vaultFeatureMenu({
      kind: "vault-feature",
      id: "vault-feature:f",
      feature: "f",
      nodeId: "feature:f",
    });
    expect(byId(actions, "vault-feature:toggle")).toBeUndefined();
  });

  it("autofix and archive are confirm-guarded, time-travel-gated feature mutations", () => {
    const actions = vaultFeatureMenu({
      kind: "vault-feature",
      id: "vault-feature:f",
      feature: "f",
      scope: "scope-a",
    });
    const autofix = byId(actions, "vault-feature:autofix");
    expect(autofix?.section).toBe("transform");
    expect(autofix?.confirm).toBe(true);
    expect(autofix?.disabledInTimeTravel).toBe(true);
    const archive = byId(actions, "vault-feature:archive");
    expect(archive?.section).toBe("danger");
    expect(archive?.confirm).toBe(true);
    expect(archive?.disabledInTimeTravel).toBe(true);
  });

  it("rejects non-vault-feature entities at resolver ingress", () => {
    expect(vaultFeatureMenu({ kind: "vault-doc", id: "doc:x" })).toEqual([]);
    expect(vaultFeatureMenu(null)).toEqual([]);
  });
});

describe("vaultCategoryMenu", () => {
  it("a feature sub-folder offers expand, filter, new-document, and copy category", () => {
    const actions = vaultCategoryMenu({
      kind: "vault-category",
      id: "vault-category:featcat:f:adr",
      docType: "adr",
      feature: "f",
      scope: "scope-a",
      expansionKey: "featcat:f:adr",
      expanded: false,
    });
    expect(ids(actions)).toEqual([
      "vault-category:toggle",
      "vault-category:filter",
      "left-rail:new-document",
      "vault-category:copy-category",
    ]);
    expect(byId(actions, "vault-category:toggle")?.label).toBe("Expand category");
    expect(byId(actions, "vault-category:filter")?.label).toBe("Filter to this type");
    expect(byId(actions, "vault-category:filter")?.section).toBe("navigate");
    expect(byId(actions, "vault-category:copy-category")?.section).toBe("copy");
  });

  it("omits the toggle when no expansion key is carried, keeps filter + new-doc + copy", () => {
    const actions = vaultCategoryMenu({
      kind: "vault-category",
      id: "vault-category:type:plan",
      docType: "plan",
    });
    expect(ids(actions)).toEqual([
      "vault-category:filter",
      "left-rail:new-document",
      "vault-category:copy-category",
    ]);
  });

  it("none of the category verbs are mutating (no time-travel gate)", () => {
    const actions = vaultCategoryMenu({
      kind: "vault-category",
      id: "vault-category:type:adr",
      docType: "adr",
      expansionKey: "type:adr",
      expanded: true,
    });
    for (const action of actions) {
      expect(action.disabledInTimeTravel).toBeUndefined();
    }
    expect(byId(actions, "vault-category:toggle")?.label).toBe("Collapse category");
  });

  it("rejects non-vault-category entities at resolver ingress", () => {
    expect(vaultCategoryMenu({ kind: "vault-doc", id: "doc:x" })).toEqual([]);
    expect(vaultCategoryMenu(null)).toEqual([]);
  });
});

describe("vaultSectionMenu", () => {
  it("offers expand/collapse, the sort plane, the filter resets, and new document", () => {
    const actions = vaultSectionMenu({
      kind: "vault-section",
      id: "vault-section:features",
      section: "features",
      scope: "scope-a",
    });
    expect(ids(actions)).toEqual([
      "left-rail:expand-tree",
      "left-rail:collapse-tree",
      // The sort plane + resets (left-rail-tree-controls ADR D3/D4): the SAME
      // shared builders the keymap chords and the palette fire.
      "left-rail:sort-recency",
      "left-rail:sort-name",
      "left-rail:sort-created",
      "left-rail:sort-modified",
      "left-rail:sort-size",
      "left-rail:reset-sorting",
      "left-rail:toggle-facets",
      "left-rail:reset-filters",
      "left-rail:clear-filter",
      "left-rail:new-document",
    ]);
    expect(byId(actions, "left-rail:expand-tree")?.section).toBe("navigate");
    expect(byId(actions, "left-rail:collapse-tree")?.section).toBe("navigate");
    expect(byId(actions, "left-rail:sort-name")?.section).toBe("navigate");
    expect(byId(actions, "left-rail:reset-sorting")?.section).toBe("navigate");
    expect(byId(actions, "left-rail:reset-filters")?.section).toBe("navigate");
    expect(byId(actions, "left-rail:new-document")?.section).toBe("transform");
  });

  it("rejects an unknown section name and non-section entities at ingress", () => {
    expect(
      vaultSectionMenu({ kind: "vault-section", id: "x", section: "bogus" }),
    ).toEqual([]);
    expect(vaultSectionMenu({ kind: "vault-doc", id: "doc:x" })).toEqual([]);
    expect(vaultSectionMenu(null)).toEqual([]);
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
