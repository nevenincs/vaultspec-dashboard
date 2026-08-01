// @vitest-environment happy-dom
//
// The questionnaire against the REAL trigger payload (P10.S37 pre-flight).
//
// `fixtures/a2aPendingClarification.live.json` is the exact array a2a's
// deterministic provider parks when a run's message carries
// `DETERMINISTIC_FORCE_CLARIFICATION` — copied verbatim from
// `providers/deterministic_chat_model.py`, not invented here. It is the payload
// the S37 drive will hit.
//
// Why this exists BEFORE the drive: my hand-written fixtures used `{id, label}`
// option objects, but the wire sends `list[str]`, so every option was dropped and
// every `choice` silently degraded to a text input. The drive screenshot for that
// bug and for a working build would look identical — a text box either way. So the
// adapter and the rendered controls are pinned against the producer's real payload
// here, and the drive is left to prove only what a drive can: that the run actually
// parks and the panel actually shows it.

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
  if (pending === null) throw new Error("the live trigger payload did not normalize");
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

describe("the deterministic trigger payload", () => {
  it("normalizes both question kinds with their served ids", () => {
    const pending = renderLive();
    expect(pending.requestId).toBe("clarification-deterministic-1");
    expect(pending.questions.map((question) => question.id)).toEqual([
      "provider",
      "scope",
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
    const provider = pending.questions[0]!;
    expect(provider.options.map((option) => option.id)).toEqual([
      "codex",
      "zai",
      "claude",
    ]);
    // With no separate label served, the string is both id and label.
    expect(provider.options.map((option) => option.label)).toEqual([
      "codex",
      "zai",
      "claude",
    ]);
  });

  it("renders real option BUTTONS for the choice, not a text box", () => {
    renderLive();
    const group = screen.getByRole("radiogroup", {
      name: "Which provider should author the plan?",
    });
    expect(group).not.toBeNull();
    for (const option of ["codex", "zai", "claude"]) {
      expect(screen.getByRole("radio", { name: option })).toBeTruthy();
    }
    expect(document.querySelectorAll("[data-clarification-option]").length).toBe(3);
    // The choice question must NOT have produced an input of its own.
    expect(document.querySelector("[data-clarification-input='provider']")).toBeNull();
  });

  it("renders a single-line input for the text question", () => {
    renderLive();
    const input = document.querySelector("[data-clarification-input='scope']");
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
    // `provider` is required and unanswered, so submit is closed even though the
    // only free-text question is optional.
    expect(submit?.disabled).toBe(true);
  });
});
