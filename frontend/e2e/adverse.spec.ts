// Adverse-condition E2E (dashboard-platform P05.S13): drives the running app
// (Vite dev server + mock engine) through the platform substrate's headline
// guarantee - a thrown render is contained to its region and never
// white-screens a sibling - and proves the region recovers. The crash is
// injected through the dev-only `__crashControls` lever (ADR D5; the original
// floating CrashInjector panel was removed by localization S243 and the lever
// restored chrome-less per the S108 closing review), so the throw is a real
// React render error caught by a real region boundary, not a simulation.

import { expect, test } from "@playwright/test";

import { en } from "../src/locales/en";

type CrashRegion = "left-rail" | "stage" | "right-rail" | "timeline";

const armCrash = (page: import("@playwright/test").Page, region: CrashRegion) =>
  page.evaluate((target) => {
    (
      globalThis as { __crashControls?: { arm(region: string): void } }
    ).__crashControls?.arm(target);
  }, region);

const disarmCrashes = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    (
      globalThis as { __crashControls?: { disarmAll(): void } }
    ).__crashControls?.disarmAll();
  });

const appFallback = (page: import("@playwright/test").Page) =>
  page.getByRole("alert").filter({ hasText: en.errors.unexpectedApplication.title });

const stageFallback = (page: import("@playwright/test").Page) =>
  page
    .locator("#stage")
    .getByRole("alert")
    .filter({ hasText: en.errors.unexpectedSection.title });

const railFallback = (page: import("@playwright/test").Page) =>
  page
    .locator("aside")
    .getByRole("alert")
    .filter({ hasText: en.errors.unexpectedSection.title });

test.describe("platform exception containment (live)", () => {
  test("boots under the mock engine with the four-region shell and dev affordances", async ({
    page,
  }) => {
    await page.goto("/");
    // The shell mounts (timeline is the always-present footer region).
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
    // Dev affordance present => we are on the dev origin where boundaries are
    // injectable.
    expect(
      await page.evaluate(
        () =>
          typeof (globalThis as { __crashControls?: unknown }).__crashControls !==
          "undefined",
      ),
    ).toBe(true);
    // The app-level last-line boundary has NOT fired on a healthy boot.
    await expect(appFallback(page)).toHaveCount(0);
  });

  test("contains a thrown stage to its region while siblings stay live", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // Inject a real render throw into the stage region.
    await armCrash(page, "stage");

    // The stage region degrades to its contained fallback...
    const fallback = stageFallback(page);
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText(en.errors.unexpectedSection.message);

    // ...the sibling right-rail region is untouched (the timeline is no longer
    // a sibling: since the appshell reframe it nests INSIDE the stage's dock
    // panel, so a stage crash legitimately takes it down with the region)...
    await expect(page.locator("[data-status-tab]")).toBeVisible();
    // ...and the app-level boundary never fired (no white screen).
    await expect(appFallback(page)).toHaveCount(0);
  });

  test("recovers the region on clear + retry", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    await armCrash(page, "stage");
    const fallback = stageFallback(page);
    await expect(fallback).toBeVisible();

    // Disarm the injector, then retry the boundary.
    await disarmCrashes(page);
    await fallback
      .getByRole("button", { name: en.common.actions.retry, exact: true })
      .click();

    // The region recovers: the fallback is gone, the shell is intact.
    await expect(fallback).toHaveCount(0);
    await expect(page.locator("[data-timeline]")).toBeVisible();
  });

  test("a right-rail crash leaves the timeline and stage regions alive", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    await armCrash(page, "right-rail");

    await expect(railFallback(page)).toBeVisible();
    // Siblings are independent: timeline alive, stage region not in fallback.
    await expect(page.locator("[data-timeline]")).toBeVisible();
    await expect(stageFallback(page)).toHaveCount(0);
    await expect(appFallback(page)).toHaveCount(0);
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
  test("a lost stream degrades truthfully, never a crash or a blank shell", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // Flip the stores-owned live-connection signal to lost via the dev-exposed
    // live-status control (a real StreamLostError would do the same through the
    // policy bind).
    await page.evaluate(() => {
      const controls = (
        globalThis as unknown as {
          __liveStatusControls?: { markStreamLost(): void };
        }
      ).__liveStatusControls;
      controls?.markStreamLost();
    });

    // The guarantee under test is degradation TRUTH at the containment layer:
    // a lost stream never crashes a region and never blanks the shell. (The
    // original dedicated "reconnecting" chrome was retired by the
    // canvas-overlay redesign — the stream-lost signal now feeds the
    // degradation matrix without a bespoke reconnect button, so this spec
    // asserts the surviving invariant, not the retired chrome.)
    await expect(page.locator("[data-timeline]")).toBeVisible();
    await expect(page.locator("[data-status-tab]")).toBeVisible();
    await expect(appFallback(page)).toHaveCount(0);
    await expect(
      page.locator("#stage").getByRole("alert").filter({
        hasText: en.errors.unexpectedSection.title,
      }),
    ).toHaveCount(0);
  });
});
