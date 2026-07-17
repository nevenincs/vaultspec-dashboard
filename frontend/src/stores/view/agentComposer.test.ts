// Pure tests for the composer chrome store and its input-destination machine
// (agentic-authoring-ux ADR D2/D4/D6, W02.P02.S10).

import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_COMPOSER_COMMENT_CAP,
  AGENT_COMPOSER_CONTEXT_PREFIX,
  AGENT_COMPOSER_MENTION_CAP,
  agentSubmitDestination,
  buildAgentPrompt,
  buildFeedbackBatchRequest,
  stageAgentComment,
  stageAgentCommentBatch,
  stageAgentInterrupt,
  useAgentComposer,
  type AgentCommentAttachment,
  type AgentMention,
} from "./agentComposer";

const SOURCE = {
  sourceDocument: "node:2026-02-04-editor-demo-plan",
  sourceRevision: "blob-abc",
};

function attachment(
  overrides: Partial<AgentCommentAttachment>,
): AgentCommentAttachment {
  return {
    commentId: "comment:1",
    headingPath: ["Overview"],
    contentStart: 10,
    contentEnd: 20,
    body: "tighten this",
    ...overrides,
  };
}

function resetComposer(): void {
  useAgentComposer.setState({
    mentions: [],
    commentBatch: null,
    pendingInterrupt: null,
  });
}

beforeEach(resetComposer);

describe("agentSubmitDestination", () => {
  it("bootstraps when no session is current", () => {
    expect(
      agentSubmitDestination({
        sessionId: null,
        sessionStatus: null,
        activeRunId: null,
        pendingInterrupt: null,
      }),
    ).toBe("bootstrap");
  });

  it("bootstraps a fresh session when the current one is no longer active", () => {
    // Since D2, only an explicit session cancel makes a session non-active — Stop's
    // run-scoped `cancel_run` leaves it active. A non-active session rejects every
    // further turn, so the next submit opens a new session.
    expect(
      agentSubmitDestination({
        sessionId: "session:a",
        sessionStatus: "cancelled",
        activeRunId: null,
        pendingInterrupt: null,
      }),
    ).toBe("bootstrap");
  });

  it("starts a turn when the session has no live run", () => {
    expect(
      agentSubmitDestination({
        sessionId: "session:a",
        sessionStatus: "active",
        activeRunId: null,
        pendingInterrupt: null,
      }),
    ).toBe("turn");
  });

  it("queues while a run streams without a parked interrupt", () => {
    expect(
      agentSubmitDestination({
        sessionId: "session:a",
        sessionStatus: "active",
        activeRunId: "run:1",
        pendingInterrupt: null,
      }),
    ).toBe("queue");
  });

  it("steers when the live run is parked on its staged interrupt", () => {
    expect(
      agentSubmitDestination({
        sessionId: "session:a",
        sessionStatus: "active",
        activeRunId: "run:1",
        pendingInterrupt: { interruptId: "int:1", runId: "run:1" },
      }),
    ).toBe("steer");
    // A run-agnostic staged interrupt also steers the live run.
    expect(
      agentSubmitDestination({
        sessionId: "session:a",
        sessionStatus: "active",
        activeRunId: "run:1",
        pendingInterrupt: { interruptId: "int:1", runId: null },
      }),
    ).toBe("steer");
  });

  it("never steers a run the interrupt does not belong to", () => {
    expect(
      agentSubmitDestination({
        sessionId: "session:a",
        sessionStatus: "active",
        activeRunId: "run:2",
        pendingInterrupt: { interruptId: "int:1", runId: "run:1" },
      }),
    ).toBe("queue");
  });
});

describe("buildAgentPrompt", () => {
  const mentions: AgentMention[] = [
    { kind: "document", value: "2026-02-04-editor-demo-plan", label: "Editor demo" },
    { kind: "feature", value: "editor-demo", label: "editor-demo" },
  ];

  it("returns the trimmed text unchanged without mentions", () => {
    expect(buildAgentPrompt("  hello  ", [])).toBe("hello");
  });

  it("serializes mentions as one deterministic trailing context line", () => {
    expect(buildAgentPrompt("hello", mentions)).toBe(
      `hello\n\n${AGENT_COMPOSER_CONTEXT_PREFIX} [[2026-02-04-editor-demo-plan]] #editor-demo`,
    );
  });

  it("emits only the context line when the text is empty", () => {
    expect(buildAgentPrompt("", mentions)).toBe(
      `${AGENT_COMPOSER_CONTEXT_PREFIX} [[2026-02-04-editor-demo-plan]] #editor-demo`,
    );
  });

  it("no longer serializes staged comments into the prompt text", () => {
    // Structured continuation (ADR D4): comments ride a feedback batch id on the
    // turn, not the prompt string. buildAgentPrompt takes only text + mentions.
    expect(buildAgentPrompt("revise", mentions)).toBe(
      `revise\n\n${AGENT_COMPOSER_CONTEXT_PREFIX} [[2026-02-04-editor-demo-plan]] #editor-demo`,
    );
  });
});

