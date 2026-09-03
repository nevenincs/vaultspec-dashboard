// @vitest-environment happy-dom
//
// The questionnaire's rendered contract (plan P08.S30). What a user can actually do
// with a parked run: read the questions, answer them in the shape the boundary
// accepts, and be prevented from submitting an incomplete set.
//
// The submit path itself is exercised by the pure `clarification` suite (what goes
// on the wire) and by the live a2a tests (that the verb resumes the graph). What
// only a render can prove is the input SHAPE and the required gate as the user
// meets them.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { ClarificationCard, ClarificationRecap } from "./ClarificationCard";
import { normalizePendingClarification } from "./clarification";

function renderCard(raw: unknown) {
  const pending = normalizePendingClarification(raw);
  if (pending === null) throw new Error("fixture did not normalize");
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ClarificationCard runId="run-1" pending={pending} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe("ClarificationCard", () => {
  it("renders a text answer as a single-line INPUT, never a textarea", () => {
    // The engine refuses control characters in a bounded text field, so a textarea
    // would let the user build an answer the boundary rejects.
    renderCard({
      request_id: "req-1",
      questions: [{ id: "q1", prompt: "Which vault?", kind: "text", required: true }],
    });
    const input = document.querySelector("[data-clarification-input='q1']");
    expect(input).not.toBeNull();
    expect(input?.tagName).toBe("INPUT");
    expect(input?.getAttribute("type")).toBe("text");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("renders a choice as option buttons in one radiogroup", () => {
    renderCard({
      request_id: "req-1",
      questions: [
        {
          id: "q1",
          prompt: "Which scope?",
          kind: "choice",
          required: true,
          options: [
            { id: "a", label: "The vault" },
            { id: "b", label: "The code" },
          ],
        },
      ],
    });
    const group = screen.getByRole("radiogroup", { name: "Which scope?" });
    expect(group).not.toBeNull();
    const options = document.querySelectorAll("[data-clarification-option]");
    expect(options.length).toBe(2);
    expect(screen.getByRole("radio", { name: "The vault" })).not.toBeNull();
  });

  it("gates submit until every required question is answered", () => {
    renderCard({
      request_id: "req-1",
      questions: [
        { id: "q1", prompt: "Required one", kind: "text", required: true },
        { id: "q2", prompt: "Optional one", kind: "text", required: false },
      ],
    });
    const submit = document.querySelector<HTMLButtonElement>(
      "[data-clarification-submit]",
    );
    expect(submit?.disabled).toBe(true);

    // Answering only the OPTIONAL question must not unlock submit.
    fireEvent.change(document.querySelector("[data-clarification-input='q2']")!, {
      target: { value: "sure" },
    });
    expect(
      document.querySelector<HTMLButtonElement>("[data-clarification-submit]")
        ?.disabled,
    ).toBe(true);

    fireEvent.change(document.querySelector("[data-clarification-input='q1']")!, {
      target: { value: "the vault" },
    });
    expect(
      document.querySelector<HTMLButtonElement>("[data-clarification-submit]")
        ?.disabled,
    ).toBe(false);
  });

  it("selects a choice option and reflects it on the control", () => {
    renderCard({
      request_id: "req-1",
      questions: [
        {
          id: "q1",
          prompt: "Which scope?",
          kind: "choice",
          required: true,
          options: [{ id: "a", label: "The vault" }],
        },
      ],
    });
    const option = screen.getByRole("radio", { name: "The vault" });
    expect(option.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(option);
    expect(
      screen.getByRole("radio", { name: "The vault" }).getAttribute("aria-checked"),
    ).toBe("true");
    // A lone choice question answers on CLICK — picking the option IS the reply,
    // the way a suggested-reply chip works in every reference surface — so this
    // card deliberately renders no separate submit control.
    expect(document.querySelector("[data-clarification-submit]")).toBeNull();
  });

  it("is non-modal: it is a section in flow, with no dialog role anywhere", () => {
    // The non-modal law (review-surface-flow): agent work needs the work visible.
    renderCard({
      request_id: "req-1",
      questions: [{ id: "q1", prompt: "Which vault?", kind: "text", required: true }],
    });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.querySelector("[data-clarification-card='req-1']")).not.toBeNull();
  });
});

describe("ClarificationRecap", () => {
  it("renders answered questions as a durable question/answer card", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <ClarificationRecap
          entries={[{ id: "q1", prompt: "Which scope?", answer: "The vault" }]}
        />
      </I18nextProvider>,
    );
    expect(document.querySelector("[data-clarification-recap]")).not.toBeNull();
    expect(screen.getByText("Which scope?")).toBeTruthy();
    expect(screen.getByText("The vault")).toBeTruthy();
  });

  it("renders nothing when nothing was answered", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <ClarificationRecap entries={[]} />
      </I18nextProvider>,
    );
    expect(document.querySelector("[data-clarification-recap]")).toBeNull();
  });
});
