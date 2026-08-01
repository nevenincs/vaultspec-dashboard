// Clarification payload + submit rules (plan P08.S30/S32; agent-flow D5). Pure.
//
// This surface has no reference precedent — the research says so explicitly — and
// it gates a run that cannot resume without it. So the rules pinned here are the
// ones where getting it wrong STRANDS the user or gets the answer refused at the
// boundary: what survives normalization, what the required gate admits, and what
// actually goes on the wire.

import { describe, expect, it } from "vitest";

import {
  CLARIFICATION_MAX_ANSWER_CHARS,
  CLARIFICATION_MAX_OPTIONS,
  CLARIFICATION_MAX_QUESTIONS,
  boundedAnswer,
  clarificationAnswerBody,
  clarificationAnswersComplete,
  clarificationRecap,
  normalizeClarificationQuestion,
  normalizePendingClarification,
} from "./clarification";

const question = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  prompt: "Which scope?",
  kind: "text",
  required: true,
  ...over,
});

describe("normalizeClarificationQuestion", () => {
  it("drops a question that cannot be answered or read", () => {
    // No id means an answer could not be keyed to it; no prompt means the user
    // cannot know what is being asked. Either is worse than one fewer question.
    expect(normalizeClarificationQuestion(question({ id: "" }))).toBeNull();
    expect(normalizeClarificationQuestion(question({ prompt: "   " }))).toBeNull();
    expect(normalizeClarificationQuestion(null)).toBeNull();
  });

  it("keeps a choice with its options and caps them", () => {
    const normalized = normalizeClarificationQuestion(
      question({
        kind: "choice",
        options: Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, label: `O${i}` })),
      }),
    );
    expect(normalized?.kind).toBe("choice");
    expect(normalized?.options).toHaveLength(CLARIFICATION_MAX_OPTIONS);
  });

  it("degrades an option-less choice to text so it stays answerable", () => {
    // A choice card with nothing to click would park the run behind a question the
    // user physically cannot answer.
    const normalized = normalizeClarificationQuestion(
      question({ kind: "choice", options: [] }),
    );
    expect(normalized?.kind).toBe("text");
  });

  it("labels an option by its id when the sibling served no label", () => {
    const normalized = normalizeClarificationQuestion(
      question({ kind: "choice", options: [{ id: "yes" }] }),
    );
    expect(normalized?.options[0]).toEqual({ id: "yes", label: "yes" });
  });

  it("treats required as strictly true, never truthy", () => {
    expect(
      normalizeClarificationQuestion(question({ required: "yes" }))?.required,
    ).toBe(false);
    expect(normalizeClarificationQuestion(question({ required: true }))?.required).toBe(
      true,
    );
  });
});

describe("normalizePendingClarification", () => {
  it("reads the served disclosure and caps the question set", () => {
    const pending = normalizePendingClarification({
      request_id: "req-1",
      questions: Array.from({ length: 7 }, (_, i) => question({ id: `q${i}` })),
    });
    expect(pending?.requestId).toBe("req-1");
    expect(pending?.questions).toHaveLength(CLARIFICATION_MAX_QUESTIONS);
  });

  it("is null when the run is not parked", () => {
    expect(normalizePendingClarification(undefined)).toBeNull();
    expect(normalizePendingClarification(null)).toBeNull();
  });

  it("is null when nothing answerable survived, rather than an unsubmittable card", () => {
    // A card with no question could never be submitted, so it would strand the user
    // against a run that will not resume. Better to show nothing.
    expect(
      normalizePendingClarification({ request_id: "req-1", questions: [] }),
    ).toBeNull();
    expect(
      normalizePendingClarification({
        request_id: "req-1",
        questions: [{ id: "", prompt: "" }],
      }),
    ).toBeNull();
    // No request id: there is nothing to respond TO.
    expect(normalizePendingClarification({ questions: [question()] })).toBeNull();
  });
});

describe("boundedAnswer", () => {
  it("trims and caps at the boundary's own ceiling", () => {
    expect(boundedAnswer("  hello  ")).toBe("hello");
    expect(
      boundedAnswer("x".repeat(CLARIFICATION_MAX_ANSWER_CHARS + 500)),
    ).toHaveLength(CLARIFICATION_MAX_ANSWER_CHARS);
  });
});

describe("clarificationAnswersComplete", () => {
  const required = normalizeClarificationQuestion(question({ id: "r" }))!;
  const optional = normalizeClarificationQuestion(
    question({ id: "o", required: false }),
  )!;

  it("gates submit on the REQUIRED questions only", () => {
    expect(clarificationAnswersComplete([required], {})).toBe(false);
    expect(clarificationAnswersComplete([required], { r: "answer" })).toBe(true);
    expect(clarificationAnswersComplete([optional], {})).toBe(true);
    expect(clarificationAnswersComplete([required, optional], { r: "a" })).toBe(true);
  });

  it("does not accept whitespace as an answer to a required question", () => {
    expect(clarificationAnswersComplete([required], { r: "   " })).toBe(false);
  });
});

describe("clarificationAnswerBody", () => {
  const q1 = normalizeClarificationQuestion(question({ id: "q1" }))!;
  const q2 = normalizeClarificationQuestion(question({ id: "q2", required: false }))!;

  it("sends only the questions that carry an answer", () => {
    // An empty string is a value the parked node would have to interpret, and the
    // engine counts every entry against its four-answer cap.
    expect(clarificationAnswerBody([q1, q2], { q1: "yes", q2: "" })).toEqual({
      q1: "yes",
    });
  });

  it("is null when nothing would be sent", () => {
    expect(clarificationAnswerBody([q1, q2], {})).toBeNull();
    expect(clarificationAnswerBody([q1], { q1: "  " })).toBeNull();
  });

  it("bounds each answer it sends", () => {
    const body = clarificationAnswerBody([q1], { q1: ` ${"x".repeat(9000)} ` });
    expect(body?.q1).toHaveLength(CLARIFICATION_MAX_ANSWER_CHARS);
  });
});

describe("clarificationRecap", () => {
  it("shows a choice by its LABEL, not the option id the wire carried", () => {
    // The recap is for the reader; an option id means nothing to them.
    const choice = normalizeClarificationQuestion(
      question({
        id: "q1",
        kind: "choice",
        options: [{ id: "opt_a", label: "Use the vault" }],
      }),
    )!;
    expect(clarificationRecap([choice], { q1: "opt_a" })).toEqual([
      { id: "q1", prompt: "Which scope?", answer: "Use the vault" },
    ]);
  });

  it("records decisions, not blanks", () => {
    const q1 = normalizeClarificationQuestion(question({ id: "q1" }))!;
    const q2 = normalizeClarificationQuestion(question({ id: "q2", required: false }))!;
    expect(clarificationRecap([q1, q2], { q1: "answered" })).toHaveLength(1);
  });

  it("passes free text through verbatim", () => {
    const q1 = normalizeClarificationQuestion(question({ id: "q1" }))!;
    expect(clarificationRecap([q1], { q1: "the docs vault" })[0]?.answer).toBe(
      "the docs vault",
    );
  });
});
