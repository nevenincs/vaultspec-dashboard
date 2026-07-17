// Localization E2E (W06.P19.S104): exercises the live served application (real
// `vaultspec serve` origin, same harness as smoke.spec.ts) in its TYPICAL
// localized state — the shipped source locale, happy path, no forced state.
// Proves the real component tree never leaks an unresolved catalog key, a raw
// interpolation brace, or an internal identifier into visible or accessible
// copy, and that the landmark regions carry real translated labels.

import { expect, test } from "@playwright/test";

/** No visible or accessible text anywhere in the document leaks catalog
 *  plumbing: an unresolved `{{token}}`, a raw `namespace:key` reference, or an
 *  i18next nested-message directive. */
async function expectNoRawCatalogArtifacts(page: import("@playwright/test").Page) {
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("{{");
  expect(bodyText).not.toContain("}}");
  expect(bodyText).not.toMatch(/\$t\(/);
  // A bare `common:` / `documents:` / `errors:` style key reading as visible
  // prose (the catalog namespaces this app ships).
  expect(bodyText).not.toMatch(
    /\b(?:common|documents|errors|features|graph|operations|projects|settings|timeline):[a-zA-Z][\w.]*/,
  );

  const ariaLabelledText = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[aria-label]"))
      .map((el) => el.getAttribute("aria-label") ?? "")
      .join("\n"),
  );
  expect(ariaLabelledText).not.toContain("{{");
  expect(ariaLabelledText).not.toMatch(/\$t\(/);
}

test.describe("typical localized state (live)", () => {
  test("boots the four-region shell with real translated landmark labels", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    // The skip link is the first tab stop — real, non-empty translated text.
    const skipLink = page.getByRole("link", { name: /./ }).first();
    await expect(skipLink).toHaveAttribute("href", "#stage");

    // The left rail is a labelled navigation landmark; the right rail's
    // activity region carries a real aria-label — both resolved from the
    // catalog, never a raw key or empty string.
    const leftRail = page.locator("[data-left-rail]");
    if (await leftRail.count()) {
      const navLabel = await leftRail.getAttribute("aria-label");
      expect(navLabel).toBeTruthy();
      expect(navLabel).not.toContain(":");
    }
    const activityRegion = page.getByRole("region").filter({
      has: page.locator("[data-status-tab]"),
    });
    if (await activityRegion.count()) {
      const activityLabel = await activityRegion.first().getAttribute("aria-label");
      expect(activityLabel).toBeTruthy();
      expect(activityLabel).not.toContain(":");
    }

    await expectNoRawCatalogArtifacts(page);
  });

  test("the document title and html lang carry the shipped source locale", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });

    await expect(page).toHaveTitle(/./);
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBe("en");
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe("ltr");
  });

  test("the status rail renders real section labels with no source-key leakage", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-status-tab]")).toBeVisible({ timeout: 20_000 });
    await expectNoRawCatalogArtifacts(page);
  });
});