describe("buildFeedbackBatchRequest", () => {
  it("maps a staged single-document batch onto the engine create payload", () => {
    const batch = {
      ...SOURCE,
      comments: [
        attachment({
          commentId: "c1",
          headingPath: ["Intro"],
          contentStart: 5,
          contentEnd: 9,
          body: "clarify scope",
        }),
        attachment({
          commentId: "c2",
          headingPath: ["Design", "Risks"],
          contentStart: 40,
          contentEnd: 62,
          body: "add a fallback",
        }),
      ],
    };
    expect(buildFeedbackBatchRequest(batch, "session:x")).toEqual({
      session_id: "session:x",
      source_document: SOURCE.sourceDocument,
      source_revision: SOURCE.sourceRevision,
      items: [
        {
          comment_id: "c1",
          body: "clarify scope",
          anchor: { heading_path: ["Intro"], content_start: 5, content_end: 9 },
        },
        {
          comment_id: "c2",
          body: "add a fallback",
          anchor: {
            heading_path: ["Design", "Risks"],
            content_start: 40,
            content_end: 62,
          },
        },
      ],
    });
  });

  it("returns null for an absent or empty batch (nothing to freeze)", () => {
    expect(buildFeedbackBatchRequest(null, "session:x")).toBeNull();
    expect(
      buildFeedbackBatchRequest({ ...SOURCE, comments: [] }, "session:x"),
    ).toBeNull();
  });
});

describe("composer store bounds", () => {
  it("caps mentions and de-duplicates by value", () => {
    const add = useAgentComposer.getState().addMention;
    for (let i = 0; i < AGENT_COMPOSER_MENTION_CAP + 5; i += 1) {
      add({ kind: "feature", value: `tag-${i}`, label: `tag-${i}` });
    }
    expect(useAgentComposer.getState().mentions).toHaveLength(
      AGENT_COMPOSER_MENTION_CAP,
    );
    add({ kind: "feature", value: "tag-0", label: "tag-0" });
    expect(
      useAgentComposer.getState().mentions.filter((m) => m.value === "tag-0"),
    ).toHaveLength(1);
  });

  // The client one-slot queued prompt was removed (S39): a mid-run submit now
  // dispatches the turn and the engine enqueues it server-side (`queued_turn_ids`),
  // so the composer store no longer holds a queue slot.

  it("appends comments to the pending batch, upserts by id, and bounds the set", () => {
    stageAgentComment(attachment({ commentId: "c1", body: "first note" }), SOURCE);
    stageAgentComment(attachment({ commentId: "c2" }), SOURCE);
    // Re-staging c1 UPSERTS in place: the set stays at 2 (no duplicate) but the
    // body refreshes to the latest (an edit after staging must not freeze stale).
    stageAgentComment(attachment({ commentId: "c1", body: "edited note" }), SOURCE);
    const batch = useAgentComposer.getState().commentBatch!;
    expect(batch.sourceDocument).toBe(SOURCE.sourceDocument);
    expect(batch.sourceRevision).toBe(SOURCE.sourceRevision);
    expect(batch.comments).toHaveLength(2);
    expect(batch.comments[0]).toMatchObject({ commentId: "c1", body: "edited note" });
    expect(batch.comments[1]!.commentId).toBe("c2");

    for (let i = 0; i < AGENT_COMPOSER_COMMENT_CAP + 5; i += 1) {
      stageAgentComment(attachment({ commentId: `bulk-${i}` }), SOURCE);
    }
    expect(useAgentComposer.getState().commentBatch?.comments).toHaveLength(
      AGENT_COMPOSER_COMMENT_CAP,
    );
  });

  it("resets the batch to the new document when staging from a different source", () => {
    // Single-document invariant: a turn carries one feedback_batch_id, so staging a
    // comment from a different document (or revision) starts a fresh batch
    // (latest-document-wins) rather than mixing documents into one batch.
    stageAgentComment(attachment({ commentId: "a1" }), SOURCE);
    stageAgentComment(attachment({ commentId: "a2" }), SOURCE);
    expect(useAgentComposer.getState().commentBatch?.comments).toHaveLength(2);

    const other = { sourceDocument: "node:other-doc", sourceRevision: "blob-zzz" };
    stageAgentComment(attachment({ commentId: "b1" }), other);
    const batch = useAgentComposer.getState().commentBatch!;
    expect(batch.sourceDocument).toBe("node:other-doc");
    expect(batch.sourceRevision).toBe("blob-zzz");
    expect(batch.comments.map((c) => c.commentId)).toEqual(["b1"]);
  });

  it("clears the whole staged batch through the batch seam", () => {
    stageAgentComment(attachment({ commentId: "c1" }), SOURCE);
    expect(useAgentComposer.getState().commentBatch).not.toBeNull();
    stageAgentCommentBatch(null);
    expect(useAgentComposer.getState().commentBatch).toBeNull();
  });

  it("stages and clears the interrupt through the seam", () => {
    stageAgentInterrupt({ interruptId: "int:1", runId: "run:1" });
    expect(useAgentComposer.getState().pendingInterrupt).toEqual({
      interruptId: "int:1",
      runId: "run:1",
    });
    stageAgentInterrupt(null);
    expect(useAgentComposer.getState().pendingInterrupt).toBeNull();
  });
});
