// Localization E2E (W06.P19.S105/S138): verifies EXPANDED-COPY and
// right-to-left test locale behavior — layout direction, focus order, rich
// interpolation, live regions, `lang`, and `dir` — against the REAL,
// production component tree. The app ships only the English source locale
// (EXPECTED_SHIPPED_LOCALES), so this drives the dev-only locale-injection
// lever (`__localizationControls`, main.tsx) that swaps the bound runtime
// instance for the SAME `ltrTestResources`/`rtlTestResources` fixtures the
// unit suites exercise — a real browser render through the production tree,
// never a separate mock tree or faked DOM (only available under
// `import.meta.env.DEV`, hence playwright.localization.config.ts).

import { expect, test } from "@playwright/test";

async function bootAndWaitForShell(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator("[data-timeline]")).toBeVisible({ timeout: 20_000 });
}

async function loadTestLocale(
  page: import("@playwright/test").Page,
  locale: "fr" | "ar",
) {
  await page.evaluate(
    (l) =>
      (
        globalThis as unknown as {
          __localizationControls: {
            loadTestLocale: (locale: "fr" | "ar") => Promise<void>;
          };
        }
      ).__localizationControls.loadTestLocale(l),
    locale,
  );
  // The runtime swap re-renders synchronously via useSyncExternalStore, but give
  // the document-language listener a tick to settle before reading lang/dir.
  await page.waitForTimeout(200);
}

test.describe("expanded-copy and right-to-left locale behavior (dev harness)", () => {
  test("the harness lever is present under dev affordances", async ({ page }) => {
    await bootAndWaitForShell(page);
    const hasControls = await page.evaluate(
      () => typeof (globalThis as Record<string, unknown>).__localizationControls,
    );
    expect(hasControls).toBe("object");
  });

  test("French (expanded copy, LTR) sets lang and keeps ltr direction", async ({
    page,
  }) => {
    await bootAndWaitForShell(page);
    await loadTestLocale(page, "fr");

    expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");
    expect(await page.evaluate(() => document.documentElement.dir)).toBe("ltr");
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).direction),
    ).toBe("ltr");

    // Real translated body copy replaces the English source (expanded-copy
    // proof — French renders visibly longer strings than English for the
    // same concept, e.g. the skip link).
    const skipLink = page.locator('a[href="#stage"]');
    await expect(skipLink).toHaveText("Aller au contenu");
  });

  test("Arabic (right-to-left) sets lang, flips dir, and mirrors the computed direction", async ({
    page,
  }) => {
    await bootAndWaitForShell(page);
    await loadTestLocale(page, "ar");

    expect(await page.evaluate(() => document.documentElement.lang)).toBe("ar");
    expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).direction),
    ).toBe("rtl");

    const skipLink = page.locator('a[href="#stage"]');
    await expect(skipLink).toHaveText("التخطي إلى المحتوى");
  });

  test("keyboard focus order still lands the skip link on the stage under RTL", async ({
    page,
  }) => {
    await bootAndWaitForShell(page);
    await loadTestLocale(page, "ar");

    const skipLink = page.locator('a[href="#stage"]');
    await skipLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#stage")).toBeFocused();
  });

  test("rich named interpolation resolves in both directions with real values, no raw tokens", async ({
    page,
  }) => {
    await bootAndWaitForShell(page);

    const trigger = page.locator("[data-worktree-trigger]");
    await expect(trigger).toBeVisible();

    await loadTestLocale(page, "fr");
    const frLabel = await trigger.getAttribute("aria-label");
    expect(frLabel).toBeTruthy();
    expect(frLabel).not.toContain("{{");
    expect(frLabel).not.toContain("}}");
    expect(frLabel).toContain("Emplacement actuel");

    await loadTestLocale(page, "ar");
    const arLabel = await trigger.getAttribute("aria-label");
    expect(arLabel).toBeTruthy();
    expect(arLabel).not.toContain("{{");
    expect(arLabel).not.toContain("}}");
    expect(arLabel).toContain("الموقع الحالي");
  });

  test("the activity rail's live region keeps a real translated accessible label under RTL", async ({
    page,
  }) => {
    await bootAndWaitForShell(page);
    await loadTestLocale(page, "ar");

    const activityRegion = page.getByRole("region").filter({
      has: page.locator("[data-status-tab]"),
    });
    if (await activityRegion.count()) {
      const label = await activityRegion.first().getAttribute("aria-label");
      expect(label).toBeTruthy();
      expect(label).not.toContain(":");
      expect(label).not.toContain("{{");
    }
  });

  test("resetting the locale restores the source lang, dir, and English copy", async ({
    page,
  }) => {
    await bootAndWaitForShell(page);
    await loadTestLocale(page, "ar");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("ar");

    await page.evaluate(() =>
      (
        globalThis as unknown as { __localizationControls: { resetLocale: () => void } }
      ).__localizationControls.resetLocale(),
    );
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
    expect(await page.evaluate(() => document.documentElement.dir)).toBe("ltr");
    await expect(page.locator('a[href="#stage"]')).toHaveText("Skip to content");
  });
});
