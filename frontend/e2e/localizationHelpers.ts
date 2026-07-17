// Shared helper for the localization e2e specs: deterministic access to the
// corpus browser pane, whose visibility persists server-side and is mutated by
// concurrent runs against the shared engine store.

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** The left rail's visibility persists server-side and concurrent runs mutate
 *  it — ensure the corpus browser is on screen via the one command plane (the
 *  same "Show/Expand navigation panel" commands a user would run). */
export async function ensureBrowserVisible(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.locator("[data-vault-browser]").isVisible()) return;
    await page.keyboard.press("Control+k");
    const input = page
      .getByRole("dialog")
      .getByRole("combobox")
      .or(page.getByRole("dialog").getByRole("textbox"))
      .first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("navigation panel");
    const action = page
      .getByRole("option", { name: /(show|expand) navigation panel/i })
      .first();
    if (await action.count()) {
      await action.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  }
  await expect(page.locator("[data-vault-browser]")).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Boot the app against the REAL, working wire first (so `ensureBrowserVisible`'s
 * own command round-trip — which re-fetches `/vault-tree` — never races an
 * already-broken interception), switch to the Vault documents tab, THEN
 * install the given failing route and reload to hit it. This proves the
 * genuine working-to-broken transition rather than a page that starts broken
 * before it ever painted a working state.
 */
export async function bootHealthyThenBreakVaultTree(
  page: Page,
  installRoute: () => Promise<void>,
) {
  await page.goto("/");
  await ensureBrowserVisible(page);
  await page.getByText("Documents", { exact: true }).first().click();
  await expect(page.locator("[data-vault-browser]")).toBeVisible({
    timeout: 10_000,
  });

  await installRoute();
  await page.reload();
  await ensureBrowserVisible(page).catch(() => undefined);
}

/** Every expandable tree/fold row carries a real `aria-expanded` state
 *  (TreeBrowser.tsx). Fold headers TOGGLE on click — a prior spec in the same
 *  worker (or the same server-persisted session) may have already expanded
 *  it, so a blind click can COLLAPSE it instead. Check the real state first
 *  and only click when it is genuinely collapsed, so this is idempotent
 *  regardless of what earlier tests left behind. */
export async function ensureExpanded(row: import("@playwright/test").Locator) {
  const expanded = await row.getAttribute("aria-expanded");
  if (expanded === "false") {
    await row.click();
  }
}
