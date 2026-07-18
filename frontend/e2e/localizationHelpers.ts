// Shared helper for the localization e2e specs: deterministic access to the
// corpus browser pane, whose visibility persists server-side and is mutated by
// concurrent runs against the shared engine store.

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * `[data-vault-browser]` requires TWO independent conditions: the left rail
 * itself must be on screen (its visibility persists server-side and a prior
 * spec/session may have hidden it), AND the rail's Vault/Files radiogroup
 * must be on the "Documents" segment (a view-local toggle that defaults to
 * vault mode but, like the rail's visibility, can be left on "Files" by an
 * earlier interaction). Checking only `[data-vault-browser]` and never
 * driving the mode switch passes on a WARMED session (a previous test left
 * mode=vault) but hangs forever on a genuinely COLD one — this drives both
 * real levers explicitly, the same two actions a user would take.
 */
export async function ensureBrowserVisible(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // NEVER return from inside this loop on a single positive read: a cold,
    // heavily-draining boot has shown the tree flicker present-then-absent
    // (the mode reverting moments later) — only the POST-LOOP re-confirmed
    // check below is trusted to hand control back to the caller.
    if (await page.locator("[data-vault-browser]").isVisible()) break;

    // Lever 1: the rail's own visibility, via the one command plane (the same
    // "Show/Expand navigation panel" command a user would run).
    if (!(await page.locator("[data-left-rail]").isVisible())) {
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
      await page
        .locator("[data-left-rail]")
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => undefined);
    }

    // Lever 2: the Vault/Files radiogroup — switch to "Documents" (the real
    // BrowserModeToggle segment, not a proxy text match). VERIFY the check
    // actually took (a radiogroup click racing the palette's own focus/DOM
    // churn on a cold boot can silently miss), never trust one click. A cold
    // boot streams thousands of documents progressively, and the resulting
    // layout churn can make Playwright's actionability wait (stable bounding
    // box) stall past a normal click's window — `force: true` skips that
    // check since this loop already verifies the RESULT (`aria-checked`)
    // itself on the next iteration rather than trusting the click succeeded.
    const documentsRadio = page.getByRole("radio", { name: "Documents" });
    if (await documentsRadio.count()) {
      const checked = await documentsRadio.first().getAttribute("aria-checked");
      if (checked !== "true") {
        await documentsRadio.first().click({ force: true });
      }
    }

    await page.waitForTimeout(300);
  }
  await expect(page.locator("[data-vault-browser]")).toBeVisible({
    timeout: 10_000,
  });
  // A single positive `isVisible()` read can catch a transient/flickering
  // state (e.g. the Documents radio click landing but its render not yet
  // settled) — re-confirm the tree is STILL there a beat later before
  // handing control back to the caller.
  await page.waitForTimeout(300);
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

  await installRoute();
  await page.reload();
  await ensureBrowserVisible(page).catch(() => undefined);
}

/**
 * A cold, heavily-draining boot has shown the vault tree flicker
 * present-then-absent again AFTER `ensureBrowserVisible` already confirmed it
 * (expanding a fold under a multi-thousand-row progressive drain can coincide
 * with the mode reverting moments later) — this drives `ensureBrowserVisible`
 * + a sequence of `ensureExpanded` fold expansions, and if the tree vanishes
 * partway through, RESTARTS the whole sequence rather than hanging on a fold
 * locator that will never resolve against a torn-down tree.
 */
export async function ensureVaultFoldsExpanded(
  page: Page,
  foldNamePatterns: readonly RegExp[],
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // `ensureBrowserVisible` THROWS (a hard `expect`) when the tree never
    // stabilizes — catch it here so a genuine flicker retries the whole
    // sequence instead of aborting this function outright.
    const visible = await ensureBrowserVisible(page)
      .then(() => true)
      .catch(() => false);
    if (!visible) continue;
    const tree = page.locator("[data-vault-browser]");
    let survived = true;
    for (const pattern of foldNamePatterns) {
      if (!(await tree.isVisible())) {
        survived = false;
        break;
      }
      await ensureExpanded(tree.getByRole("button", { name: pattern }).first());
    }
    if (survived && (await tree.isVisible())) return;
  }
  // Final attempt: let the caller's own assertions surface the real failure
  // with a clear locator-timeout message rather than swallowing it here.
  await ensureBrowserVisible(page);
}

/**
 * Every expandable tree/fold row carries a real `aria-expanded` state
 * (TreeBrowser.tsx). Fold headers TOGGLE on click — a prior spec in the same
 * worker (or the same server-persisted session) may have already expanded
 * it, so a blind click can COLLAPSE it instead. Check the real state first
 * and only click when it is genuinely collapsed. On a genuinely COLD boot
 * the tree is often still progressively draining (the "Loading the full
 * list…" notice), so the click can land while the row set is mid-reflow and
 * silently not register — this VERIFIES the flip and retries rather than
 * trusting one click.
 */
export async function ensureExpanded(row: import("@playwright/test").Locator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Re-query the LIVE locator on every check (never snapshot an
    // ElementHandle): a cold, still-progressively-draining tree re-renders
    // its virtualized rows out from under a held handle, which would report
    // a stale/detached node's state forever instead of the real one. A SHORT
    // per-call timeout (never the full test budget) lets a torn-down tree
    // (the row's ancestor vanished) fail this attempt fast so the caller's
    // own retry/restart logic gets a real chance to run within the test's
    // overall time budget, instead of one hung call consuming all of it.
    const expanded = await row
      .getAttribute("aria-expanded", { timeout: 3_000 })
      .catch(() => null);
    if (expanded === "true") break;
    await row.click({ timeout: 3_000 }).catch(() => undefined);
    await row.page().waitForTimeout(300);
  }
  // The `aria-expanded` flip and its child rows painting are two separate
  // render passes on a cold, still-draining tree — give the body a moment to
  // actually mount before the caller starts querying its rows.
  await row.page().waitForTimeout(300);
}
