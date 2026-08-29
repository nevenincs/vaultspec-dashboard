// @vitest-environment happy-dom
//
// The questionnaire against a CAPTURED `pending_clarification` disclosure.
//
// Provenance. `fixtures/a2aPendingClarification.live.json` is the
// `pending_clarification` object served by a real a2a `run-status` on a real
// parked run, written verbatim, with its capture details carried inside the
// fixture's own `_provenance` block: date, gateway, a2a branch and commit, run
// id, preset, trigger, and the exact commands to re-capture it. Re-capture it
// that way when the disclosure moves; do not hand-edit it.
//
// Two captures of this payload have existed, taken from two different a2a trees,
// and they disagree on three fields: a `type` discriminator, `options: null`
// versus `[]` on a text question, and the request-id minting shape. Neither is a
// forgery — they are different trees, and each looked authoritative on its own.
// What settled it was not a reading of either checkout but the SERVED contract of
// the stack the panel drives: `openapi.json` from that gateway, whose respond
// route and request schema are recorded in
// `engine/crates/vaultspec-product/src/a2a_contract.rs`. Ground any future
// correction there first, then re-capture, then change the assertions — in that
// order, or the next capture just restarts the disagreement.
//
// Why a captured fixture rather than a hand-written one: hand-written fixtures
// encode their author's belief about a wire. One used `{id, label}` option objects
// where this wire sends `list[str]`, so every option was dropped and every `choice`
// silently degraded to a text input — and a screenshot of that bug and of a working
// build look identical. So the adapter and the rendered controls are pinned against
// the producer's real payload here, and a live drive is left to prove only what a
// drive can: that a run actually parks and the panel actually shows it.

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
    // The capture must keep its own provenance block: a fixture that cannot say
    // which stack and date it came from is what let two disagreeing captures
    // each look authoritative.
    expect(raw._provenance).toBeTypeOf("object");
    const questions = raw.questions as Record<string, unknown>[];
    // Our stack serializes `options` on a text question as an empty ARRAY, not
    // null and not omitted. The normalizer tolerates all three, which is exactly
    // why the served form needs asserting — nothing else would notice a change.
    expect(questions[1]).toHaveProperty("options", []);
  });

  it("carries the request id our stack really mints", () => {
    const pending = renderLive();
    // 16 lowercase hex, minted by the gateway — NOT derived from the run id. The
    // shape is asserted rather than the literal, but the shape is this stack's:
    // a different a2a tree mints `clarify-{thread_id}`, and pinning to that form
    // here would fail against every run the panel can actually drive.
    expect(pending.requestId).toMatch(/^[0-9a-f]{16}$/);
    // And it must fit the bound the served respond route puts on the path param.
    expect(pending.requestId.length).toBeLessThanOrEqual(64);
  });

  it("normalizes both question kinds with their served ids", () => {
    const pending = renderLive();
    // The preset declares exactly these two, in this order.
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
    // The choice question DOES carry one input - the n+1 row, so a bounded set
    // never traps an answer that is not on it - but it must sit INSIDE the
    // radiogroup beside the options, never in place of them. The degradation
    // this file exists to catch is caught above: options dropped leaves no
    // radiogroup and no option rows at all, so both lookups fail first.
    const escapeRow = document.querySelector("[data-clarification-input='provider']");
    expect(escapeRow).not.toBeNull();
    expect(group.contains(escapeRow)).toBe(true);
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
