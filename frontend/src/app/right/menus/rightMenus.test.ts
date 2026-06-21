// Right-rail context-menu resolvers (W03.P08): each resolver is a PURE function
// of its entity descriptor, so it is tested by calling it directly — no DOM, no
// store, no host. The assertions pin the action ids/sections, the
// `disabledInTimeTravel` mark on every MUTATING action (the registry gate keys on
// it), and the conditional disables/omissions the descriptor's optional fields
// drive (no title, no relation/dst, no nodeId, no score, no hunk).

import { describe, expect, it } from "vitest";

import type { ChangeEntity } from "../../../platform/actions/entity";
import { changeMenu } from "./changeMenu";
import { edgeMenu } from "./edgeMenu";
import { searchResultMenu } from "./searchResultMenu";

const byId = (actions: { id: string }[]) => actions.map((a) => a.id);
const find = <T extends { id: string }>(actions: T[], id: string): T => {
  const found = actions.find((a) => a.id === id);
  if (!found) throw new Error(`no action ${id} in [${byId(actions).join(", ")}]`);
  return found;
};

describe("edgeMenu", () => {
  const full = {
    kind: "edge",
    id: " e1 ",
    relation: " references ",
    dst: " doc:beta ",
    tier: "structural",
  };

  it("offers highlight, goto-destination, the three copies, and copy-full", () => {
    expect(byId(edgeMenu(full))).toEqual([
      "edge:highlight",
      "edge:goto-destination",
      "edge:copy-id",
      "edge:copy-relation",
      "edge:copy-destination",
      "edge:copy-full",
    ]);
  });

  it("highlight is a non-mutating navigate selection (not gated)", () => {
    const highlight = find(edgeMenu(full), "edge:highlight");
    expect(highlight.section).toBe("navigate");
    expect(highlight.disabledInTimeTravel).toBeUndefined();
  });

  it("rejects non-edge entities at the resolver ingress", () => {
    expect(edgeMenu({ kind: "node", id: "doc:a" })).toEqual([]);
    expect(edgeMenu(null)).toEqual([]);
  });

  it("disables copy-relation / copy-destination with reasons when absent", () => {
    const bare = edgeMenu({ kind: "edge", id: "e1" });
    const rel = find(bare, "edge:copy-relation");
    const dst = find(bare, "edge:copy-destination");
    expect(rel.disabled).toBe(true);
    expect(rel.disabledReason).toBe("no relation");
    expect(dst.disabled).toBe(true);
    expect(dst.disabledReason).toBe("no destination");
    // copy-id is always available — the edge always has an id.
    expect(find(bare, "edge:copy-id").disabled).toBeUndefined();
  });
});

