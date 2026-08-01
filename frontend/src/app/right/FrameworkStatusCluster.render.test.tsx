// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { en, sourceLocale } from "../../locales/en";
import type { FrameworkStatusChip } from "../../stores/server/queries";
import type { MessageDescriptor } from "../../platform/localization/message";
import { StatusChip } from "./FrameworkStatusCluster";

afterEach(cleanup);

const PENDING_LABEL: MessageDescriptor = { key: "common:agent.pending.label" };

function renderChip(
  label: MessageDescriptor,
  chip: FrameworkStatusChip,
  over: { open?: boolean; tabIndex?: 0 | -1; coarse?: boolean } = {},
) {
  const runtime = createTestLocalizationRuntime();
  const activity = { clicks: 0, focuses: 0, keys: 0 };
  let element: HTMLElement | null = null;
  const result = render(
    <I18nextProvider i18n={runtime}>
      <StatusChip
        label={label}
        chip={chip}
        open={over.open ?? false}
        onToggle={() => {
          activity.clicks += 1;
        }}
        chipRef={(value) => {
          element = value;
        }}
        tabIndex={over.tabIndex ?? 0}
        onKeyDown={() => {
          activity.keys += 1;
        }}
        onFocus={() => {
          activity.focuses += 1;
        }}
        coarse={over.coarse}
      />
    </I18nextProvider>,
  );
  return { ...result, activity, element, runtime };
}

function expectedPanelStatus(
  runtime: ReturnType<typeof createTestLocalizationRuntime>,
  panel: string,
  status: string,
): string {
  return runtime.t("controlPanels.accessibility.panelStatus", {
    ns: "common",
    panel,
    status,
  });
}

describe.sequential("StatusChip", () => {
  it("updates one chip through English, French, and Arabic", async () => {
    const rendered = renderChip(PENDING_LABEL, { tone: "attention", count: 3 });
    const englishName = expectedPanelStatus(
      rendered.runtime,
      en.common.agent.pending.label,
      en.common.controlPanels.tones.needsAttention,
    );
    const button = screen.getByRole("button", { name: englishName });
    expect(screen.getByText("3")).toBeTruthy();

    await act(async () => {
      await rendered.runtime.changeLanguage(ltrTestLocale);
    });
    const frenchName = expectedPanelStatus(
      rendered.runtime,
      ltrTestResources.common.agent.pending.label,
      ltrTestResources.common.controlPanels.tones.needsAttention,
    );
    expect(screen.getByRole("button", { name: frenchName })).toBe(button);
    expect(screen.getByText(ltrTestResources.common.agent.pending.label)).toBe(
      button.querySelector("span:not([aria-hidden])"),
    );

    await act(async () => {
      await rendered.runtime.changeLanguage(rtlTestLocale);
    });
    const arabicName = expectedPanelStatus(
      rendered.runtime,
      rtlTestResources.common.agent.pending.label,
      rtlTestResources.common.controlPanels.tones.needsAttention,
    );
    expect(screen.getByRole("button", { name: arabicName })).toBe(button);
    expect(screen.getByText(rtlTestResources.common.agent.pending.label)).toBe(
      button.querySelector("span:not([aria-hidden])"),
    );
  });

  it("maps each tone to its status dot class", () => {
    const toneToClass: Record<FrameworkStatusChip["tone"], string> = {
      ok: "bg-state-active",
      attention: "bg-state-stale",
      down: "bg-state-broken",
      unknown: "bg-ink-faint",
    };
    for (const [tone, className] of Object.entries(toneToClass)) {
      const { container } = renderChip(PENDING_LABEL, {
        tone: tone as FrameworkStatusChip["tone"],
      });
      const dot = container.querySelector("[data-framework-chip] span[aria-hidden]");
      expect(dot?.className).toContain(className);
      cleanup();
    }
  });

  it("preserves count, pressed state, callbacks, and focus behavior", () => {
    const rendered = renderChip(
      PENDING_LABEL,
      { tone: "unknown", count: 2 },
      { open: true },
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("2");
    expect(rendered.element).toBe(button);

    button.focus();
    expect(document.activeElement).toBe(button);
    expect(rendered.activity.focuses).toBe(1);
    fireEvent.keyDown(button, { key: "ArrowRight" });
    expect(rendered.activity.keys).toBe(1);
    fireEvent.click(button);
    expect(rendered.activity.clicks).toBe(1);
  });

  it("renders nothing when required messages are unavailable", () => {
    const runtime = createTestLocalizationRuntime();
    const activity = { clicks: 0, focuses: 0, keys: 0, refs: 0 };
    runtime.removeResourceBundle(sourceLocale, "common");
    const { container } = render(
      <I18nextProvider i18n={runtime}>
        <StatusChip
          label={PENDING_LABEL}
          chip={{ tone: "ok" }}
          open={false}
          onToggle={() => {
            activity.clicks += 1;
          }}
          chipRef={() => {
            activity.refs += 1;
          }}
          tabIndex={0}
          onKeyDown={() => {
            activity.keys += 1;
          }}
          onFocus={() => {
            activity.focuses += 1;
          }}
        />
      </I18nextProvider>,
    );
    expect(container.querySelector("[data-framework-chip]")).toBeNull();
    expect(activity).toEqual({ clicks: 0, focuses: 0, keys: 0, refs: 0 });
  });
});
