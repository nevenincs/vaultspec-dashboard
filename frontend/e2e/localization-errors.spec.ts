// Localization E2E (W06.P19.S142): exercises production error boundaries
// against the real served application and proves raw diagnostics never
// render in ANY build mode. Runs under BOTH playwright.config.ts (the
// production `vaultspec serve` build) and playwright.localization.config.ts
// (the Vite dev build) — see each config's testMatch/testIgnore — so the
// proof holds across build modes, not just one.
//
// The fault is forced through Playwright's network-layer route interception
// (an honest lever external to the app), returning response BODIES shaped
// like real diagnostic leakage (a stack trace, an internal file path, a raw
// exception class name) so the assertion proves the UI actively STRIPS this
// content rather than merely never having generated it.

import { expect, test } from "@playwright/test";

import { bootHealthyThenBreakVaultTree } from "./localizationHelpers";

const DIAGNOSTIC_BODY = JSON.stringify({
  error: "TypeError: Cannot read properties of undefined (reading 'nodes')",
  stack:
    "at resolveGraph (Y:\\code\\vaultspec-dashboard-worktrees\\main\\engine\\src\\graph.rs:142:9)\n" +
    "at handleRequest (/home/runner/work/vaultspec/engine/src/server.rs:88:5)",
});

// Signatures unique to the INJECTED fixture diagnostic — never a generic
// path/stack-frame pattern, which would false-positive on the real vault
// corpus's own legitimate content (this repository's plan/ADR documents
// genuinely reference real source file paths in their prose).
const DIAGNOSTIC_SIGNATURES = [
  "TypeError",
  "Cannot read properties",
  "resolveGraph",
  "handleRequest",
  "graph.rs:142",
  "server.rs:88",
  "runner/work/vaultspec",
] as const;

async function expectNoDiagnosticLeak(
  page: import("@playwright/test").Page,
  scope: import("@playwright/test").Locator,
) {
  const text = await scope.innerText();
  for (const signature of DIAGNOSTIC_SIGNATURES) {
    expect(text).not.toContain(signature);
  }
  expect(text).not.toContain("{{");
  expect(text).not.toMatch(/\bcommon:|\bdocuments:|\berrors:/);
  // A page-level check too: nothing in the DOM anywhere carries the raw body.
  const bodyText = await page.locator("body").innerText();
  for (const signature of DIAGNOSTIC_SIGNATURES) {
    expect(bodyText).not.toContain(signature);
  }
}

test.describe("production error-boundary diagnostic safety (live)", () => {
  test("a malformed vault-listing failure never leaks its raw diagnostic body", async ({
    page,
  }) => {
    await bootHealthyThenBreakVaultTree(page, async () => {
      await page.route("**/vault-tree**", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: DIAGNOSTIC_BODY,
        }),
      );
    });

    const leftRail = page.locator("[data-left-rail]");
    await expect(leftRail).toContainText(/unavailable/i, { timeout: 10_000 });
    await expectNoDiagnosticLeak(page, leftRail);
  });

  test("a malformed status-endpoint failure never leaks its raw diagnostic body", async ({
    page,
  }) => {
    await page.route("**/status", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: DIAGNOSTIC_BODY,
      }),
    );

    await page.goto("/");
    await page.waitForTimeout(3_000);
    await expectNoDiagnosticLeak(page, page.locator("body"));
  });

  test("a completely malformed (non-JSON) response body never surfaces raw text", async ({
    page,
  }) => {
    await bootHealthyThenBreakVaultTree(page, async () => {
      await page.route("**/vault-tree**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "panic: index out of bounds at engine/src/graph.rs:88",
        }),
      );
    });
    await page.waitForTimeout(1_000);

    await expectNoDiagnosticLeak(page, page.locator("[data-left-rail]"));
  });

  test("an aborted request never leaves a raw network-error message on screen", async ({
    page,
  }) => {
    await bootHealthyThenBreakVaultTree(page, async () => {
      await page.route("**/vault-tree**", (route) => route.abort("failed"));
    });
    await page.waitForTimeout(1_000);

    const leftRail = page.locator("[data-left-rail]");
    const text = await leftRail.innerText();
    expect(text).not.toMatch(/net::|ERR_FAILED|NetworkError|Failed to fetch/i);
    await expectNoDiagnosticLeak(page, leftRail);
  });
});
