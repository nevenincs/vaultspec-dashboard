// Localization E2E (W06.P19.S140): exercises a live DEGRADED state against
// the real served application and proves every visible effect and recovery
// action is user-facing catalog copy — never a raw transport error, a status
// code, or an internal reason string. The degraded condition is forced
// through Playwright's network-layer route interception on the real
// `/vault-tree` endpoint (an honest lever external to the app, never faked
// DOM), mirroring degradation-is-read-from-tiers-not-guessed-from-errors: the
// UI must react to the REAL failed response, not a simulated flag.

import { expect, test } from "@playwright/test";

test.describe("degraded states (live)", () => {
  test("a failed vault listing shows a translated degraded notice with a real retry action", async ({
    page,
  }) => {
    let failing = true;
    await page.route("**/vault-tree**", (route) => {
      if (failing) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom" }),
        });
      }
      return route.continue();
    });

    await page.goto("/");
    await expect(page.locator("[data-left-rail]")).toBeVisible({ timeout: 20_000 });

    // Switch to the Vault documents tab (the failing endpoint's consumer).
    const documentsTab = page.getByText("Documents", { exact: true }).first();
    await documentsTab.click();

    const leftRail = page.locator("[data-left-rail]");
    await expect(leftRail).toContainText(/unavailable/i, { timeout: 10_000 });

    // The recovery action is a real, translated button — never a raw error
    // code, stack trace, or internal identifier surfaced to the user.
    const retryButton = leftRail.getByRole("button", { name: /retry/i });
    await expect(retryButton).toBeVisible();

    const railText = await leftRail.innerText();
    expect(railText).not.toMatch(/\b502\b/);
    expect(railText).not.toContain("{{");
    expect(railText).not.toMatch(/\bcommon:|\bdocuments:/);
    expect(railText).not.toMatch(/EngineError|TypeError|at\s+\S+:\d+:\d+/);

    // The recovery action genuinely works: clearing the failure and retrying
    // restores the real listing (visible effect proven both ways).
    failing = false;
    await retryButton.click();
    await expect(leftRail.getByText(/unavailable/i)).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test("the degraded notice never leaks the raw served reason string", async ({
    page,
  }) => {
    await page.route("**/vault-tree**", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      }),
    );

    await page.goto("/");
    await expect(page.locator("[data-left-rail]")).toBeVisible({ timeout: 20_000 });
    await page.getByText("Documents", { exact: true }).first().click();

    const leftRail = page.locator("[data-left-rail]");
    await expect(leftRail).toContainText(/unavailable/i, { timeout: 10_000 });
    const railText = await leftRail.innerText();
    expect(railText).not.toContain("boom");
    expect(railText).not.toMatch(/\bBad Gateway\b/i);
  });
});
