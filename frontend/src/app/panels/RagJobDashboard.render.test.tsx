// @vitest-environment happy-dom
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

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { DashboardHeaderBar, type DashboardHeaderBarProps } from "./RagJobDashboard";
import { interpretRagStartEnvelope } from "../../stores/server/ragControl";
import type { OpsResult } from "../../stores/server/engine";

afterEach(cleanup);

function setup(overrides: Partial<DashboardHeaderBarProps> = {}) {
  const runtime = createTestLocalizationRuntime();
  let stops = 0;
  const props: DashboardHeaderBarProps = {
    running: true,
    healthWord: "Status unavailable",
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
      <DashboardHeaderBar {...props} />
    </I18nextProvider>,
  );
  return { runtime, stops: () => stops };
}

describe("DashboardHeaderBar", () => {
  it("requires explicit confirmation before stopping shared search", () => {
    const state = setup();
    fireEvent.click(screen.getByRole("button", { name: "Stop search" }));
    expect(state.stops()).toBe(0);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Stop search?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop search" }));
    expect(state.stops()).toBe(1);
  });

  it("reacts to French and Arabic action catalogs", async () => {
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

  it("does not render raw start diagnostics", () => {
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
    setup({ startOutcome: interpretRagStartEnvelope(result) });
    expect(document.body.textContent).not.toContain(hostileReason);
    expect(document.body.textContent).not.toContain(hostileOutput);
    expect(document.body.textContent).not.toContain("9911");
    expect(document.body.textContent).not.toContain("6333");
    expect(document.body.textContent).toContain("Search could not start");
  });
});
