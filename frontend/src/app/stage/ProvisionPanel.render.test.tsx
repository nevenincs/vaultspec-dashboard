// @vitest-environment happy-dom
//
// The not-managed provisioning panel (project-provisioning ADR D7). WIRE-FREE
// UI unit tests, mirroring `ProposalCard`'s split (`ReviewStation.render.test`):
// `resolveProvisionPanelState` drives the panel's designed-state resolution off
// injected inputs (no fetch), and `ProvisionPanelBody` takes the served
// projection + injected callbacks as props, so the render assertions never
// touch the engine wire — the live dispatch seam is proven separately
// (`stores/server/provisionActions.test.ts`).

import {
  cleanup,
  fireEvent,
  render as renderView,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import type { ProvisionJob, ProvisionStatus } from "../../stores/server/engine";
import { PROVISION_FORCE_CONFIRM } from "../../stores/server/provisionControl";
import { CanvasStateOverlay, type CanvasState } from "./CanvasStateOverlay";
import {
  ProvisionPanelBody,
  dispatchPayload,
  recommendationDetail,
  resolveProvisionPanelState,
  shouldSuppressCanvasStateOverlay,
} from "./ProvisionPanel";
import { provisionForceInstallAction } from "../../stores/view/provisionActions";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";

afterEach(cleanup);

const noOp = () => undefined;

function render(ui: ReactElement) {
  return renderView(
    <I18nextProvider i18n={createTestLocalizationRuntime()}>{ui}</I18nextProvider>,
  );
}

function status(overrides: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    target: "/repo",
    managed: false,
    recommended: "install-framework",
    git: { present: true },
    uv: { present: true, version: "0.4.0" },
    core: { version: "0.1.30", floor: "0.1.30", meets_floor: true },
    rag: { tool_version: null, floor: "0.2.20", enrolled: null },
    framework: { vaultspec_present: true, vault_present: false, providers: ["all"] },
    pending_migrations: null,
    ...overrides,
  };
}

