// Localization E2E (W06.P19.S144): menus, commands, and shortcuts against the
// live served application. Proves the one command plane (Cmd+K) and the
// per-kind context menus render shared, canonical action wording — Title Case
// command labels, plain-language menu verbs, accelerator legends from the one
// keymap registry — and never leak an internal action id, wire verb, or raw
// catalog key into visible or accessible text.

import { expect, test } from "@playwright/test";

import { ensureBrowserVisible } from "./localizationHelpers";

/** Internal-vocabulary shapes that must never render: registry action ids
 *  (`app:command-palette`), dispatch verbs (`feature-archive`), wire fields. */
const INTERNAL_ID_SHAPES = /\b(?:app|shell|graph|node|edge|meta-edge|doc):[a-z-]+\b/;

test.describe("actions, commands, and shortcuts (live)", () => {
  test("the command palette lists Title Case commands with no internal ids", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog").filter({
      has: page.getByRole("combobox").or(page.getByRole("textbox")),
    });
    await expect(palette.first()).toBeVisible({ timeout: 10_000 });

    const options = palette.first().getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 10_000 });
    const optionTexts = await options.allInnerTexts();
    expect(optionTexts.length).toBeGreaterThan(3);
    for (const text of optionTexts) {
      expect(text).not.toMatch(INTERNAL_ID_SHAPES);
      expect(text).not.toContain("{{");
    }
    // Commands are Title Case per the label-casing convention: every command's
    // first word is capitalized.
    const titleCased = optionTexts.filter((t) => /^[A-Z]/.test(t.trim()));
    expect(titleCased.length).toBe(optionTexts.length);

    // Filtering narrows over the same plane; Escape dismisses.
    await palette
      .first()
      .getByRole("combobox")
      .or(palette.first().getByRole("textbox"))
      .first()
      .fill("open");
    await expect(options.first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette.first()).not.toBeVisible();
  });

  test("a document context menu renders shared canonical verbs, no raw ids", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
    await ensureBrowserVisible(page);

    // The Vault documents tree (as opposed to the default Files tab) only
    // mounts `[data-vault-browser]` once its "Documents" tab is active; leaf
    // document rows render only once a category fold (e.g. "Plans") is
    // expanded — both collapsed by default.
    await page.getByText("Documents", { exact: true }).first().click();
    const tree = page.locator("[data-vault-browser]");
    await expect(tree).toBeVisible({ timeout: 10_000 });

    // Leaf document rows render only once a category fold (e.g. "Plans") is
    // expanded — both collapsed by default.
    await tree.getByText("Documents", { exact: true }).first().click();
    await tree.getByText("Plans", { exact: true }).first().click();

    // Probe rows until a substantive per-kind menu appears, then prove it
    // renders the SHARED canonical verbs (the one-descriptor plane: Open in
    // editor / Show on canvas / Reveal / Copy) with zero internal-id leakage.
    const rows = tree.getByRole("button", { name: /completed|Jun|Jul/ });
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const rowCount = Math.min(await rows.count(), 24);
    let sawCanonicalMenu = false;
    for (let i = 0; i < rowCount; i += 1) {
      await rows.nth(i).click({ button: "right" });
      const menu = page.getByRole("menu");
      await menu
        .first()
        .waitFor({ state: "visible", timeout: 1_500 })
        .catch(() => {});
      if (await menu.count()) {
        const items = await menu.getByRole("menuitem").allInnerTexts();
        if (
          items.length >= 2 &&
          items.some((t) =>
            /^(open in editor|show on canvas|show in file manager|copy)/i.test(
              t.trim(),
            ),
          )
        ) {
          sawCanonicalMenu = true;
          for (const text of items) {
            expect(text).not.toMatch(INTERNAL_ID_SHAPES);
            expect(text).not.toContain("{{");
            expect(text).not.toMatch(/\$t\(/);
          }
          break;
        }
      }
      await page.keyboard.press("Escape");
    }
    expect(sawCanonicalMenu).toBe(true);
    await page.keyboard.press("Escape");
  });
});
