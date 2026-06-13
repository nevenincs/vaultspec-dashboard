// Adverse-condition E2E (dashboard-platform P05.S13): drives the running app
// (Vite dev server + mock engine) through the platform substrate's headline
// guarantee - a thrown render is contained to its region and never
// white-screens a sibling - and proves the region recovers. The crash is
// injected through the dev-only CrashInjector (ADR D5), so the throw is a real
// React render error caught by a real region boundary, not a simulation.

import { expect, test } from "@playwright/test";

test.describe("platform exception containment (live)", () => {
  test("boots under the mock engine with the four-region shell and dev affordances", async ({
    page,
  }) => {
    await page.goto("/");
    // The shell mounts (timeline is the always-present footer region).
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
    // Dev affordance present => we are on the dev origin where boundaries are
    // injectable.
    await expect(page.locator("[data-crash-injector]")).toBeVisible();
    // The app-level last-line boundary has NOT fired on a healthy boot.
    await expect(page.locator('[data-error-region="app"]')).toHaveCount(0);
  });

  test("contains a thrown stage to its region while siblings stay live", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // Inject a real render throw into the stage region.
    await page.locator('[data-crash="stage"]').click();

    // The stage region degrades to its contained fallback...
    const stageFallback = page.locator('[data-error-region="stage"]');
    await expect(stageFallback).toBeVisible();
    await expect(stageFallback).toContainText("this panel hit an error");

    // ...the sibling timeline region is untouched...
    await expect(page.locator("[data-timeline]")).toBeVisible();
    // ...and the app-level boundary never fired (no white screen).
    await expect(page.locator('[data-error-region="app"]')).toHaveCount(0);
  });

  test("recovers the region on clear + retry", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    await page.locator('[data-crash="stage"]').click();
    const stageFallback = page.locator('[data-error-region="stage"]');
    await expect(stageFallback).toBeVisible();

    // Disarm the injector, then retry the boundary.
    await page.locator("[data-crash-clear]").click();
    await stageFallback.getByRole("button", { name: "retry" }).click();

    // The region recovers: the fallback is gone, the shell is intact.
    await expect(stageFallback).toHaveCount(0);
    await expect(page.locator("[data-timeline]")).toBeVisible();
  });

  test("a right-rail crash leaves the timeline and stage regions alive", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    await page.locator('[data-crash="right-rail"]').click();

    await expect(page.locator('[data-error-region="right-rail"]')).toBeVisible();
    // Siblings are independent: timeline alive, stage region not in fallback.
    await expect(page.locator("[data-timeline]")).toBeVisible();
    await expect(page.locator('[data-error-region="stage"]')).toHaveCount(0);
    await expect(page.locator('[data-error-region="app"]')).toHaveCount(0);
  });

  test("the global trap captures an unhandled rejection into the logger ring buffer", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // Fire a real unhandled promise rejection in the page and read the
    // dev-exposed ring buffer the global trap routes into (ADR D3/D5).
    const captured = await page.evaluate(async () => {
      type Rec = { message: string };
      const ring = (
        globalThis as unknown as {
          __platformRingBuffer?: { snapshot(): Rec[] };
        }
      ).__platformRingBuffer;
      if (!ring) return false;
      void Promise.reject(new Error("e2e induced rejection"));
      await new Promise((resolve) => setTimeout(resolve, 250));
      return ring
        .snapshot()
        .some((record) => record.message.includes("unhandled promise rejection"));
    });
    expect(captured).toBe(true);
  });
});

test.describe("live-state degradation truth (live)", () => {
  test("a lost stream renders the reconnecting degraded surface, not a crash", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // Healthy boot: LIVE, not reconnecting, no white screen.
    await expect(page.getByText("RECONNECTING")).toHaveCount(0);

    // Flip the stores-owned live-connection signal to lost via the dev-exposed
    // store (a real StreamLostError would do the same through the policy bind).
    await page.evaluate(() => {
      const store = (
        globalThis as unknown as {
          __liveStatusStore?: { getState(): { setStreamConnected(c: boolean): void } };
        }
      ).__liveStatusStore;
      store?.getState().setStreamConnected(false);
    });

    // The timeline degrades to the designed reconnecting surface (ADR G8.a /
    // live-state D4) - a truthful degraded state, not a crash or a blank.
    await expect(page.getByText("RECONNECTING")).toBeVisible();
    await expect(page.locator('[data-error-region="app"]')).toHaveCount(0);
  });
});
