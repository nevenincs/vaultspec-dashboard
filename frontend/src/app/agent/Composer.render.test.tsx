// @vitest-environment happy-dom
//
// Composer input-mode matrix. Online against
// the real `vaultspec serve` the global setup spawns — never a mocked wire. The
// matrix drives the D2/D4 machine end-to-end: Enter submits (bootstrapping a real
// session when none is current), Shift+Enter falls through to the native newline,
// `/` opens the one-command-plane popover, `@` adds removable mention chips,
// Send is replaced in place by Stop while a real run streams, a mid-run submit
// enqueues server-side, and a SERVED pending interrupt (`useRunInterrupts`, S41)
// flips the same input to steer (a faulting resume surfaces the honest inline
// failure and preserves the draft). Core vitest matchers only.
//
// Renders with the MODULE query client (`stores/server/queryClient`) — the agent
// mutations invalidate that client, and the mid-run assertions depend on the
// session snapshot refreshing through the real invalidation path.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { AuthoringClient } from "../../stores/server/authoring";
import { AgentClient } from "../../stores/server/agent";
import { queryClient } from "../../stores/server/queryClient";
import { useAgentPanel } from "../../stores/view/agentPanel";
import { stageAgentComment, useAgentComposer } from "../../stores/view/agentComposer";
import {
  registerCommandProvider,
  type CommandDescriptor,
} from "../../stores/view/commandRegistry";
import { Composer, composerEligibleCommands, isMentionTrigger } from "./Composer";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const liveAgent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });

function resetStores(): void {
  useAgentPanel.setState({ open: true, currentSessionId: null });
  useAgentComposer.setState({
    mentions: [],
    commentBatch: null,
  });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
  queryClient.clear();
});

