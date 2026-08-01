// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { testQueryClient } from "../../stores/server/queries/testFixtures";
import { engineClient } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { CodeTree } from "./CodeTree";

describe("rendered CodeTree localization", () => {
  const client = testQueryClient();
  let scope: string;

  beforeAll(async () => {
    scope = await liveScope();
  });

  beforeEach(() => {
    engineClient.useTransport(liveTransport);
    useViewStore.getState().setScope(scope);
  });

  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(client.isFetching()).toBe(0), ENGINE_WAIT);
    client.clear();
    engineClient.useTransport(liveTransport);
    useViewStore.getState().setScope(null);
  });

  it("switches locale in place while preserving live file names", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <CodeTree />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const navigation = await screen.findByRole(
      "navigation",
      { name: "Project files" },
      ENGINE_WAIT,
    );
    const rows = Array.from(
      navigation.querySelectorAll<HTMLElement>("[data-code-row]"),
    );
    const names = rows.map((row) => row.textContent ?? "");
    expect(rows.length).toBeGreaterThan(0);
    expect(names.every((name) => name.length > 0)).toBe(true);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("navigation", {
        name: ltrTestResources.documents.codeTree.accessibility.browser,
      }),
    ).toBe(navigation);
    expect(
      Array.from(navigation.querySelectorAll<HTMLElement>("[data-code-row]")),
    ).toEqual(rows);
    expect(rows.map((row) => row.textContent ?? "")).toEqual(names);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("navigation", {
        name: rtlTestResources.documents.codeTree.accessibility.browser,
      }),
    ).toBe(navigation);
    expect(
      Array.from(navigation.querySelectorAll<HTMLElement>("[data-code-row]")),
    ).toEqual(rows);
    expect(rows.map((row) => row.textContent ?? "")).toEqual(names);
    expect(document.body.textContent).not.toMatch(
      /documents:codeTree|PRIVATE_STRUCTURAL_DIAGNOSTIC|—/u,
    );
  });

  it("renders the three row channels against the live worktree read", async () => {
    // Against the REAL engine: the served icon setting, ignore provenance, and
    // git status all arrive over the wire. The fixture worktree's git state is
    // not ours to pin, so this asserts the INVARIANTS the row treatment must hold
    // whatever the engine reports, rather than a specific decorated file.
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <CodeTree />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const navigation = await screen.findByRole(
      "navigation",
      { name: "Project files" },
      ENGINE_WAIT,
    );
    const rows = Array.from(
      navigation.querySelectorAll<HTMLElement>("[data-code-row]"),
    );
    expect(rows.length).toBeGreaterThan(0);

    // Channel 1: the setting is engine-declared default-on, so every FILE row
    // carries an inline type mark. A broken settings seam shows up here as zero
    // inline marks across the whole tree.
    const fileRows = rows.filter((row) => !row.hasAttribute("data-code-dir"));
    for (const row of fileRows) {
      expect(row.querySelector("svg")).not.toBeNull();
    }

    // Channel 2: a badge appears if and only if the entry carries a served
    // status, and it is never letter-only for a screen reader.
    for (const row of rows) {
      const badge = row.querySelector<HTMLElement>("[data-code-status-badge]");
      const served = row.getAttribute("data-code-status");
      expect(badge === null).toBe(served === null);
      if (badge !== null) {
        expect(badge.textContent?.trim().length).toBeGreaterThan(0);
        expect(badge.getAttribute("aria-label")?.length).toBeGreaterThan(0);
      }
    }

    // Channel 3: an ignored row is dimmed and still listed - the retired hide
    // behaviour must not creep back as invisibility.
    for (const row of rows) {
      if (row.getAttribute("data-code-ignored") !== null) {
        expect(row.className).toContain("opacity-60");
        expect(row.textContent?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
