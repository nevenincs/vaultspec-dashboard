// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { sourceLocale } from "../../locales/en";
import type { RecentCommitRow } from "../../stores/server/queries";
import { deriveRecentCommitChromeRows } from "../../stores/view/statusTabChrome";
import { RecentCommitItem } from "./StatusTab";

afterEach(cleanup);

describe("RecentCommitItem localization", () => {
  it("keeps hostile hashes out of same-node text, labels, and titles", async () => {
    const hostileHash = "deadbeef-SUPER-SECRET";
    const runtime = createTestLocalizationRuntime();
    const row: RecentCommitRow = {
      commit: {
        hash: hostileHash,
        short_hash: "deadbeef",
        subject: "",
        body: "authored body",
        ts: 0,
        node_ids: [`commit:${hostileHash}`, "doc:SUPER-SECRET"],
      },
      eventId: `commit:${hostileHash}`,
      touchedNodeIds: ["doc:SUPER-SECRET"],
      selectable: true,
      hasBody: true,
      subjectLabel: { key: "common:finalWave.history.commit" },
      ageLabel: "",
    };
    const [chromeRow] = deriveRecentCommitChromeRows([row], []);

    render(
      <I18nextProvider i18n={runtime}>
        <RecentCommitItem chromeRow={chromeRow} commitBodyClassName="" scope="scope" />
      </I18nextProvider>,
    );

    const toggle = screen.getByRole("button", {
      name: "Expand message for Commit",
    });
    const open = screen.getByRole("button", { name: "Open Commit" });
    const assertNoIdentityLeak = () => {
      expect(document.body.textContent).not.toContain(hostileHash);
      expect(document.body.textContent).not.toContain("deadbeef");
      expect(document.body.textContent).not.toContain("SUPER-SECRET");
      for (const node of document.querySelectorAll("[aria-label], [title]")) {
        expect(node.getAttribute("aria-label")).not.toContain(hostileHash);
        expect(node.getAttribute("aria-label")).not.toContain("deadbeef");
        expect(node.getAttribute("aria-label")).not.toContain("SUPER-SECRET");
        expect(node.getAttribute("title") ?? "").not.toContain(hostileHash);
        expect(node.getAttribute("title") ?? "").not.toContain("deadbeef");
        expect(node.getAttribute("title") ?? "").not.toContain("SUPER-SECRET");
      }
    };

    assertNoIdentityLeak();
    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(toggle.getAttribute("aria-label")).toBe(
      "Développer le message de Validation",
    );
    expect(open.getAttribute("aria-label")).toBe("Ouvrir Validation");
    assertNoIdentityLeak();
    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(toggle.getAttribute("aria-label")).toBe("توسيع رسالة التزام");
    expect(open.getAttribute("aria-label")).toBe("فتح التزام");
    assertNoIdentityLeak();
    await act(async () => runtime.changeLanguage(sourceLocale));
  });
});