describe("resolveProvisionPanelState", () => {
  it("stays hidden while a live scope is already resolved elsewhere — never occludes a working graph", () => {
    expect(
      resolveProvisionPanelState({
        scope: "wt-1",
        isPending: false,
        isError: true,
        data: undefined,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("stays hidden while loading — the awaiting-scope skeleton shows through", () => {
    expect(
      resolveProvisionPanelState({
        scope: null,
        isPending: true,
        isError: false,
        data: undefined,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("stays hidden once already managed — nothing to fix", () => {
    expect(
      resolveProvisionPanelState({
        scope: null,
        isPending: false,
        isError: false,
        data: status({ managed: true, recommended: "managed" }),
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("is unavailable on a genuine read failure — never guessed from a bare transport error", () => {
    expect(
      resolveProvisionPanelState({
        scope: null,
        isPending: false,
        isError: true,
        data: undefined,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("resolves not-managed with the served projection once genuinely unmanaged", () => {
    const data = status();
    expect(
      resolveProvisionPanelState({
        scope: null,
        isPending: false,
        isError: false,
        data,
      }),
    ).toEqual({ kind: "not-managed", data });
  });
});

describe("recommendationDetail", () => {
  it("adds context prose only for the two hard dead-ends", () => {
    expect(recommendationDetail("not-a-git-project")).toEqual({
      key: "projects:provisioning.details.prepareFolderAsGitProject",
    });
    expect(recommendationDetail("acquire-uv")).toEqual({
      key: "projects:provisioning.details.installRequiredProjectTools",
    });
    expect(recommendationDetail("install-framework")).toBeNull();
    expect(recommendationDetail("managed")).toBeNull();
  });
});

describe("dispatchPayload", () => {
  it("extracts the dispatch-lane payload from a runnable descriptor", () => {
    const action = provisionForceInstallAction(status());
    expect(dispatchPayload(action)).toEqual({
      action: "install",
      provider: "all",
      force: true,
      confirm: PROVISION_FORCE_CONFIRM,
      workspace: undefined,
      worktree: undefined,
    });
  });

  it("is null for a disabled descriptor — never fires a stale/malformed body", () => {
    const action = provisionForceInstallAction(
      status({
        framework: { vaultspec_present: false, vault_present: false, providers: [] },
      }),
    );
    expect(dispatchPayload(action)).toBeNull();
  });
});

describe("ProvisionPanelBody", () => {
  it("renders the not-managed card with the primary affordance", () => {
    render(
      <ProvisionPanelBody
        data={status()}
        job={undefined}
        busy={false}
        runError={false}
        onPrimary={noOp}
        onForce={noOp}
      />,
    );
    expect(screen.getByText("Project setup required")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up project" })).toBeTruthy();
  });

  it("clicking the primary affordance fires onPrimary", () => {
    let primaryCount = 0;
    render(
      <ProvisionPanelBody
        data={status()}
        job={undefined}
        busy={false}
        runError={false}
        onPrimary={() => {
          primaryCount += 1;
        }}
        onForce={noOp}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set up project" }));
    expect(primaryCount).toBe(1);
  });

  it("disables both buttons while a job is busy (single-flight)", () => {
    render(
      <ProvisionPanelBody
        data={status()}
        job={undefined}
        busy
        runError={false}
        onPrimary={noOp}
        onForce={noOp}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Set up project",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("confirms replacement in the shared dialog and hides it when no setup exists", () => {
    let forceCount = 0;
    const { unmount } = render(
      <ProvisionPanelBody
        data={status()}
        job={undefined}
        busy={false}
        runError={false}
        onPrimary={noOp}
        onForce={() => {
          forceCount += 1;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Replace project setup" }));
    expect(screen.getByRole("dialog").textContent).toContain("Replace project setup?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(forceCount).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Replace project setup" }));
    const replaceButtons = screen.getAllByRole("button", {
      name: "Replace project setup",
    });
    fireEvent.click(replaceButtons[replaceButtons.length - 1]!);
    expect(forceCount).toBe(1);

    unmount();
    render(
      <ProvisionPanelBody
        data={status({
          framework: { vaultspec_present: false, vault_present: false, providers: [] },
        })}
        job={undefined}
        busy={false}
        runError={false}
        onPrimary={noOp}
        onForce={noOp}
      />,
    );
    expect(screen.queryByText(/Replace project setup/)).toBeNull();
  });

  it("fails closed when the localized force confirmation prompt is unavailable", () => {
    const runtime = createTestLocalizationRuntime(ltrTestLocale);
    runtime.removeResourceBundle(ltrTestLocale, "common");
    runtime.removeResourceBundle("en", "common");
    let forceCount = 0;

    render(
      <I18nextProvider i18n={runtime}>
        <ProvisionPanelBody
          data={status()}
          job={undefined}
          busy={false}
          runError={false}
          onPrimary={() => undefined}
          onForce={() => {
            forceCount += 1;
          }}
        />
      </I18nextProvider>,
    );

    const disabledButtons = screen
      .getAllByRole("button")
      .filter((button) => (button as HTMLButtonElement).disabled);
    expect(disabledButtons).toHaveLength(1);
    fireEvent.click(disabledButtons[0]!);
    expect(forceCount).toBe(0);
  });

  it("renders the served sync vocabulary on a terminal job outcome, never invented semantics", () => {
    const job: ProvisionJob = {
      id: "job-1",
      label: "Install the framework",
      target: "/repo",
      state: "succeeded",
      outcome: {
        exit_code: 0,
        outcome_indeterminate: false,
        envelope: {
          schema: "vaultspec.install.v1",
          status: "created",
          data: { items: [1, 2, 3] },
        },
      },
    };
    render(
      <ProvisionPanelBody
        data={status()}
        job={job}
        busy={false}
        runError={false}
        onPrimary={noOp}
        onForce={noOp}
      />,
    );
    expect(screen.getByText("Project setup completed")).toBeTruthy();
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("3 items")).toBeTruthy();
  });

  it("renders a safe failed result without raw job or service details", () => {
    const job: ProvisionJob = {
      id: "job-2",
      label: "Install vaultspec-core",
      target: "machine",
      state: "failed",
      outcome: {
        exit_code: 1,
        outcome_indeterminate: false,
        output: "error: could not find `vaultspec-core` in registry",
      },
    };
    render(
      <ProvisionPanelBody
        data={status()}
        job={job}
        busy={false}
        runError={false}
        onPrimary={noOp}
        onForce={noOp}
      />,
    );
    expect(screen.getByText("Project setup failed")).toBeTruthy();
    expect(screen.queryByText(/could not find/)).toBeNull();
    expect(screen.queryByText(/vaultspec-core/)).toBeNull();
    expect(screen.queryByText(/machine/)).toBeNull();
  });

  it("omits unknown status tokens and offers a localized status check when completion is uncertain", () => {
    let statusChecks = 0;
    const job: ProvisionJob = {
      id: "internal-job-74",
      label: "internal acquisition task",
      target: "/private/project/path",
      state: "failed",
      outcome: {
        exit_code: 77,
        outcome_indeterminate: true,
        output: "private service traceback",
        envelope: {
          schema: "internal.schema.v99",
          status: "future_internal_state",
          data: { items: ["provider-version-secret"] },
        },
      },
    };
    const { container } = render(
      <ProvisionPanelBody
        data={status()}
        job={job}
        busy={false}
        runError={false}
        onPrimary={noOp}
        onForce={noOp}
        onRetryStatus={() => {
          statusChecks += 1;
        }}
      />,
    );

    expect(container.textContent).not.toContain("internal-job-74");
    expect(container.textContent).not.toContain("internal acquisition task");
    expect(container.textContent).not.toContain("/private/project/path");
    expect(container.textContent).not.toContain("private service traceback");
    expect(container.textContent).not.toContain("internal.schema.v99");
    expect(container.textContent).not.toContain("future_internal_state");
    expect(container.textContent).not.toContain("provider-version-secret");
    fireEvent.click(screen.getByRole("button", { name: "Check project status" }));
    expect(statusChecks).toBe(1);
  });

  it("surfaces a run-start failure honestly, never silently", () => {
    render(
      <ProvisionPanelBody
        data={status()}
        job={undefined}
        busy={false}
        runError
        onPrimary={noOp}
        onForce={noOp}
      />,
    );
    expect(screen.getByText("Project setup could not start. Try again.")).toBeTruthy();
  });
});

// Stage's ACTUAL overlay composition (the HIGH review finding): a harness
// mirroring Stage.tsx's real JSX line-for-line — the REAL `CanvasStateOverlay`
// component, the REAL `shouldSuppressCanvasStateOverlay` predicate, and
// `ProvisionPanelBody` in place of the wired `ProvisionPanel` (kept wire-free
// by driving `resolveProvisionPanelState` off injected inputs instead of a
// live `useProvisionStatus` fetch). Proves the double-card artifact the
// review caught cannot recur: for a genuinely unmanaged root the awaiting-
// scope card is ABSENT and the not-managed card is the only one painted.
function StageOverlayHarness({
  canvasState,
  panelInputs,
}: {
  canvasState: CanvasState;
  panelInputs: Parameters<typeof resolveProvisionPanelState>[0];
}) {
  const panelState = resolveProvisionPanelState(panelInputs);
  return (
    <>
      {!shouldSuppressCanvasStateOverlay(panelState) && (
        <CanvasStateOverlay state={canvasState} />
      )}
      {panelState.kind === "not-managed" && (
        <ProvisionPanelBody
          data={panelState.data}
          job={undefined}
          busy={false}
          runError={false}
          onPrimary={noOp}
          onForce={noOp}
        />
      )}
    </>
  );
}

describe("Stage overlay composition (CanvasStateOverlay <-> ProvisionPanel)", () => {
  it("a genuinely unmanaged root suppresses the awaiting-scope card and shows ONLY the not-managed card", () => {
    const { container } = render(
      <StageOverlayHarness
        canvasState={{ primary: { kind: "awaiting-scope" }, annotations: [] }}
        panelInputs={{ scope: null, isPending: false, isError: false, data: status() }}
      />,
    );
    expect(container.querySelector('[data-canvas-state="awaiting-scope"]')).toBeNull();
    expect(container.querySelector('[data-canvas-state="not-managed"]')).not.toBeNull();
  });

  it("still loading the provisioning read: the awaiting-scope card shows through, no panel card yet", () => {
    const { container } = render(
      <StageOverlayHarness
        canvasState={{ primary: { kind: "awaiting-scope" }, annotations: [] }}
        panelInputs={{ scope: null, isPending: true, isError: false, data: undefined }}
      />,
    );
    expect(
      container.querySelector('[data-canvas-state="awaiting-scope"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-canvas-state="not-managed"]')).toBeNull();
  });

  it("a live resolved scope: neither the awaiting-scope card nor the panel card renders", () => {
    const { container } = render(
      <StageOverlayHarness
        canvasState={{ primary: { kind: "ok" }, annotations: [] }}
        panelInputs={{
          scope: "wt-1",
          isPending: false,
          isError: false,
          data: undefined,
        }}
      />,
    );
    expect(container.querySelector("[data-canvas-state]")).toBeNull();
  });
});
