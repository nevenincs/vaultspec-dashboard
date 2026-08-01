// @vitest-environment happy-dom
//
// The index console header's behavioural guard (advanced-service-console ADR D4).
// It carries forward the three proofs the retired rag job dashboard's render test
// held, because the redesign moved the SAME lifecycle branches onto a new
// component and a moved behaviour is still a behaviour that must stay proven:
//   - stopping the shared tool is confirmation-gated, never one click;
//   - the lifecycle labels re-resolve in place across locales;
//   - a FAILED start renders the authored sentence and NEVER the raw envelope —
//     no reason string, no captured output, no pid, no port.
// The third is the security-relevant one: a start envelope can carry connection
// internals and operator paths, and this surface is the place they would leak.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import type { OpsResult } from "../../stores/server/engine";
import { interpretRagStartEnvelope } from "../../stores/server/ragControl";
import type { RagServiceIdentityView } from "../../stores/server/ragServiceIdentity";
import { IndexConsoleHeader, type IndexConsoleHeaderProps } from "./IndexConsole";

const SM = en.operations.searchMaintenance;

afterEach(cleanup);

const NO_IDENTITY: RagServiceIdentityView = {
  version: null,
  installedVersion: null,
  requiredVersion: null,
  storageMode: null,
  storageEndpoint: null,
  storageProcessId: null,
  storageVersion: null,
  storagePath: null,
  documents: null,
  code: null,
  empty: true,
};

function setup(overrides: Partial<IndexConsoleHeaderProps> = {}) {
  const runtime = createTestLocalizationRuntime();
  let stops = 0;
  const props: IndexConsoleHeaderProps = {
    identity: NO_IDENTITY,
    identityLoading: false,
    identityOffline: false,
    running: true,
    healthWord: "Running",
    healthTone: "active",
    actionsPending: false,
    doctorPending: false,
    reindexActive: false,
    onStart: () => undefined,
    onStop: () => {
      stops += 1;
    },
    onRestart: () => undefined,
    onDoctor: () => undefined,
    onReindex: () => undefined,
    ...overrides,
  };
  render(
    <I18nextProvider i18n={runtime}>
      <IndexConsoleHeader {...props} />
    </I18nextProvider>,
  );
  return { runtime, stops: () => stops };
}

describe("IndexConsoleHeader", () => {
  it("requires explicit confirmation before stopping the shared tool", () => {
    const state = setup();
    fireEvent.click(screen.getByRole("button", { name: SM.actions.stop }));
    expect(state.stops()).toBe(0);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(SM.confirmations.stop.title)).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: SM.destructiveActions.stop }),
    );
    expect(state.stops()).toBe(1);
  });

  it("abandons the stop when the confirmation is cancelled", () => {
    const state = setup();
    fireEvent.click(screen.getByRole("button", { name: SM.actions.stop }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: en.common.actions.cancel }),
    );
    expect(state.stops()).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("re-resolves its lifecycle labels across the French and Arabic catalogs", async () => {
    const { runtime } = setup();
    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.operations.searchMaintenance.actions.stop,
      }),
    ).toBeTruthy();
    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.operations.searchMaintenance.actions.stop,
      }),
    ).toBeTruthy();
  });

  it("renders the authored failure sentence and no raw start diagnostics", () => {
    const hostileReason = "token secret reason /private/service";
    const hostileOutput = "raw output: connection refused";
    const result: OpsResult = {
      ok: false,
      envelope: {
        status: "failed",
        attached: false,
        reason: hostileReason,
        output: hostileOutput,
        pid: 9911,
        port: 6333,
      },
      tiers: {},
    };
    setup({ startOutcome: interpretRagStartEnvelope(result), running: false });

    expect(document.body.textContent).not.toContain(hostileReason);
    expect(document.body.textContent).not.toContain(hostileOutput);
    expect(document.body.textContent).not.toContain("9911");
    expect(document.body.textContent).not.toContain("6333");
    expect(document.body.textContent).toContain(SM.service.startFailed);
  });

  it("offers the set-up retry without leaking the envelope when setup is required", () => {
    const result: OpsResult = {
      ok: false,
      envelope: {
        status: "needs_install",
        attached: false,
        reason: "missing interpreter at /opt/secret/bin",
        pid: 4242,
      },
      tiers: {},
    };
    setup({ startOutcome: interpretRagStartEnvelope(result), running: false });

    expect(screen.getByRole("button", { name: SM.actions.retrySetup })).toBeTruthy();
    expect(document.body.textContent).toContain(SM.service.setupRequired);
    expect(document.body.textContent).not.toContain("/opt/secret/bin");
    expect(document.body.textContent).not.toContain("4242");
  });

  it("renders only the identity facts the wire carried", () => {
    setup({
      identity: {
        ...NO_IDENTITY,
        installedVersion: "0.2.25",
        storageEndpoint: "127.0.0.1:6333",
        empty: false,
      },
    });
    const identity = document.querySelector("[data-index-identity]");
    expect(identity).toBeTruthy();
    const rows = identity?.querySelectorAll("[data-index-identity-row]") ?? [];
    // Two served facts in, two rows out — an absent fact is a MISSING row, never a
    // blank one and never a substituted neighbour.
    expect(rows.length).toBe(2);
    expect(identity?.textContent).toContain("0.2.25");
    expect(identity?.textContent).toContain("127.0.0.1:6333");
  });

  it("titles itself from the catalog, never from the served package identifier", () => {
    // The handshake's component name is a BACKEND package identifier; the
    // labels law keeps it off screen whichever tool is attached.
    setup({ identity: { ...NO_IDENTITY, storageMode: "server", empty: false } });
    expect(document.body.textContent).toContain(SM.identity.title);
    expect(document.body.textContent).not.toContain("vaultspec-rag");
  });
});
