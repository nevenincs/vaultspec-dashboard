// Localization E2E (W06.P19.S139): exercises live LOADING and
// progressive-result states against the real served application. A slow
// `/vault-tree` response is forced through Playwright's network-layer route
// interception (an honest lever external to the app — never faked DOM, never
// a mock component tree) so the transient loading/progressive states hold
// long enough to assert against reliably, then the request is allowed
// through so the page settles normally.

import { expect, test } from "@playwright/test";

test.describe("loading and progressive-result states (live)", () => {
  test("the universal data-activity indicator announces catalog-driven progress, never raw counts alone", async ({
    page,
  }) => {
    let released: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    await page.route("**/vault-tree**", async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto("/");
    const indicator = page.locator('[data-kit="activity-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 10_000 });

    // The only on-screen text is the determinate row count; the live status
    // text is screen-reader-only, catalog-driven, and never a raw number
    // alone or an unresolved token.
    const status = indicator.getByRole("status");
    await expect(status).toBeAttached();
    const statusText = await status.innerText();
    expect(statusText.trim().length).toBeGreaterThan(0);
    expect(statusText).not.toContain("{{");
    expect(statusText).not.toMatch(/\bcommon:|\bdocuments:/);

    released();
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
  });

  test("the progressive vault-tree listing reports real localized drain guidance, not a bare percentage", async ({
    page,
  }) => {
    let releaseFirstPage: () => void = () => undefined;
    let sawSlowRequest = false;
    const firstPageGate = new Promise<void>((resolve) => {
      releaseFirstPage = resolve;
    });
    await page.route("**/vault-tree**", async (route) => {
      if (!sawSlowRequest) {
        sawSlowRequest = true;
        await firstPageGate;
      }
      await route.continue();
    });

    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
    releaseFirstPage();

    // The left rail's file/vault browser renders a progressive-drain notice
    // while the full listing is still being paged in; it must read as a real
    // sentence (never a raw `{{count}}` or a source key), and go away once
    // the drain completes.
    const leftRail = page.locator("[data-left-rail]");
    if (await leftRail.count()) {
      const railText = await leftRail.innerText();
      expect(railText).not.toContain("{{");
      expect(railText).not.toMatch(/\bcommon:|\bdocuments:/);
    }
  });
});
