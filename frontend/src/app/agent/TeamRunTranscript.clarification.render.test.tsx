// @vitest-environment happy-dom
//
// The missing test LEVEL (P08 review finding): nothing mounted `TeamRunTranscript`
// and `ClarificationCard` together across the status transition, which is exactly
// where the C8 recap was evaporating.
//
// The bug, so the test's shape is legible: the card mounts only while run-status
// discloses a pending clarification, and answering successfully invalidates
// run-status — whose refetch clears that field and unmounts the card. A recap held
// in the card's own state died with it. Every assertion below is about surviving
// that transition, not about the card in isolation.
//
// The transition is driven by re-rendering the transcript with a progress value that
// goes from parked to resumed, which is precisely what the refetch does to it.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import type { RunProgress } from "../../stores/server/agent/a2aTeam";
import { setAgentTeamRun, useAgentPanel } from "../../stores/view/agentPanel";
import {
  recordClarificationRecap,
  useClarificationRecaps,
} from "../../stores/view/clarificationRecaps";
import { TeamRunProgressContext } from "./TeamRunProgressContext";
import { TeamRunTranscript } from "./TeamRunTranscript";

const RUN_ID = "run-clarify-1";

const PENDING = {
  request_id: "req-1",
  questions: [
    {
      id: "q1",
      prompt: "Which scope should the run target?",
      kind: "choice",
      required: true,
      options: [{ id: "vault", label: "The vault" }],
    },
  ],
};

/** A progress value in either lifecycle position: parked on the clarification, or
 *  resumed past it (which is what the post-answer refetch yields). */
function progress(parked: boolean): RunProgress {
  return {
    frames: [],
    degraded: false,
    terminal: false,
    status: {
      run_id: RUN_ID,
      status: "running",
      proposal_ids: [],
      changeset_ids: [],
      roles: [],
      assignments: [],
      ...(parked ? { pending_clarification: PENDING } : {}),
    },
  };
}

function renderTranscript(parked: boolean) {
  const runtime = createTestLocalizationRuntime();
  const ui = (value: RunProgress) => (
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TeamRunProgressContext.Provider value={value}>
          <TeamRunTranscript />
        </TeamRunProgressContext.Provider>
      </QueryClientProvider>
    </I18nextProvider>
  );
  const view = render(ui(progress(parked)));
  return { ...view, resume: () => view.rerender(ui(progress(false))) };
}

beforeEach(() => {
  useClarificationRecaps.setState({ byRun: {} });
  useAgentPanel.setState({
    teamRunId: RUN_ID,
    teamRunPrompt: "do the thing",
    teamRunScope: "scope-a",
  });
});
afterEach(() => {
  cleanup();
  useClarificationRecaps.setState({ byRun: {} });
  useAgentPanel.setState({ teamRunId: null, teamRunPrompt: null, teamRunScope: null });
});

describe("TeamRunTranscript clarification lifecycle", () => {
  it("renders the questionnaire at the park point while the run is parked", () => {
    renderTranscript(true);
    expect(document.querySelector("[data-clarification-card='req-1']")).not.toBeNull();
    expect(document.querySelector("[data-clarification-recaps]")).toBeNull();
  });

  it("KEEPS the recap after the status refetch clears the pending disclosure", () => {
    // The regression this file exists for. The recap is recorded (as the card does
    // on a successful respond), then the transition that unmounts the card is
    // driven — and the recap must still be on screen afterwards.
    const { resume } = renderTranscript(true);
    act(() => {
      recordClarificationRecap(RUN_ID, "req-1", [
        { id: "q1", prompt: "Which scope should the run target?", answer: "The vault" },
      ]);
    });
    act(() => resume());

    // The card is gone — the disclosure that mounted it is cleared.
    expect(document.querySelector("[data-clarification-card='req-1']")).toBeNull();
    // The decision survives it.
    expect(document.querySelector("[data-clarification-recaps]")).not.toBeNull();
    expect(screen.getByText("Which scope should the run target?")).toBeTruthy();
    expect(screen.getByText("The vault")).toBeTruthy();
  });

  it("survives a full remount of the transcript within the run's lifetime", () => {
    // Not just the refetch: any remount (a view flip, the panel reopening) must not
    // lose a decision already made.
    const first = renderTranscript(true);
    act(() => {
      recordClarificationRecap(RUN_ID, "req-1", [
        { id: "q1", prompt: "Which scope should the run target?", answer: "The vault" },
      ]);
    });
    first.unmount();
    renderTranscript(false);
    expect(screen.getByText("The vault")).toBeTruthy();
  });

  it("drops a run's recaps when the panel unbinds that run", () => {
    // Scoped to the viewing: a new binding must never inherit another run's
    // decisions.
    renderTranscript(true);
    act(() => {
      recordClarificationRecap(RUN_ID, "req-1", [
        { id: "q1", prompt: "Which scope should the run target?", answer: "The vault" },
      ]);
    });
    expect(useClarificationRecaps.getState().byRun[RUN_ID]).toHaveLength(1);
    act(() => setAgentTeamRun(null));
    expect(useClarificationRecaps.getState().byRun[RUN_ID]).toBeUndefined();
  });

  it("answers the parked question through the card and records ONE recap per request", () => {
    renderTranscript(true);
    // Selecting an option satisfies the required question and arms submit.
    fireEvent.click(screen.getByRole("radio", { name: "The vault" }));
    expect(
      document.querySelector<HTMLButtonElement>("[data-clarification-submit]")
        ?.disabled,
    ).toBe(false);

    // Re-answering the same request replaces its recap rather than stacking one.
    act(() => {
      recordClarificationRecap(RUN_ID, "req-1", [
        { id: "q1", prompt: "Which scope should the run target?", answer: "The vault" },
      ]);
      recordClarificationRecap(RUN_ID, "req-1", [
        { id: "q1", prompt: "Which scope should the run target?", answer: "The code" },
      ]);
    });
    expect(useClarificationRecaps.getState().byRun[RUN_ID]).toHaveLength(1);
    expect(
      useClarificationRecaps.getState().byRun[RUN_ID]?.[0]?.entries[0]?.answer,
    ).toBe("The code");
  });
});
