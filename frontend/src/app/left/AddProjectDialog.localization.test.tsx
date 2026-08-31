// @vitest-environment happy-dom

import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { engineClient } from "../../stores/server/engine";
import {
  openAddProjectDialog,
  resetAddProjectChrome,
  setAddProjectIssue,
} from "../../stores/view/addProjectChrome";
import { liveTransport } from "../../testing/liveClient";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { AddProjectDialog } from "./AddProjectDialog";

beforeEach(() => engineClient.useTransport(liveTransport));
afterEach(() => {
  engineClient.useTransport(liveTransport);
  resetAddProjectChrome();
  cleanup();
});

describe("localized add project dialog", () => {
  it("reacts to English, French, and Arabic without replacing authored path data", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);

    const dialog = screen.getByRole("dialog", {
      name: runtime.t("projects:addDialog.title"),
    });
    const input = screen.getByRole("textbox", {
      name: runtime.t("projects:addDialog.accessibility.folderPath"),
    }) as HTMLInputElement;
    const authoredPath = "C:\\مجلد\\API-v2";
    fireEvent.change(input, { target: { value: authoredPath } });
    expect(input.value).toBe(authoredPath);
    const confirm = screen.getByRole("button", {
      name: runtime.t("projects:addDialog.actions.pickFolder"),
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: ltrTestResources.projects.addDialog.title,
      }),
    ).toBe(dialog);
    expect(input.value).toBe(authoredPath);
    expect(
      screen.getByRole("button", {
        name: runtime.t("projects:addDialog.actions.pickFolder"),
      }),
    ).toBe(confirm);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: rtlTestResources.projects.addDialog.title,
      }),
    ).toBe(dialog);
    expect(input.value).toBe(authoredPath);
    expect(
      screen.getByRole("button", {
        name: runtime.t("projects:addDialog.actions.pickFolder"),
      }),
    ).toBe(confirm);
    expect(dialog.textContent).not.toMatch(/projects:addDialog|error_kind|—/u);
  });

  it("disables the confirm with nothing to add and renders only closed localized issues", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);

    // The confirm stays disabled until a folder is selected or entered.
    expect(
      (
        screen.getByRole("button", {
          name: runtime.t("projects:addDialog.actions.pickFolder"),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    // Only supported issue messages render.
    act(() => setAddProjectIssue("unrecognized issue"));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => setAddProjectIssue("notGitProject"));
    expect(screen.getByRole("alert").textContent).toBe(
      runtime.t("projects:addDialog.errors.notGitProject"),
    );
    act(() => setAddProjectIssue("alreadyAdded"));
    expect(screen.getByRole("alert").textContent).toBe(
      runtime.t("projects:addDialog.errors.alreadyAdded"),
    );
    expect(screen.getByRole("alert").textContent).not.toContain("already_registered");
  });

  it("wraps the longest localized recovery in the compact footer", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);
    await act(async () => runtime.changeLanguage(ltrTestLocale));
    act(() => setAddProjectIssue("folderUnavailable"));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      ltrTestResources.projects.addDialog.errors.folderUnavailable,
    );
    expect(alert.className).toContain("break-words");
    expect(alert.className).not.toContain("truncate");
    expect(alert.parentElement?.parentElement?.className).toContain("flex-col");
    expect(alert.parentElement?.parentElement?.className).toContain("sm:flex-row");
  });

  it("keeps pending copy active through a real rejected registration", async () => {
    const runtime = createTestLocalizationRuntime();
    const client = createMenuTestQueryClient();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={client}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);
    const availablePath = resolve(tmpdir());
    const confirmName = runtime.t("projects:addDialog.actions.pickFolder");
    const pathInput = screen.getByRole("textbox", {
      name: runtime.t("projects:addDialog.accessibility.folderPath"),
    });
    fireEvent.change(pathInput, { target: { value: availablePath } });
    fireEvent.keyDown(pathInput, { key: "Enter" });
    // SETTLED, not merely enabled. The confirm is
    // `disabled={submitting || target === null || target.length === 0}`, and
    // `target` is `null` for as long as `level.isPlaceholderData` holds - which
    // it does through every refetch of the folder listing. So the button flips
    // back to disabled mid-flight, and a click that lands in that window is
    // swallowed in silence: `submitting` never becomes true, the pending copy
    // never renders, and no error is raised either.
    //
    // That is exactly the state CI reported, twice, with identical detail:
    //   dialog open; buttons: ... | Pick folder [disabled]; status: (none)
    // Idle label, so `submitting` is false; disabled, so `target` is empty; and
    // no status, so nothing was ever rejected. The click did nothing at all.
    //
    // Waiting for the query cache to go quiet first means `isPlaceholderData`
    // is settled when the click lands. The enabled assertion below is kept -
    // this adds a precondition, it does not relax one.
    await waitFor(() => expect(client.isFetching()).toBe(0), ENGINE_WAIT);
    await waitFor(
      () =>
        expect(
          (screen.getByRole("button", { name: confirmName }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("button", { name: confirmName }));
    const dialog = screen.getByRole("dialog");
    // AWAITED, not read in the same tick as the click. The confirm relabels to
    // the pending copy when the registration mutation starts.
    //
    // AWAITING IS NOT ENOUGH, and I said otherwise once. An await covers "the
    // label has not rendered yet"; it cannot cover "the label is never
    // observable", and on run 33379547938 this failed WITH the await in place.
    // The roles dump is no help on its own either: the confirm reads its idle
    // label "Pick folder" BOTH before the mutation starts and after it settles,
    // so the printed tree cannot tell those two apart. That ambiguity is what I
    // resolved the wrong way.
    //
    // So the failure now REPORTS WHAT IT KNOWS instead of leaving the next
    // reader to infer it: which buttons the dialog actually offers at that
    // moment, whether the confirm is disabled, and any status text on screen.
    // The assertion is unchanged - the pending copy must still appear, within
    // the same budget - only the error is richer.
    const addingLabel = runtime.t("projects:addDialog.actions.adding");
    let adding: HTMLButtonElement;
    try {
      adding = (await screen.findByRole(
        "button",
        { name: addingLabel },
        ENGINE_WAIT,
      )) as HTMLButtonElement;
    } catch {
      const open = screen.queryByRole("dialog");
      const buttons = open
        ? within(open)
            .queryAllByRole("button")
            .map((button) => {
              const name =
                button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "";
              const off = (button as HTMLButtonElement).disabled ? " [disabled]" : "";
              return `${name || "(unnamed)"}${off}`;
            })
        : [];
      const status = open
        ? within(open)
            .queryAllByRole("status")
            .concat(within(open).queryAllByRole("alert"))
            .map((node) => node.textContent?.trim() ?? "")
            .filter(Boolean)
        : [];
      throw new Error(
        `never observed the pending confirm "${addingLabel}". dialog ${
          open ? "open" : "ABSENT"
        }; buttons: ${buttons.join(" | ") || "(none)"}; status: ${
          status.join(" | ") || "(none)"
        }`,
      );
    }
    const cancel = screen.getByRole("button", {
      name: runtime.t("common:actions.cancel"),
    }) as HTMLButtonElement;
    const close = screen.getByRole("button", {
      name: runtime.t("common:actions.close"),
    }) as HTMLButtonElement;
    const filter = screen.getByRole("textbox", {
      name: runtime.t("projects:folderBrowser.accessibility.filterFolders"),
    }) as HTMLInputElement;
    const hidden = screen.getByRole("switch", {
      name: runtime.t("projects:folderBrowser.accessibility.showHiddenFolders"),
    }) as HTMLButtonElement;
    const submittedPath = (pathInput as HTMLInputElement).value;

    expect(adding.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    expect(close.disabled).toBe(true);
    expect((pathInput as HTMLInputElement).disabled).toBe(true);
    expect(filter.disabled).toBe(true);
    expect(hidden.disabled).toBe(true);
    const places = dialog.querySelectorAll<HTMLButtonElement>(
      "[data-picker-places-rail] button",
    );
    expect(places.length).toBeGreaterThan(0);
    for (const place of places) {
      expect(place.disabled).toBe(true);
      fireEvent.click(place);
    }
    for (const row of screen.queryAllByRole("option")) {
      expect((row as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(row);
    }
    const ancestors = dialog.querySelectorAll<HTMLButtonElement>(
      "nav[aria-label='Breadcrumb'] button",
    );
    expect(ancestors.length).toBeGreaterThan(0);
    for (const ancestor of ancestors) {
      expect(ancestor.disabled).toBe(true);
      fireEvent.click(ancestor);
    }
    fireEvent.change(pathInput, { target: { value: "C:/changed" } });
    fireEvent.change(filter, { target: { value: "changed" } });
    fireEvent.click(hidden);
    fireEvent.click(adding);
    fireEvent.click(cancel);
    fireEvent.click(close);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect((pathInput as HTMLInputElement).value).toBe(submittedPath);
    expect(adding.disabled).toBe(true);
    await waitFor(
      () =>
        expect(screen.getByRole("alert").textContent).toBe(
          runtime.t("projects:addDialog.errors.notGitProject"),
        ),
      ENGINE_WAIT,
    );
    expect(
      (screen.getByRole("button", { name: confirmName }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: runtime.t("common:actions.cancel") }),
    );
    act(openAddProjectDialog);
    // Reopening starts with no folder selected or entered.
    expect(
      (
        screen.getByRole("button", {
          name: runtime.t("projects:addDialog.actions.pickFolder"),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
