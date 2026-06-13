// End-to-end smoke against live `vaultspec serve` (W03.P12.S50): the
// SPA is served by the engine itself (single origin, token meta tag per
// DF-6), the constellation renders from the real graph, and search
// round-trips through the rag pass-through. The scrub leg is BLOCKED on
// contract divergence item 1 (S49 record: /graph/asof and /graph/diff
// parse git revisions only, rejecting the millisecond timestamps the
// contract commits) — flagged as an external dependency, not skipped
// silently; it completes when the engine reconciliation lands.

import { expect, test } from "@playwright/test";

test("the served shell carries the token bootstrap and boots the app", async ({
  page,
}) => {
  await page.goto("/");
  // DF-6: the engine injects the bearer into the served shell.
  await expect(page.locator('meta[name="vaultspec-token"]')).toHaveAttribute(
    "content",
    /.+/,
  );
  // The four-region anatomy mounts.
  await expect(page.locator("[data-timeline]")).toBeVisible();
  await expect(page.locator("[data-filter-bar]")).toBeVisible();
});

test("the constellation renders from the live graph", async ({ page }) => {
  await page.goto("/");
  // The field mounts its canvas into the stage host…
  const canvas = page.locator("[data-stage-host] canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  // …and the rail reports a non-empty live corpus (adapter-verified read).
  await expect(page.locator("[data-now-strip]")).toBeVisible();
  const engineNodes = await page.evaluate(async () => {
    const token = document
      .querySelector('meta[name="vaultspec-token"]')
      ?.getAttribute("content");
    const response = await fetch("/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as {
      data?: { index?: { nodes?: number } };
    };
    return body.data?.index?.nodes ?? 0;
  });
  expect(engineNodes).toBeGreaterThan(0);
});

test("search round-trips through the live pass-through", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "search" }).click();
  await page.getByLabel("search query").fill("dashboard");
  // The control is never dead: rag is up, so no offline banner appears
  // and the query round-trips ok through the engine pass-through.
  await expect(page.locator("[data-semantic-offline]")).toHaveCount(0);
  const roundTrip = await page.evaluate(async () => {
    const token = document
      .querySelector('meta[name="vaultspec-token"]')
      ?.getAttribute("content");
    const response = await fetch("/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "dashboard", target: "vault" }),
    });
    // Live /search shape: { data: { results, via, timing, ... }, tiers }
    // There is no nested `envelope` field — the results live directly in
    // data (S49 pass-through contract, engine routes RAG response as-is).
    const body = (await response.json()) as {
      data?: { results?: unknown[]; via?: string };
      tiers?: Record<string, unknown>;
    };
    return {
      status: response.status,
      ok: Array.isArray(body.data?.results),
      count: body.data?.results?.length ?? 0,
    };
  });
  expect(roundTrip.status).toBe(200);
  expect(roundTrip.ok).toBe(true);
  // Result-bearing click-through: exercised when the rag index carries
  // this workspace (currently empty — S50 record, divergence item 6);
  // the UI path is covered against the mock and the adapter is live.
  const results = page.locator("[data-search-tab] li button");
  if ((await results.count()) > 0 && roundTrip.count > 0) {
    await results.first().click();
    await page.getByRole("tab", { name: "activity" }).click();
    await expect(page.locator("[data-inspector]")).toBeVisible();
  }
});

// BLOCKED — external dependency, flagged not skipped: live scrubbing
// requires /graph/asof + /graph/diff to accept the contract's `t=<ts|sha>`
// timestamp form (S49 divergence item 1, routed to the engine owners).
// Un-fixme when the reconciliation lands; the in-app scrub path itself is
// covered against the contract-faithful mock (S34 tests).
test.fixme("scrubbing the playhead renders the network as of T (blocked on engine asof/diff timestamp support)", async ({
  page,
}) => {
  await page.goto("/");
  const grip = page.locator("[data-playhead-grip]");
  await grip.dragTo(page.locator("[data-timeline]"), {
    targetPosition: { x: 200, y: 10 },
  });
  await expect(page.getByText(/viewing .* return to live/)).toBeVisible();
});
