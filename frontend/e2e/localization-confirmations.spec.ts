// Localization E2E (W06.P19.S143): destructive confirmations against the live
// served application. Drives the REAL feature-archive confirmation (the one
// destructive-kind confirmation reachable from the corpus browser) and proves
// the dialog carries an explicit consequence body, a specific destructive verb
// on the confirm control (never a generic "OK"), and safe cancel wording — then
// CANCELS, so the live corpus is never mutated.

import { expect, test } from "@playwright/test";

import { ensureBrowserVisible } from "./localizationHelpers";

test.describe("destructive confirmation wording (live)", () => {
  test("the feature-archive confirmation names consequence, destructive verb, and safe cancel", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
    await ensureBrowserVisible(page);

    // The archive verb lives on FEATURE rows (vaultFeatureMenu.ts), which render
    // only once the tree's "Features" fold is expanded (collapsed by default).
    await page.getByText("Documents", { exact: true }).first().click();
    const tree = page.locator("[data-vault-browser]");
    await expect(tree).toBeVisible({ timeout: 10_000 });
    await tree.getByText("Features", { exact: true }).first().click();

    const featureRows = tree.getByRole("button", { name: /\s\d+$/ });
    await expect(featureRows.first()).toBeVisible({ timeout: 10_000 });
    const featureRowCount = Math.min(await featureRows.count(), 12);
    expect(featureRowCount).toBeGreaterThan(0);

    let archiveItem: import("@playwright/test").Locator | null = null;
    for (let i = 0; i < featureRowCount; i += 1) {
      await featureRows.nth(i).click({ button: "right" });
      const menu = page.getByRole("menu");
      await menu
        .first()
        .waitFor({ state: "visible", timeout: 2_000 })
        .catch(() => {});
      if (await menu.count()) {
        const candidate = menu.getByRole("menuitem", { name: /archive feature/i });
        if (await candidate.count()) {
          archiveItem = candidate.first();
          break;
        }
      }
      await page.keyboard.press("Escape");
    }
    expect(archiveItem, "no feature row exposed the archive action").not.toBeNull();

    // The menu item itself is plain language (no internal verb ids leak).
    const itemLabel = (await archiveItem!.innerText()).trim();
    expect(itemLabel).not.toMatch(/feature-archive|core:|ops:/);

    await archiveItem!.click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
    const dialogText = await dialog.first().innerText();

    // Explicit consequence: a non-trivial body beyond the title, with no raw
    // catalog artifacts or internal identifiers.
    expect(dialogText.length).toBeGreaterThan(40);
    expect(dialogText).not.toContain("{{");
    expect(dialogText).not.toMatch(/\$t\(/);
    expect(dialogText).not.toMatch(/\bfeature-archive\b/);

    // The confirm control carries the DESTRUCTIVE VERB, never a generic OK/Yes;
    // the cancel control is safe wording and actually cancels.
    const confirm = dialog.first().getByRole("button", { name: /archive/i });
    await expect(confirm).toBeVisible();
    const genericOk = dialog.first().getByRole("button", { name: /^(ok|yes)$/i });
    expect(await genericOk.count()).toBe(0);

    const cancel = dialog.first().getByRole("button", { name: /cancel/i });
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(dialog.first()).not.toBeVisible();

    // Cancel was safe: the corpus tree still renders (nothing archived).
    await expect(tree).toBeVisible();
  });
});
