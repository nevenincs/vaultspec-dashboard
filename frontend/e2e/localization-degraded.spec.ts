// Localization E2E (W06.P19.S140): exercises a live DEGRADED state against
// the real served application and proves every visible effect and recovery
// action is user-facing catalog copy — never a raw transport error, a status
// code, or an internal reason string. The degraded condition is forced
// through Playwright's network-layer route interception on the real
// `/vault-tree` endpoint (an honest lever external to the app, never faked
// DOM), mirroring degradation-is-read-from-tiers-not-guessed-from-errors: the
// UI must react to the REAL failed response, not a simulated flag. The page
// boots against the real working wire first (`bootHealthyThenBreakVaultTree`)
// and only then hits the intercepted failure, proving the genuine
// working-to-degraded transition.

import { expect, test } from "@playwright/test";

import { bootHealthyThenBreakVaultTree } from "./localizationHelpers";

test.describe("degraded states (live)", () => {
  test("a failed vault listing shows a translated degraded notice with a real retry action", async ({
    page,
  }) => {
    let failing = true;
    await bootHealthyThenBreakVaultTree(page, async () => {
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
    });

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
    await bootHealthyThenBreakVaultTree(page, async () => {
      await page.route("**/vault-tree**", (route) =>
        route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom" }),
        }),
      );
    });

    const leftRail = page.locator("[data-left-rail]");
    await expect(leftRail).toContainText(/unavailable/i, { timeout: 10_000 });
    const railText = await leftRail.innerText();
    expect(railText).not.toContain("boom");
    expect(railText).not.toMatch(/\bBad Gateway\b/i);
  });
});
