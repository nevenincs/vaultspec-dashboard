// Pure tests for the composer chrome store and its input-destination machine
// (agentic-authoring-ux ADR D2/D4/D6, W02.P02.S10).

import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_COMPOSER_COMMENT_CAP,
  AGENT_COMPOSER_COMMENTS_PREFIX,
  AGENT_COMPOSER_CONTEXT_PREFIX,
  AGENT_COMPOSER_MENTION_CAP,
  agentSubmitDestination,
  buildAgentPrompt,
  serializeCommentBatch,
  stageAgentComment,
  stageAgentCommentBatch,
  stageAgentInterrupt,
  useAgentComposer,
  type AgentCommentAttachment,
  type AgentMention,
} from "./agentComposer";

function attachment(
  overrides: Partial<AgentCommentAttachment>,
): AgentCommentAttachment {
  return {
    commentId: "comment:1",
    docStem: "2026-02-04-editor-demo-plan",
    headingPath: ["Overview"],
    body: "tighten this",
    ...overrides,
  };
}

function resetComposer(): void {
  useAgentComposer.setState({
    mentions: [],
    commentBatch: null,
    queuedPrompt: null,
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

  it("serializes a staged comment batch as a deterministic block with provenance + anchor", () => {
    const batch = {
      batchId: null,
      comments: [
        attachment({ commentId: "c1", headingPath: ["Intro"], body: "clarify scope" }),
        attachment({
          commentId: "c2",
          docStem: null,
          headingPath: ["Design", "Risks"],
          body: "add a fallback",
        }),
      ],
    };
    expect(serializeCommentBatch(batch)).toBe(
      `${AGENT_COMPOSER_COMMENTS_PREFIX}\n` +
        `- [[2026-02-04-editor-demo-plan]] Intro: clarify scope\n` +
        `- Design › Risks: add a fallback`,
    );
    expect(serializeCommentBatch(null)).toBe("");
    expect(serializeCommentBatch({ batchId: null, comments: [] })).toBe("");
  });

  it("appends the comment block after the text and mentions in one prompt", () => {
    const batch = {
      batchId: null,
      comments: [attachment({ commentId: "c1", headingPath: ["Intro"], body: "fix" })],
    };
    expect(buildAgentPrompt("revise", mentions, batch)).toBe(
      `revise\n\n${AGENT_COMPOSER_CONTEXT_PREFIX} [[2026-02-04-editor-demo-plan]] #editor-demo\n\n` +
        `${AGENT_COMPOSER_COMMENTS_PREFIX}\n- [[2026-02-04-editor-demo-plan]] Intro: fix`,
    );
    // Comments-only submit is valid (attached context is the prompt).
    expect(buildAgentPrompt("", [], batch)).toBe(
      `${AGENT_COMPOSER_COMMENTS_PREFIX}\n- [[2026-02-04-editor-demo-plan]] Intro: fix`,
    );
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

  it("holds exactly one queued prompt, latest wins", () => {
    const set = useAgentComposer.getState().setQueuedPrompt;
    set("first");
    set("second");
    expect(useAgentComposer.getState().queuedPrompt).toBe("second");
    set(null);
    expect(useAgentComposer.getState().queuedPrompt).toBeNull();
  });

  it("appends comments to the pending batch, upserts by id, and bounds the set", () => {
    stageAgentComment(attachment({ commentId: "c1", body: "first note" }));
    stageAgentComment(attachment({ commentId: "c2" }));
    // Re-staging c1 UPSERTS in place: the set stays at 2 (no duplicate) but the
    // body refreshes to the latest (an edit after staging must not freeze stale).
    stageAgentComment(attachment({ commentId: "c1", body: "edited note" }));
    const comments = useAgentComposer.getState().commentBatch!.comments;
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ commentId: "c1", body: "edited note" });
    expect(comments[1]!.commentId).toBe("c2");

    for (let i = 0; i < AGENT_COMPOSER_COMMENT_CAP + 5; i += 1) {
      stageAgentComment(attachment({ commentId: `bulk-${i}` }));
    }
    expect(useAgentComposer.getState().commentBatch?.comments).toHaveLength(
      AGENT_COMPOSER_COMMENT_CAP,
    );
  });

  it("clears the whole staged batch through the batch seam", () => {
    stageAgentComment(attachment({ commentId: "c1" }));
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
