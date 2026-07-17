// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { ConflictResolutionPanel } from "./ConflictResolutionPanel";

afterEach(cleanup);

function renderPanel(onResolve = vi.fn()) {
  const runtime = createTestLocalizationRuntime();
  render(
    <I18nextProvider i18n={runtime}>
      <ConflictResolutionPanel
        conflictKeys={["h:Alpha"]}
        mineByKey={new Map([["h:Alpha", "## Alpha\n\nmy version\n"]])}
        theirsByKey={new Map([["h:Alpha", "## Alpha\n\nagent version\n"]])}
        resolutions={{}}
        onResolve={onResolve}
        docLabel="notes.md"
      />
    </I18nextProvider>,
  );
  return { onResolve };
}

describe("ConflictResolutionPanel", () => {
  it("renders a conflicted section with its heading and both resolution choices", () => {
    renderPanel();
    // The section heading is the ATX-stripped first line.
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(document.querySelector('[data-conflict-section="h:Alpha"]')).toBeTruthy();
    // Both plain choices are offered.
    expect(screen.getByRole("button", { name: /keep my version/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /use the agent/i })).toBeTruthy();
  });

  it("resolves a section to the chosen side on click", () => {
    const { onResolve } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /use the agent/i }));
    expect(onResolve).toHaveBeenCalledWith("h:Alpha", "theirs");
    fireEvent.click(screen.getByRole("button", { name: /keep my version/i }));
    expect(onResolve).toHaveBeenCalledWith("h:Alpha", "mine");
  });

  it("marks the active choice as pressed", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <ConflictResolutionPanel
          conflictKeys={["h:Alpha"]}
          mineByKey={new Map([["h:Alpha", "## Alpha\n\nmine\n"]])}
          theirsByKey={new Map([["h:Alpha", "## Alpha\n\ntheirs\n"]])}
          resolutions={{ "h:Alpha": "theirs" }}
          onResolve={vi.fn()}
          docLabel="notes.md"
        />
      </I18nextProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: /use the agent/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
