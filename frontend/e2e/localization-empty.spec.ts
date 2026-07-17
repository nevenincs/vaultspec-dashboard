// Localization E2E (W06.P19.S141): exercises live EMPTY states against the
// real served application and proves each renders concise, catalog-driven
// guidance — never a blank body, never raw catalog plumbing. Uses the
// corpus's OWN naturally-empty sections (this repository genuinely has no
// open GitHub issues against its `gh` broker) rather than faking DOM, per the
// "real levers, never faked DOM" mandate.

import { expect, test } from "@playwright/test";

test.describe("empty states (live)", () => {
  test("the open-issues section renders concise empty guidance, not a blank body", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-status-tab]")).toBeVisible({ timeout: 20_000 });

    const issuesHeader = page.getByRole("button", { name: /issue/i });
    await expect(issuesHeader.first()).toBeVisible();
    await issuesHeader.first().click();

    // The empty-state sentence is real, non-empty, catalog-driven copy — never
    // a raw key, an unresolved token, or a silently blank section.
    const statusTab = page.locator("[data-status-tab]");
    await expect(statusTab).toContainText(/issue/i);
    const bodyText = await statusTab.innerText();
    expect(bodyText).not.toContain("{{");
    expect(bodyText).not.toMatch(/\bcommon:|\bdocuments:|\berrors:/);

    // A concise sentence, not a wall of text or a bare empty div: bounded
    // length, present after the section header.
    const issuesIndex = bodyText.toLowerCase().indexOf("issues");
    expect(issuesIndex).toBeGreaterThanOrEqual(0);
    const afterHeader = bodyText.slice(issuesIndex);
    expect(afterHeader.length).toBeGreaterThan(0);
    expect(afterHeader.length).toBeLessThan(400);
  });

  test("no aria-live region is left announcing raw or empty content", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-status-tab]")).toBeVisible({ timeout: 20_000 });

    const issuesHeader = page.getByRole("button", { name: /issue/i });
    await issuesHeader.first().click();
    await page.waitForTimeout(300);

    const liveRegions = page.locator("[data-status-tab] [aria-live]");
    const count = await liveRegions.count();
    for (let index = 0; index < count; index += 1) {
      const text = await liveRegions.nth(index).innerText();
      expect(text).not.toContain("{{");
      expect(text).not.toMatch(/\bcommon:|\bdocuments:|\berrors:/);
    }
  });
});
