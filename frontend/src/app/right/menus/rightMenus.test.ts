// Right-rail context-menu resolvers (W03.P08): each resolver is a PURE function
// of its entity descriptor, so it is tested by calling it directly — no DOM, no
// store, no host. The assertions pin the action ids/sections, the
// `disabledInTimeTravel` mark on every MUTATING action (the registry gate keys on
// it), and the conditional disables/omissions the descriptor's optional fields
// drive (no title, no relation/dst, no nodeId, no score, no hunk).

import { describe, expect, it } from "vitest";

import type { ChangeEntity } from "../../../platform/actions/entity";
import { changeMenu } from "./changeMenu";
import { commitMenu } from "./commitMenu";
import { prMenu } from "./prMenu";
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
      "search-result:open",
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

describe("commitMenu", () => {
  const commit = {
    kind: "commit" as const,
    id: "0123456789abcdef0123456789abcdef01234567",
    shortHash: "01234567",
    subject: "feat: a thing",
  };

  it("offers the three read-only copy verbs for a full commit", () => {
    expect(byId(commitMenu(commit))).toEqual([
      "commit:copy-hash",
      "commit:copy-short-hash",
      "commit:copy-subject",
    ]);
  });

  it("carries only read-only copy verbs - none is time-travel gated", () => {
    for (const action of commitMenu(commit)) {
      expect(action.section).toBe("copy");
      expect(action.disabledInTimeTravel).toBeUndefined();
    }
  });

  it("copies the full hash from the descriptor id via the copy dispatch lane", () => {
    const copyHash = find(commitMenu(commit), "commit:copy-hash");
    expect(copyHash.dispatch).toBeDefined();
    expect(JSON.stringify(copyHash.dispatch)).toContain(commit.id);
  });

  it("omits short-hash and subject copies when those fields are absent", () => {
    expect(byId(commitMenu({ kind: "commit", id: "abc1230000" }))).toEqual([
      "commit:copy-hash",
    ]);
  });

  it("returns nothing for a non-commit entity", () => {
    expect(commitMenu({ kind: "change", id: "c1", path: "a.ts" })).toEqual([]);
  });
});

describe("prMenu", () => {
  const pr = {
    kind: "pull-request" as const,
    id: "42",
    title: "Fix the thing",
    url: "https://example.com/pr/42",
  };

  it("offers open, copy-link, and copy-number for a PR with a url", () => {
    expect(byId(prMenu(pr))).toEqual([
      "pull-request:open",
      "pull-request:copy-url",
      "pull-request:copy-number",
    ]);
  });

  it("open is a non-mutating navigate verb (not time-travel gated)", () => {
    const open = find(prMenu(pr), "pull-request:open");
    expect(open.section).toBe("navigate");
    expect(open.disabled).toBeUndefined();
    expect(open.disabledInTimeTravel).toBeUndefined();
    expect(typeof open.run).toBe("function");
  });

  it("disables open with a reason and drops copy-link when the PR has no url", () => {
    const noUrl = prMenu({ kind: "pull-request", id: "7" });
    expect(byId(noUrl)).toEqual(["pull-request:open", "pull-request:copy-number"]);
    expect(find(noUrl, "pull-request:open").disabled).toBe(true);
    expect(find(noUrl, "pull-request:open").disabledReason).toBe("no remote link");
  });

  it("copies the PR number from the descriptor id", () => {
    const copyNumber = find(prMenu(pr), "pull-request:copy-number");
    expect(JSON.stringify(copyNumber.dispatch)).toContain("42");
  });

  it("returns nothing for a non-PR entity", () => {
    expect(prMenu({ kind: "commit", id: "abc" })).toEqual([]);
  });
});
