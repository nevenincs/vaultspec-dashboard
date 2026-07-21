// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en } from "../../locales/en";
import { createTestLocalizationRuntime } from "../../localization/testing";
import type { A2aLifecycleStatus } from "../../stores/server/a2aLifecycle";
import { deriveA2aLifecycleView } from "../../stores/server/a2aLifecycle";
import { A2aLifecyclePanelBody } from "./A2aLifecyclePanel";

afterEach(cleanup);

const AS = en.common.agentService;

/** Build a served status, defaulting to a live, owned, gateway-ready install. */
function status(overrides: Partial<A2aLifecycleStatus>): A2aLifecycleStatus {
  return {
    installed: true,
    installed_known: true,
    install_state: "settled",
    recovery_required: false,
    degraded: false,
    readiness: { state: "gateway-ready", worker: "ready" },
    ownership: { owner: "root", retained: true },
    active_generation: "g3",
    tiers: { agent: { available: true } },
    ...overrides,
  };
}

/** Render the production body (props-driven) with the REAL localization runtime and
 *  isolated view data (the permitted unit-test carve-out — copy resolves through the
 *  real catalog, only the wire/store is bypassed). */
function renderBody(
  view: ReturnType<typeof deriveA2aLifecycleView>,
  props: Partial<Parameters<typeof A2aLifecyclePanelBody>[0]> = {},
) {
  const onRun = props.onRun ?? vi.fn();
  const runtime = createTestLocalizationRuntime();
  const result = render(
    <I18nextProvider i18n={runtime}>
      <A2aLifecyclePanelBody
        view={view}
        job={props.job}
        busy={props.busy ?? false}
        runError={props.runError ?? false}
        onRun={onRun}
      />
    </I18nextProvider>,
  );
  return { ...result, onRun };
}

describe("A2aLifecyclePanel presentations", () => {
  it("renders the COLD live-gateway state as running-idle with process control", () => {
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "gateway-ready", worker: "cold" } }),
    );
    const { container } = renderBody(view);
    expect(screen.getByText(AS.readiness.workerIdle)).toBeTruthy();
    expect(container.querySelector('[data-a2a-op="stop"]')).toBeTruthy();
    expect(container.querySelector('[data-a2a-op="restart"]')).toBeTruthy();
    expect(container.querySelector('[data-a2a-op="start"]')).toBeNull();
    // Active generation is surfaced.
    expect(
      screen.getByText(AS.activeGeneration.replace("{{generation}}", "g3")),
    ).toBeTruthy();
  });

  it("renders the OWNED install as managed by this app", () => {
    const view = deriveA2aLifecycleView(
      status({ ownership: { owner: "root", retained: true } }),
    );
    renderBody(view);
    expect(screen.getByText(AS.ownership.owned)).toBeTruthy();
  });

  it("renders a FOREIGN install as unavailable orchestration, managed elsewhere", () => {
    const reason =
      "a foreign a2a gateway holds the runtime and stays immutable: protocol mismatch";
    const view = deriveA2aLifecycleView(
      status({
        ownership: { owner: "other", retained: false },
        tiers: { agent: { available: false, reason } },
      }),
    );
    const { container } = renderBody(view);
    expect(screen.getByText(AS.orchestration.unavailable)).toBeTruthy();
    expect(screen.getByText(AS.ownership.unowned)).toBeTruthy();
    const orchestration = container.querySelector(
      '[data-a2a-orchestration-state="down"]',
    );
    expect(orchestration).toBeTruthy();
    // The served reason is surfaced as an authored title tooltip, never raw body copy.
    expect(orchestration?.getAttribute("title")).toBe(reason);
    expect(screen.queryByText(reason)).toBeNull();
  });

  it("renders the UPDATING/busy state with a progress affordance", () => {
    const view = deriveA2aLifecycleView(status({}));
    renderBody(view, { busy: true });
    expect(screen.getByText(AS.progress)).toBeTruthy();
  });

  it("guards ROLLBACK behind a confirm dialog carrying the data-preservation copy", () => {
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "installed-stopped" } }),
    );
    const { container, onRun } = renderBody(view);
    const rollback = container.querySelector('[data-a2a-op="rollback"]') as HTMLElement;
    expect(rollback).toBeTruthy();
    fireEvent.click(rollback);
    // The op is NOT dispatched until the confirm is accepted.
    expect(onRun).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(AS.confirm.rollback.title)).toBeTruthy();
    expect(within(dialog).getByText(AS.confirm.rollback.body)).toBeTruthy();
    fireEvent.click(within(dialog).getByText(AS.confirm.rollback.confirmLabel));
    expect(onRun).toHaveBeenCalledWith("rollback");
  });

  it("guards REMOVE (destructive confirmation) and dispatches only on confirm", () => {
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "installed-stopped" } }),
    );
    const { container, onRun } = renderBody(view);
    const remove = container.querySelector('[data-a2a-op="remove"]') as HTMLElement;
    fireEvent.click(remove);
    expect(onRun).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(AS.confirm.remove.title)).toBeTruthy();
    // Cancelling does NOT dispatch.
    fireEvent.click(within(dialog).getByText(AS.confirm.remove.cancelLabel));
    expect(onRun).not.toHaveBeenCalled();
    // Re-open and confirm dispatches remove.
    fireEvent.click(container.querySelector('[data-a2a-op="remove"]') as HTMLElement);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByText(AS.confirm.remove.confirmLabel),
    );
    expect(onRun).toHaveBeenCalledWith("remove");
  });

  it("renders the DEGRADED recovery-required state with only repair and diagnostics", () => {
    const view = deriveA2aLifecycleView(
      status({
        installed: null,
        install_state: "recovery-required",
        recovery_required: true,
        degraded: true,
        readiness: null,
      }),
    );
    const { container } = renderBody(view);
    expect(screen.getByText(AS.installState.recoveryRequired)).toBeTruthy();
    expect(container.querySelector('[data-a2a-op="repair"]')).toBeTruthy();
    expect(container.querySelector('[data-a2a-op="doctor"]')).toBeTruthy();
    expect(container.querySelector('[data-a2a-op="remove"]')).toBeNull();
    expect(container.querySelector('[data-a2a-op="start"]')).toBeNull();
  });

  it("renders a failed job outcome and a successful remove's data-preservation note", () => {
    const view = deriveA2aLifecycleView(status({}));
    const { rerender } = renderBody(view, {
      job: { id: "j1", op: "restart", state: "failed", outcome: null },
    });
    expect(screen.getByText(AS.outcome.failed)).toBeTruthy();

    const runtime = createTestLocalizationRuntime();
    rerender(
      <I18nextProvider i18n={runtime}>
        <A2aLifecyclePanelBody
          view={view}
          job={{
            id: "j2",
            op: "remove",
            state: "succeeded",
            outcome: { removed: true, data_preserved: true },
          }}
          busy={false}
          runError={false}
          onRun={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(AS.outcome.succeeded)).toBeTruthy();
    expect(screen.getByText(AS.dataPreserved)).toBeTruthy();
  });
});