function renderComposer() {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <Composer />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function input(): HTMLTextAreaElement {
  const el = document.querySelector("[data-composer-input]");
  expect(el).not.toBeNull();
  return el as HTMLTextAreaElement;
}

async function mintActorToken(): Promise<string> {
  const authoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
  const issued = await authoring.issueActorToken({
    actor: { id: `human:composer-${run}`, kind: "human" },
  });
  return issued.raw_token;
}

/** Create a real, empty session in the live engine and return its id. */
async function createLiveSession(title: string): Promise<string> {
  const scope = await liveScope();
  const outcome = await liveAgent.createSession(
    { scope, title },
    { actorToken: await mintActorToken() },
  );
  if (outcome.kind !== "settled") throw new Error("session did not settle");
  return outcome.session_id;
}

describe("Composer keyboard contract", () => {
  it("submits on Enter and lets Shift+Enter fall through to the newline", async () => {
    renderComposer();
    fireEvent.change(input(), { target: { value: "hello there" } });
    // Shift+Enter is NOT consumed (the native newline proceeds) and nothing
    // submits — no session appears.
    const shiftNotPrevented = fireEvent.keyDown(input(), {
      key: "Enter",
      shiftKey: true,
    });
    expect(shiftNotPrevented).toBe(true);
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
    expect(input().value).toBe("hello there");

    // Wait for the live scope to resolve (the bootstrap needs it), then Enter.
    await waitFor(
      () => {
        expect(
          (document.querySelector("[data-composer-send]") as HTMLButtonElement)
            .disabled,
        ).toBe(false);
      },
      { timeout: 10_000 },
    );
    const enterPrevented = !fireEvent.keyDown(input(), { key: "Enter" });
    expect(enterPrevented).toBe(true);

    // Bootstrap: a REAL session is created, made current, and the first turn
    // carries the typed prompt; the draft clears.
    await waitFor(
      () => expect(useAgentPanel.getState().currentSessionId).not.toBeNull(),
      { timeout: 15_000 },
    );
    const sessionId = useAgentPanel.getState().currentSessionId!;
    const snapshot = await liveAgent.getSession(sessionId);
    expect(snapshot.turns).toHaveLength(1);
    expect(snapshot.turns[0]!.prompt_text).toBe("hello there");
    await waitFor(() => expect(input().value).toBe(""));
  });

  it("stages a comment as the shared chip and enables a comments-only submit", async () => {
    // The comment→agent bridge (feedback-loop ADR D4/D6): a staged comment renders
    // as the shared "N comments" chip, and — structured continuation — a
    // comments-only submit is valid because the batch rides the turn as a
    // feedback_batch_id, not the prompt text. The submit→create-batch→turn
    // round-trip is a live-wire proof against the edge engine (merge-gate parked),
    // since the feedback-batches route lands with the a2a edge.
    stageAgentComment(
      {
        commentId: `comment-${run}`,
        headingPath: ["Scope"],
        contentStart: 0,
        contentEnd: 24,
        body: "expand the scope section",
      },
      { sourceDocument: "node:2026-01-04-beta-research", sourceRevision: "blob-1" },
    );
    renderComposer();

    const chip = document.querySelector('[data-composer-chip="comments"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("1 comment");

    // No typed text: a comments-only submit still enables send (the batch is the
    // payload, no longer serialized into the prompt string).
    await waitFor(
      () =>
        expect(
          (document.querySelector("[data-composer-send]") as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      { timeout: 10_000 },
    );
  });

  it("starts the next turn in the existing current session", async () => {
    const sessionId = await createLiveSession(`Composer existing ${run}`);
    useAgentPanel.setState({ open: true, currentSessionId: sessionId });
    renderComposer();
    fireEvent.change(input(), { target: { value: "second prompt" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(
      async () => {
        const snapshot = await liveAgent.getSession(sessionId);
        expect(snapshot.turns).toHaveLength(1);
        expect(snapshot.turns[0]!.prompt_text).toBe("second prompt");
      },
      { timeout: 15_000 },
    );
    expect(useAgentPanel.getState().currentSessionId).toBe(sessionId);
  });
});

describe("Composer slash commands (one command plane)", () => {
  it("opens on `/` at column 0, filters, runs the selection, and dismisses on Escape", async () => {
    let fired = 0;
    // The command label is a MessageDescriptor (`{ key }`), not a raw string:
    // `normalizeActionDescriptor` rejects a non-descriptor label since the
    // localization cutover, which is why a raw-string probe silently dropped out of
    // the slash list. The key resolves to a phrase ("Needs permission") that no
    // built-in composer command uses, so the filter and option lookup stay unique.
    const dispose = registerCommandProvider("test:composer-slash", () => [
      {
        id: "test:composer-probe",
        label: { key: "common:agent.transcript.toolStatus.needsPermission" },
        family: "app",
        run: () => {
          fired += 1;
        },
      },
    ]);
    try {
      renderComposer();
      fireEvent.change(input(), { target: { value: "/" } });
      await waitFor(() =>
        expect(document.querySelector("[data-composer-slash]")).not.toBeNull(),
      );
      // Filter down to the probe command, then Enter runs it and clears the draft.
      fireEvent.change(input(), { target: { value: "/needs permission" } });
      await waitFor(() =>
        expect(screen.getByRole("option", { name: "Needs permission" })).toBeTruthy(),
      );
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(fired).toBe(1);
      expect(input().value).toBe("");
      expect(document.querySelector("[data-composer-slash]")).toBeNull();
      // No session was created — a slash draft is a command, not a message.
      expect(useAgentPanel.getState().currentSessionId).toBeNull();

      // Escape dismisses the list without touching the draft.
      fireEvent.change(input(), { target: { value: "/needs" } });
      await waitFor(() =>
        expect(document.querySelector("[data-composer-slash]")).not.toBeNull(),
      );
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(document.querySelector("[data-composer-slash]")).toBeNull();
      expect(input().value).toBe("/needs");
    } finally {
      dispose();
    }
  });

  it("keeps arm-to-confirm and disabled commands out of the composer lane", () => {
    const commands = [
      { id: "a", label: "Plain", family: "app", run: () => undefined },
      { id: "b", label: "Armed", family: "app", confirm: true, run: () => undefined },
      {
        id: "c",
        label: "Off",
        family: "app",
        disabled: true,
        run: () => undefined,
      },
    ] as unknown as CommandDescriptor[];
    expect(composerEligibleCommands(commands).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("Composer mention chips", () => {
  it("triggers only at a word start", () => {
    expect(isMentionTrigger("", 0)).toBe(true);
    expect(isMentionTrigger("hello ", 6)).toBe(true);
    expect(isMentionTrigger("user@", 5)).toBe(false);
  });

  it("adds a removable chip from the corpus picker on `@`", async () => {
    renderComposer();
    fireEvent.keyDown(input(), { key: "@" });
    await waitFor(() =>
      expect(document.querySelector("[data-composer-mention]")).not.toBeNull(),
    );
    // The live corpus feeds the combobox; focus its field and pick the first row.
    const search = document.querySelector(
      "[data-composer-mention] input",
    ) as HTMLInputElement;
    expect(search).not.toBeNull();
    fireEvent.focus(search);
    const option = await waitFor(
      () => {
        const first = document.querySelector("[data-editor-combobox-list] button");
        expect(first).not.toBeNull();
        return first as HTMLButtonElement;
      },
      { timeout: 15_000 },
    );
    fireEvent.mouseDown(option);
    await waitFor(() => expect(useAgentComposer.getState().mentions).toHaveLength(1));
    const chip = document.querySelector(
      '[data-composer-chip="feature"], [data-composer-chip="document"]',
    );
    expect(chip).not.toBeNull();
    // The chip's × removes it.
    fireEvent.click(chip!.querySelector("button")!);
    expect(useAgentComposer.getState().mentions).toHaveLength(0);
  });
});

describe("Composer mid-run behavior (D4/S39)", () => {
  it("replaces Send with Stop while a real run streams, and a mid-run submit ENQUEUES server-side", async () => {
    const sessionId = await createLiveSession(`Composer mid-run ${run}`);
    useAgentPanel.setState({ open: true, currentSessionId: sessionId });
    renderComposer();

    // First submit starts a REAL run; the Send slot becomes Stop.
    fireEvent.change(input(), { target: { value: "first" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(
      () => expect(document.querySelector("[data-composer-stop]")).not.toBeNull(),
      { timeout: 15_000 },
    );
    expect(document.querySelector("[data-composer-send]")).toBeNull();

    // A mid-run submit never locks the input: S39 dispatches the turn, the engine
    // ENQUEUES it server-side (`queued_turn_ids`) rather than a client one-slot
    // queue, and the input clears. There is no client queue state to read.
    fireEvent.change(input(), { target: { value: "queued follow-up" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(input().value).toBe(""));

    // The queue state is SERVED: the session snapshot lists the enqueued turn, and
    // the composer renders the read-only served queued indicator (not a removable
    // client chip). Proven over the real wire.
    await waitFor(
      async () => {
        const snapshot = await liveAgent.getSession(sessionId);
        expect(snapshot.queued_turn_ids.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 20_000 },
    );
    await waitFor(() =>
      expect(document.querySelector('[data-composer-chip="queued"]')).not.toBeNull(),
    );
    // The enqueued turn carries the submitted prompt (the engine stored it).
    const snapshot = await liveAgent.getSession(sessionId);
    const queuedTurnId = snapshot.queued_turn_ids[0]!;
    expect(snapshot.turns.some((t) => t.turn_id === queuedTurnId)).toBe(true);
    // The session stays ACTIVE — the enqueue never cancelled it (S38: Stop, not a
    // submit, is the run-scoped cancel; a submit only adds a turn).
    expect(snapshot.session.status).toBe("active");
  });

  it("flips to steer from the SERVED pending-interrupt list and resumes the parked run (S41)", async () => {
    // Steer-eligibility is now read from the wire (`useRunInterrupts`), not a
    // client-staged record: an AGENT-owned run parked on a REAL permission interrupt
    // must flip the composer to steer after the served list refreshes. Requester is
    // an agent (never self-grants → the tool suspends); the composer's ambient human
    // principal resumes it — a different principal, so the resume faults honestly on
    // the wire and the inline failure surfaces with the draft intact (the honest
    // path the original staged-interrupt test proved, now over the served list).
    const authoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
    const agentToken = (
      await authoring.issueActorToken({
        actor: { id: `agent:composer-steer-${run}`, kind: "agent" },
      })
    ).raw_token;

    // Open the session + first turn as the agent so it OWNS the run, then set it
    // current and render the composer against it.
    const scope = await liveScope();
    const created = await liveAgent.createSession(
      { scope, title: `Composer steer ${run}` },
      { actorToken: agentToken },
    );
    if (created.kind !== "settled") throw new Error("session did not settle");
    const sessionId = created.session_id;
    const turned = await liveAgent.startTurn(
      sessionId,
      { prompt: "start work" },
      { actorToken: agentToken },
    );
    const runId = turned.kind === "settled" ? (turned.run_id ?? null) : null;
    expect(runId).toBeTruthy();

    // Park a REAL interrupt on the run: a mutating tool without a grant suspends as
    // `awaiting_permission`, creating the pending interrupt the served list returns.
    const executed = (await liveAgent.executeToolCall(
      runId!,
      {
        tool_call_id: `call_steer_${run.replace(/-/g, "_")}`,
        name: "cancel",
        input: { target: "run", run_id: runId, reason: "steer flip test" },
      },
      { actorToken: agentToken },
    )) as Record<string, unknown>;
    expect(executed.disposition).toBe("awaiting_permission");

    useAgentPanel.setState({ open: true, currentSessionId: sessionId });
    renderComposer();

    // The SAME input flips to the steer placeholder once the served pending-interrupt
    // list lands — no client staging, no new chrome.
    await waitFor(
      () => expect(input().placeholder).toBe("Reply to guide the running agent"),
      { timeout: 15_000 },
    );

    // Submitting steers: the typed `{prompt}` resume resolves the parked interrupt
    // on the real wire (steering an agent's parked run is the human's designed
    // affordance — resume is a capability-by-id, not owner-fenced), the draft
    // clears, and the composer returns to the idle placeholder once the served
    // list no longer holds a pending entry.
    fireEvent.change(input(), { target: { value: "go left instead" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(input().value).toBe(""), { timeout: 15_000 });
    const resolved = await liveAgent.listRunInterrupts(runId!);
    expect(resolved.items.every((i) => i.resume_state === "resolved")).toBe(true);
    await waitFor(() => expect(input().placeholder).toBe("Message the agent"), {
      timeout: 15_000,
    });
  }, 45_000);
});
