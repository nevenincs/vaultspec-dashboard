// The clarification resolution contract, pinned as a type-level guard.
//
// A parked run is resolved by EXACTLY ONE of three outcomes — answer the
// questionnaire, continue with a new prompt, or decline and let the run proceed
// on its own judgement. The union is what makes a two-outcome submission
// unrepresentable at the call site, and the engine refuses malformed bodies
// before any round-trip.
//
// This file exists because the union is easy to lose. `a2aTeam.ts` is a large,
// frequently co-edited module: a lane holding a working copy from before the
// union landed reverts it by committing that file, and nothing else in the suite
// would notice — the surviving `answers` path keeps working, and only the chat
// and refuse affordances silently stop existing. That failure has already been
// observed once in this tree.
//
// If this file fails to compile, the union has been reverted. Recover it from
// the commit that introduced it rather than re-deriving it, then re-apply your
// own hunks on top: `git show 8d638f4281 -- frontend/src/stores/server/agent/a2aTeam.ts`.

import { describe, expect, it } from "vitest";

import type { ClarificationResolutionPayload } from "./a2aTeam";

describe("clarification resolution payload", () => {
  it("admits each of the three outcomes a parked run can take", () => {
    const answer: ClarificationResolutionPayload = {
      runId: "run-7",
      requestId: "clr-1",
      answers: { q1: "option-b" },
    };
    const continuation: ClarificationResolutionPayload = {
      runId: "run-7",
      requestId: "clr-1",
      prompt: "Skip the questions and start with the rail rows.",
    };
    const decline: ClarificationResolutionPayload = {
      runId: "run-7",
      requestId: "clr-1",
      decline: true,
    };

    // Each carries its own outcome and nothing else: the values are asserted so
    // the union is exercised rather than merely referenced.
    expect("answers" in answer && answer.answers.q1).toBe("option-b");
    expect("prompt" in continuation && continuation.prompt.length).toBeGreaterThan(0);
    expect("decline" in decline && decline.decline).toBe(true);
  });

  it("makes a resolution-less submission unrepresentable", () => {
    // @ts-expect-error — a resume that resolves nothing would leave the run parked.
    const neither: ClarificationResolutionPayload = {
      runId: "run-7",
      requestId: "clr-1",
    };
    expect(neither.runId).toBe("run-7");

    // NOTE what this union does NOT do: TypeScript admits an object literal
    // carrying properties drawn from two members, so `{answers, prompt}` type-
    // checks. Two-outcome bodies are refused by the ENGINE, before any
    // round-trip — not by this type. Asserting otherwise here would have been a
    // guard that passes while proving nothing.
  });
});
