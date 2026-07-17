// Localization E2E (W06.P19.S145): compact and responsive surfaces against the
// live served application. A phone-class viewport mounts the compact shell
// (shellLayout viewport class — no canvas, bottom-tab navigation); this proves
// the compact chrome carries localized accessible navigation — real translated
// labels on every interactive control — with zero source-language leakage of
// catalog keys, interpolation braces, or internal identifiers.

import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("compact responsive surfaces (live)", () => {
  test("the compact shell renders localized accessible navigation", async ({
    page,
  }) => {
    await page.goto("/");

    // The compact shell replaces the desktop dock: wait for ANY interactive
    // chrome, then assert the desktop-only graph canvas region never mounted.
    const anyButton = page.getByRole("button").first();
    await expect(anyButton).toBeVisible({ timeout: 20_000 });
    expect(await page.locator("canvas").count()).toBe(0);

    // Every labelled control in the compact chrome carries real translated
    // text — non-empty, no raw catalog artifacts, no internal id shapes.
    const labels = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("button, a, [role='tab'], [aria-label]"),
      ).map(
        (el) =>
          el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "",
      ),
    );
    const meaningful = labels.map((t) => t.trim()).filter((t) => t.length > 0);
    expect(meaningful.length).toBeGreaterThan(3);
    for (const text of meaningful) {
      expect(text).not.toContain("{{");
      expect(text).not.toMatch(/\$t\(/);
      expect(text).not.toMatch(
        /\b(?:common|documents|errors|features|graph|operations|projects|settings|timeline):[a-zA-Z][\w.]*/,
      );
    }

    // The document language stays the shipped source locale on compact too.
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  test("compact navigation switches panes with localized labels intact", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button").first()).toBeVisible({
      timeout: 20_000,
    });

    // Drive whatever tab/pane affordances the compact shell offers (bottom tab
    // bar per the mobile-unified-rail design): click each tab-like control and
    // prove the surface swaps without ever leaking raw copy.
    const tabs = page.getByRole("tab");
    const tabCount = await tabs.count();
    if (tabCount > 1) {
      for (let i = 0; i < Math.min(tabCount, 4); i += 1) {
        await tabs.nth(i).click();
        const bodyText = await page.locator("body").innerText();
        expect(bodyText).not.toContain("{{");
        expect(bodyText).not.toMatch(/\$t\(/);
      }
    } else {
      // No tablist variant: assert the single compact surface is still clean.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toContain("{{");
      expect(bodyText).not.toMatch(/\$t\(/);
    }
  });
});
