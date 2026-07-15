// Unit tests for the reader comment plane helpers + the section-comment action
// descriptor (authoring-surface W02.P05.S17). Pure: the action-plane law (one
// descriptor, one stable id, one runnable lane) and the section↔comment narrowing
// are asserted without a DOM.

import { describe, expect, it } from "vitest";

import { isRunnable } from "../../platform/actions/action";
import type { ServedComment } from "../../stores/server/authoring";
import type { HeadingBlock } from "./sectionAnchor";
import {
  COMMENT_SECTION_ACTION_ID,
  anchoredCommentsForBlock,
  commentSectionAction,
  orphanedComments,
} from "./readerComments";

function anchoredComment(id: string, headingPath: string[]): ServedComment {
  return {
    comment: {
      schema_version: "authoring.comment.v1",
      comment_id: id,
      document: { node_id: "doc:x" },
      selector: { heading_path: headingPath, expected_content_hash: "hash" },
      body: "note",
      author: { id: "human:editor", kind: "human" },
      resolved: false,
      created_at_ms: 1,
      updated_at_ms: 1,
    },
    anchor: {
      state: "anchored",
      heading_path: headingPath,
      content_start: 0,
      content_end: 1,
    },
    orphaned: false,
  };
}

function orphanedComment(id: string): ServedComment {
  return {
    comment: {
      schema_version: "authoring.comment.v1",
      comment_id: id,
      document: { node_id: "doc:x" },
      selector: { heading_path: ["Gone"], expected_content_hash: "hash" },
      body: "stale note",
      author: { id: "human:editor", kind: "human" },
      resolved: false,
      created_at_ms: 1,
      updated_at_ms: 1,
    },
    anchor: {
      state: "orphaned",
      evidence: { reason: "missing_anchor", heading_path: ["Gone"] },
    },
    orphaned: true,
  };
}

const block: HeadingBlock = {
  path: ["Title", "Alpha"],
  level: 2,
  sectionText: "## Alpha\n\nbody\n",
};

describe("commentSectionAction (action-plane enrollment)", () => {
  it("is one runnable descriptor under the single stable section-comment id", () => {
    let openCount = 0;
    const onOpen = () => {
      openCount += 1;
    };
    const action = commentSectionAction({ hasComments: false, onOpen });
    expect(action.id).toBe(COMMENT_SECTION_ACTION_ID);
    expect(action.section).toBe("transform");
    expect(action.icon).toBeDefined();
    expect(isRunnable(action)).toBe(true);
    action.run?.();
    expect(openCount).toBe(1);
  });

  it("keeps the id stable while only reshaping the label for existing comments", () => {
    const add = commentSectionAction({ hasComments: false, onOpen: () => undefined });
    const open = commentSectionAction({ hasComments: true, onOpen: () => undefined });
    expect(add.id).toBe(open.id);
    expect(add.label).toEqual({ key: "documents:actions.addComment" });
    expect(open.label).toEqual({ key: "documents:actions.openComments" });
  });
});

describe("section ↔ comment narrowing", () => {
  it("returns only the ANCHORED comments whose heading path matches the block", () => {
    const comments = [
      anchoredComment("a", ["Title", "Alpha"]),
      anchoredComment("b", ["Title", "Beta"]),
      orphanedComment("c"),
    ];
    const forAlpha = anchoredCommentsForBlock(comments, block);
    expect(forAlpha.map((s) => s.comment.comment_id)).toEqual(["a"]);
  });

  it("collects every orphaned comment for the doc-level panel", () => {
    const comments = [anchoredComment("a", ["Title", "Alpha"]), orphanedComment("c")];
    expect(orphanedComments(comments).map((s) => s.comment.comment_id)).toEqual(["c"]);
  });
});
