// @vitest-environment happy-dom
//
// Composer input-mode matrix. Online against
// the real `vaultspec serve` the global setup spawns — never a mocked wire. The
// matrix drives the D2/D4 machine end-to-end: Enter submits (bootstrapping a real
// session when none is current), Shift+Enter falls through to the native newline,
// `/` opens the one-command-plane popover, `@` adds removable mention chips,
// Send is replaced in place by Stop while a real run streams, a mid-run submit
// holds the ONE queued chip and dispatches it as the next turn on settle, and a
// staged interrupt flips the same input to steer (a faulting resume surfaces the
// honest inline failure and preserves the draft). Core vitest matchers only.
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
import {
  AGENT_COMPOSER_COMMENTS_PREFIX,
  stageAgentComment,
  stageAgentInterrupt,
  useAgentComposer,
} from "../../stores/view/agentComposer";
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
    queuedPrompt: null,
    pendingInterrupt: null,
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

  it("stages a comment as the shared chip and serializes the batch into the submitted turn", async () => {
    // The comment→agent bridge (feedback-loop ADR D6): a staged comment renders as
    // the same "N comments" chip, and submitting carries the anchored comment into
    // the turn's prompt as a deterministic block (interim serialization — the wire
    // turn contract carries only `prompt`, so the batch rides IN it).
    stageAgentComment({
      commentId: `comment-${run}`,
      docStem: "2026-01-04-beta-research",
      headingPath: ["Scope"],
      body: "expand the scope section",
    });
    renderComposer();

    const chip = document.querySelector('[data-composer-chip="comments"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("1 comment");

    fireEvent.change(input(), { target: { value: "address the comments" } });
    await waitFor(
      () =>
        expect(
          (document.querySelector("[data-composer-send]") as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      { timeout: 10_000 },
    );
    fireEvent.keyDown(input(), { key: "Enter" });

    await waitFor(
      () => expect(useAgentPanel.getState().currentSessionId).not.toBeNull(),
      { timeout: 15_000 },
    );
    const sessionId = useAgentPanel.getState().currentSessionId!;
    const snapshot = await liveAgent.getSession(sessionId);
    expect(snapshot.turns).toHaveLength(1);
    const prompt = snapshot.turns[0]!.prompt_text;
    expect(prompt).toContain("address the comments");
    expect(prompt).toContain(AGENT_COMPOSER_COMMENTS_PREFIX);
    expect(prompt).toContain(
      "[[2026-01-04-beta-research]] Scope: expand the scope section",
    );

    // The batch clears after a successful submit.
    await waitFor(() => expect(useAgentComposer.getState().commentBatch).toBeNull());
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
    const dispose = registerCommandProvider("test:composer-slash", () => [
      {
        id: "test:composer-probe",
        label: "Probe the composer",
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
      fireEvent.change(input(), { target: { value: "/probe composer" } });
      await waitFor(() =>
        expect(screen.getByRole("option", { name: "Probe the composer" })).toBeTruthy(),
      );
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(fired).toBe(1);
      expect(input().value).toBe("");
      expect(document.querySelector("[data-composer-slash]")).toBeNull();
      // No session was created — a slash draft is a command, not a message.
      expect(useAgentPanel.getState().currentSessionId).toBeNull();

      // Escape dismisses the list without touching the draft.
      fireEvent.change(input(), { target: { value: "/probe" } });
      await waitFor(() =>
        expect(document.querySelector("[data-composer-slash]")).not.toBeNull(),
      );
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(document.querySelector("[data-composer-slash]")).toBeNull();
      expect(input().value).toBe("/probe");
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

describe("Composer mid-run behavior (D4)", () => {
  it("replaces Send with Stop while a real run streams, queues exactly one prompt, and dispatches it on settle", async () => {
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

    // A mid-run submit never locks the input: it holds the ONE queued chip.
    fireEvent.change(input(), { target: { value: "queued follow-up" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() =>
      expect(document.querySelector('[data-composer-chip="queued"]')).not.toBeNull(),
    );
    expect(useAgentComposer.getState().queuedPrompt).toBe("queued follow-up");
    expect(input().value).toBe("");

    // Stop cancels the run over the real wire — which cancels the WHOLE session
    // on this plane — so on settle the queued prompt dispatches exactly once
    // into a FRESH bootstrapped session and the chip clears.
    fireEvent.click(document.querySelector("[data-composer-stop]")!);
    await waitFor(
      () => {
        const current = useAgentPanel.getState().currentSessionId;
        expect(current).not.toBeNull();
        expect(current).not.toBe(sessionId);
      },
      { timeout: 20_000 },
    );
    const nextSessionId = useAgentPanel.getState().currentSessionId!;
    await waitFor(
      async () => {
        const snapshot = await liveAgent.getSession(nextSessionId);
        expect(snapshot.turns).toHaveLength(1);
        expect(snapshot.turns[0]!.prompt_text).toBe("queued follow-up");
      },
      { timeout: 20_000 },
    );
    const cancelled = await liveAgent.getSession(sessionId);
    expect(cancelled.session.status).toBe("cancelled");
    await waitFor(() =>
      expect(document.querySelector('[data-composer-chip="queued"]')).toBeNull(),
    );
  });

  it("steers through the same input when an interrupt is staged, surfacing an honest failure on a faulting resume", async () => {
    const sessionId = await createLiveSession(`Composer steer ${run}`);
    useAgentPanel.setState({ open: true, currentSessionId: sessionId });
    renderComposer();

    // Park a real run, then stage an interrupt for it.
    fireEvent.change(input(), { target: { value: "start work" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(
      () => expect(document.querySelector("[data-composer-stop]")).not.toBeNull(),
      { timeout: 15_000 },
    );
    stageAgentInterrupt({ interruptId: `interrupt:missing-${run}`, runId: null });

    // The SAME input flips to the steer placeholder — no new chrome.
    await waitFor(() =>
      expect(input().placeholder).toBe("Reply to guide the running agent"),
    );

    // Submitting targets the interrupt resume; the unknown id FAULTS on the real
    // wire, and the composer surfaces the inline failure with the draft intact.
    fireEvent.change(input(), { target: { value: "go left instead" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(
      () => expect(document.querySelector("[data-composer-error]")).not.toBeNull(),
      { timeout: 15_000 },
    );
    expect(input().value).toBe("go left instead");
  });
});
