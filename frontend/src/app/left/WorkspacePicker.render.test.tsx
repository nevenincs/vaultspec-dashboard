// @vitest-environment happy-dom
//
// Project title (binding Figma `LeftRail` 244:750 header): the rail opens with the
// PROJECT NAME as a plain title — not a boxed picker, and with NO "pick a project"
// / "add a project" affordances (the board has none). Exercised through the real
// stores client transport (mockEngine), no component-internal doubles.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { MockEngine } from "../../testing/mockEngine";
import { WorkspacePicker } from "./WorkspacePicker";

function renderPicker() {
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePicker />
    </QueryClientProvider>,
  );
}

describe("WorkspacePicker — board project title (244:750)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("renders the active workspace name as a plain title", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker();
    const title = await waitFor(() => {
      const el = document.querySelector("[data-workspace-title]");
      expect(el).toBeTruthy();
      expect((el!.textContent ?? "").trim().length).toBeGreaterThan(0);
      return el!;
    });
    // It is a plain title, not a control: no chevron/dropdown trigger button.
    expect(title.tagName).toBe("SPAN");
  });

  it("exposes NO pick-a-project or add-a-project affordance (not on the board)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker();
    await waitFor(() =>
      expect(document.querySelector("[data-workspace-title]")).toBeTruthy(),
    );
    const buttons = screen.queryAllByRole("button");
    for (const b of buttons) {
      const name = `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`;
      expect(/pick a project|add a project|choose a project/i.test(name)).toBe(false);
    }
  });
});
