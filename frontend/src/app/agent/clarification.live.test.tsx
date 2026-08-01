// @vitest-environment happy-dom
//
// The questionnaire against a CAPTURED `pending_clarification` disclosure.
//
// Provenance, stated precisely because the previous version of this header did
// not: `fixtures/a2aPendingClarification.live.json` is the `pending_clarification`
// object served by a real a2a `run-status` on a real parked run. It was captured
// by starting a run on the shipped preset `vaultspec-adr-research-clarify` against
// a production gateway and polling status until the run parked, then writing the
// served object verbatim — `type` discriminator, explicit `"options": null` on the
// text question and all. Re-capture it the same way when the sibling's disclosure
// moves; do not hand-edit it.
//
// What the previous header claimed and why it mattered. It said the payload was
// "the exact array a2a's deterministic provider parks when a run's message carries
// DETERMINISTIC_FORCE_CLARIFICATION — copied verbatim from
// providers/deterministic_chat_model.py". None of that existed: no such token in
// a2a, no clarification code in that module, and no message-driven trigger at all.
// A run CANNOT ask a question its preset did not declare — a2a's only production
// arming path reads `[team.clarification]` off the preset and never sees the user's
// prompt — so the drive step that header implied could not have worked. The shape
// happened to be close enough that every assertion here passed, which is exactly
// what made it dangerous: a fixture asserting provenance it does not have turns
// every test built on it into a false green, and a reader has no way to tell.
//
// Why a captured fixture rather than a hand-written one: my hand-written fixtures
// used `{id, label}` option objects, but the wire sends `list[str]`, so every option
// was dropped and every `choice` silently degraded to a text input. A screenshot of
// that bug and of a working build look identical — a text box either way. So the
// adapter and the rendered controls are pinned against the producer's real payload
// here, and a live drive is left to prove only what a drive can: that the run
// actually parks and the panel actually shows it.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
// Imported, not read from disk: this file runs under happy-dom, where
// `import.meta.url` is not a file: URL.
import livePayload from "../../testing/fixtures/a2aPendingClarification.live.json";
import { ClarificationCard } from "./ClarificationCard";
import { normalizePendingClarification } from "./clarification";

const LIVE_PAYLOAD: unknown = livePayload;

afterEach(cleanup);

function renderLive() {
  const pending = normalizePendingClarification(LIVE_PAYLOAD);
  if (pending === null) throw new Error("the captured payload did not normalize");
  const runtime = createTestLocalizationRuntime();
  render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ClarificationCard runId="run-live" pending={pending} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return pending;
}

describe("the captured disclosure payload", () => {
  it("carries the shape a real disclosure carries, not a trimmed one", () => {
    // Guards the fixture itself, so a hand-edit that quietly drops a served field
    // cannot pass as a capture. The normalizer ignores both of these, which is
    // precisely why they need asserting: nothing else would notice their loss,
    // and a fixture missing them is no longer the wire.
    const raw = LIVE_PAYLOAD as Record<string, unknown>;
    expect(raw.type).toBe("clarification_request");
    const questions = raw.questions as Record<string, unknown>[];
    // a2a serializes `options` explicitly on a text question rather than omitting
    // it, so the key is present and null.
    expect(questions[1]).toHaveProperty("options", null);
  });

  it("carries the request id a2a really mints for a dashboard run", () => {
    const pending = renderLive();
    // a2a mints `clarify-{thread_id}`, and the dashboard's `createTeamRunId()`
    // emits `run-` + 32 hex. Asserted structurally rather than as a literal: the
    // SHAPE is the contract, the hex is one capture's run.
    expect(pending.requestId).toMatch(/^clarify-run-[0-9a-f]{32}$/);
  });

  it("normalizes both question kinds with their served ids", () => {
    const pending = renderLive();
    // The preset declares exactly these two, in this order.
    expect(pending.questions.map((question) => question.id)).toEqual([
      "scope",
      "constraints",
    ]);
    expect(pending.questions.map((question) => question.kind)).toEqual([
      "choice",
      "text",
    ]);
    expect(pending.questions.map((question) => question.required)).toEqual([
      true,
      false,
    ]);
  });

  it("KEEPS the string options a2a actually sends", () => {
    // The regression: `list[str]` read as `{id,label}` objects dropped every
    // option, and the option-less-choice fallback then rendered a text input —
    // indistinguishable from a working build in a screenshot.
    const pending = renderLive();
    const scope = pending.questions[0]!;
    expect(scope.options.map((option) => option.id)).toEqual([
      "frontend",
      "backend",
      "both",
    ]);
    // With no separate label served, the string is both id and label.
    expect(scope.options.map((option) => option.label)).toEqual([
      "frontend",
      "backend",
      "both",
    ]);
  });

  it("renders real option BUTTONS for the choice, not a text box", () => {
    renderLive();
    const group = screen.getByRole("radiogroup", {
      name: "Which surface should this cover?",
    });
    expect(group).not.toBeNull();
    for (const option of ["frontend", "backend", "both"]) {
      expect(screen.getByRole("radio", { name: option })).toBeTruthy();
    }
    expect(document.querySelectorAll("[data-clarification-option]").length).toBe(3);
    // The choice question must NOT have produced an input of its own.
    expect(document.querySelector("[data-clarification-input='scope']")).toBeNull();
  });

  it("renders a single-line input for the text question", () => {
    renderLive();
    const input = document.querySelector("[data-clarification-input='constraints']");
    expect(input).not.toBeNull();
    expect(input?.tagName).toBe("INPUT");
    // The engine refuses control characters in a bounded text field.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("gates submit on the REQUIRED choice, not the optional text", () => {
    renderLive();
    const submit = document.querySelector<HTMLButtonElement>(
      "[data-clarification-submit]",
    );
    // `scope` is required and unanswered, so submit is closed even though the
    // only free-text question is optional.
    expect(submit?.disabled).toBe(true);
  });
});