describe("searchResultMenu", () => {
  const code = {
    kind: "search-result",
    id: " code:src/x.ts ",
    source: " src/x.ts ",
    nodeId: " code:src/x.ts ",
    score: 0.91,
    isCode: true,
  };

  it("offers focus / open-editor / reveal / copies for a code result", () => {
    expect(byId(searchResultMenu(code))).toEqual([
      "search-result:focus",
      "search-result:open-editor",
      "search-result:reveal",
      "search-result:copy-source",
      "search-result:copy-score",
      "search-result:copy-full",
    ]);
  });

  it("focus is a non-mutating navigate selection (not gated)", () => {
    const focus = find(searchResultMenu(code), "search-result:focus");
    expect(focus.section).toBe("navigate");
    expect(focus.disabledInTimeTravel).toBeUndefined();
  });

  it("normalizes runtime search-result descriptors before building actions", () => {
    const actions = searchResultMenu(code);

    expect(find(actions, "search-result:open-editor")).toMatchObject({
      dispatch: { payload: { path: "src/x.ts" } },
    });
    expect(find(actions, "search-result:reveal")).toMatchObject({
      dispatch: { payload: { path: "src/x.ts" } },
    });
    expect(find(actions, "search-result:copy-source")).toMatchObject({
      dispatch: { payload: { text: "src/x.ts", what: "path" } },
    });
    expect(find(actions, "search-result:copy-score")).toMatchObject({
      dispatch: { payload: { text: "0.91" } },
    });
  });

  it("disables focus with a reason when there is no node id", () => {
    const noNode = searchResultMenu({
      kind: "search-result",
      id: "src/x.ts",
      source: "src/x.ts",
      score: 0.5,
      isCode: true,
    });
    const focus = find(noNode, "search-result:focus");
    expect(focus.disabled).toBe(true);
    expect(focus.disabledReason).toBe("no graph node");
  });

  it("omits open-in-editor for a non-code (vault) result", () => {
    const vault = searchResultMenu({
      kind: "search-result",
      id: "doc:a",
      source: "notes/a.md",
      nodeId: "doc:a",
      score: 0.7,
      isCode: false,
    });
    expect(byId(vault)).not.toContain("search-result:open-editor");
  });

  it("disables copy-score with a reason when there is no score", () => {
    const noScore = searchResultMenu({
      kind: "search-result",
      id: "doc:a",
      source: "notes/a.md",
      nodeId: "doc:a",
      isCode: false,
    });
    const score = find(noScore, "search-result:copy-score");
    expect(score.disabled).toBe(true);
    expect(score.disabledReason).toBe("no score");
  });

  it("rejects malformed and non-search-result entities at resolver ingress", () => {
    expect(
      searchResultMenu({ kind: "search-result", id: "r1", source: "   " }),
    ).toEqual([]);
    expect(searchResultMenu({ kind: "node", id: "doc:a" })).toEqual([]);
    expect(searchResultMenu(null)).toEqual([]);
  });
});

describe("changeMenu", () => {
  it("offers open-editor / reveal / copy-path / copy-hunk for a hunk", () => {
    const hunk: ChangeEntity = {
      kind: "change",
      id: "src/x.ts:0",
      path: "src/x.ts",
      hunk: "@@ -1 +1 @@\n-old\n+new",
    };
    expect(byId(changeMenu(hunk))).toEqual([
      "change:open-editor",
      "change:reveal",
      "change:copy-path",
      "change:copy-hunk",
    ]);
    expect(find(changeMenu(hunk), "change:copy-path").section).toBe("copy");
  });

  it("omits copy-hunk for a whole-file change (no hunk)", () => {
    const file: ChangeEntity = { kind: "change", id: "src/x.ts", path: "src/x.ts" };
    expect(byId(changeMenu(file))).not.toContain("change:copy-hunk");
  });

  it("normalizes runtime change descriptors before building actions", () => {
    const actions = changeMenu({
      kind: "change",
      id: " change-1 ",
      path: " src/x.ts ",
      hunk: " @@ -1 +1 @@\n-old\n+new ",
    });

    expect(find(actions, "change:open-editor")).toMatchObject({
      dispatch: { payload: { path: "src/x.ts" } },
    });
    expect(find(actions, "change:reveal")).toMatchObject({
      dispatch: { payload: { path: "src/x.ts" } },
    });
    expect(find(actions, "change:copy-path")).toMatchObject({
      section: "copy",
      dispatch: { payload: { text: "src/x.ts", what: "path" } },
    });
    expect(find(actions, "change:copy-hunk")).toMatchObject({
      dispatch: { payload: { text: "@@ -1 +1 @@\n-old\n+new" } },
    });
    expect(byId(changeMenu({ kind: "change", id: "x", path: "   " }))).toEqual([]);
    expect(byId(changeMenu({ kind: "node", id: "doc:x", path: "src/x.ts" }))).toEqual(
      [],
    );
  });

  it("writes NO git verb (read-and-infer): only navigate/copy actions exist", () => {
    const file: ChangeEntity = { kind: "change", id: "src/x.ts", path: "src/x.ts" };
    for (const action of changeMenu(file)) {
      expect(action.section === "navigate" || action.section === "copy").toBe(true);
    }
  });
});
