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
  // The graph top bar is retired: graph navigation is now a canvas overlay (the
  // vertical camera cluster), per the binding graph/Hero redesign.
  await expect(page.locator("[data-graph-nav-controls]")).toBeVisible();
});

test("the constellation renders from the live graph", async ({ page }) => {
  await page.goto("/");
  // The field mounts its canvas into the stage host… (the scene renders
  // through LAYERED canvases now — base field + overlay — so target the
  // first rather than tripping strict mode on the multi-match)
  const canvas = page.locator("[data-stage-host] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  // ...and the current activity rail is mounted while the live corpus is read
  // through the engine status endpoint below. The rail's tabs were retired by
  // the activity-rail realignment — the rail IS the one status surface now, so
  // assert its status marker rather than the removed tab strip.
  await expect(page.locator("[data-status-tab]")).toBeVisible();
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
  await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
  // The right-rail Search tab was retired (activity-rail realignment): search
  // is now the Cmd/Ctrl+Alt+S palette over the one provider seam. Prove the
  // live surface opens, then prove the wire round-trip directly.
  await page.keyboard.press("Control+Alt+s");
  const searchDialog = page.getByRole("dialog", {
    name: "Search documents and code",
  });
  await expect(searchDialog.first()).toBeVisible({ timeout: 10_000 });
  await searchDialog.first().getByRole("combobox").first().fill("dashboard");
  await page.keyboard.press("Escape");
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
});

// RETIRED (localization-S108 follow-up sweep): "scrubbing the playhead renders
// the network as of T". The timeline rebuild tore down the playhead overlay
// and its grip entirely (Timeline.tsx: "no visual playhead overlay"), and the
// time-travel driver (timeTravel.ts scrubTo) currently has NO production call
// site — there is no user-reachable scrub entry to drive end-to-end. The
// driver itself stays unit-covered by timeTravel.test.ts; when a scrub entry
// point returns to the product, restore an end-to-end as-of test here rather
// than resurrecting the removed playhead selectors.
