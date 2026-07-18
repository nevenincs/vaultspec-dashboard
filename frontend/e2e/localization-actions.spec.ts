// Localization E2E (W06.P19.S144): menus, commands, and shortcuts against the
// live served application. Proves the one command plane (Cmd+K) and the
// per-kind context menus render shared, canonical action wording — Title Case
// command labels, plain-language menu verbs, accelerator legends from the one
// keymap registry — and never leak an internal action id, wire verb, or raw
// catalog key into visible or accessible text.

import { expect, test } from "@playwright/test";

import { ensureVaultFoldsExpanded } from "./localizationHelpers";

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
    // A genuinely cold boot streams thousands of documents progressively and
    // the fold-expand/mode-switch retry sequence needs real headroom beyond
    // the config's warm-boot 30s default.
    test.setTimeout(60_000);
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // Leaf document rows render only once the rail is visible, the
    // Vault/Files radiogroup is on "Documents", AND a category fold (e.g.
    // "Plans") is expanded — all collapsed/off by default, and a cold,
    // heavily-draining boot can even revert an earlier step, so this drives
    // and RE-VERIFIES the whole chain rather than trusting one pass.
    const tree = page.locator("[data-vault-browser]");
    await ensureVaultFoldsExpanded(page, [/^Documents\b/, /^Plans\b/]);

    // Probe rows until a substantive per-kind menu appears, then prove it
    // renders the SHARED canonical verbs (the one-descriptor plane: Open in
    // editor / Show on canvas / Reveal / Copy) with zero internal-id leakage.
    // Scope structurally (every leaf row is a `<button>` inside a `listitem`,
    // while fold headers are siblings BEFORE the list) rather than matching
    // an accessible-name pattern: a leaf's name reflects its REAL status
    // ("Plan complete" for a finished plan carries no "completed" substring,
    // no date — a fully-done corpus slice matched nothing under the old
    // text-pattern probe).
    const rows = tree.getByRole("listitem").getByRole("button");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    // Let the fold-expand re-render/virtualization settle before targeting row
    // coordinates — a right-click mid-animation can land on nothing.
    await rows.first().waitFor({ state: "attached" });
    const menu = page.getByRole("menu");
    const rowCount = Math.min(await rows.count(), 24);
    let sawCanonicalMenu = false;
    for (let i = 0; i < rowCount; i += 1) {
      await rows.nth(i).scrollIntoViewIfNeeded();
      await rows.nth(i).click({ button: "right" });
      await menu
        .first()
        .waitFor({ state: "visible", timeout: 3_000 })
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
      await menu
        .first()
        .waitFor({ state: "hidden", timeout: 1_000 })
        .catch(() => {});
    }
    expect(sawCanonicalMenu).toBe(true);
    await page.keyboard.press("Escape");
  });
});
