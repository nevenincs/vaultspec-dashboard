// S06 adversarial — idempotent scene mount bindings.
//
// Reproduce-then-fix cadence: each case is written so that removing the
// assemblyMounted guard from DashboardField.mount() causes the test to fail.
//
// In the node test environment PixiField.mount() is a no-op (no DOM / WebGL),
// so the synchronous part of DashboardField.mount() — registering the onReady
// cleanup in detachListeners — runs without side-effects and is fully observable.

import { describe, expect, it } from "vitest";

import { DashboardField } from "./fieldAssembly";

/** Cast to reach the private detachListeners array (read-only inspection). */
function detachCount(field: DashboardField): number {
  return (field as unknown as { detachListeners: (() => void)[] }).detachListeners
    .length;
}

describe("DashboardField.mount — S06 adversarial (idempotent assembly)", () => {
  it("first mount() registers exactly one cleanup entry in detachListeners", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    expect(detachCount(field)).toBe(1);
    field.destroy();
  });

  it("second mount() call is a no-op: detachListeners count does not grow", () => {
    // Without the assemblyMounted guard, a second mount() would push another
    // offReady entry and later register duplicate canvas / ticker / theme
    // listeners inside the onReady callback.
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    const after1 = detachCount(field);
    field.mount({} as HTMLElement); // should be swallowed by the guard
    expect(detachCount(field)).toBe(after1);
    field.destroy();
  });

  it("triple-mount does not accumulate extra listeners (adversarial: rapid remount storm)", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    const after1 = detachCount(field);
    field.mount({} as HTMLElement);
    field.mount({} as HTMLElement);
    expect(detachCount(field)).toBe(after1);
    field.destroy();
  });

  it("destroy() resets the guard so a subsequent mount() succeeds", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    field.destroy();
    // After destroy the guard must reset; a fresh mount() must register again.
    expect(detachCount(field)).toBe(0); // destroy cleared everything
    field.mount({} as HTMLElement);
    expect(detachCount(field)).toBeGreaterThan(0);
    field.destroy();
  });

  it("destroy() then double-mount obeys the guard on the re-mounted instance", () => {
    const field = new DashboardField();
    field.mount({} as HTMLElement);
    field.destroy();
    field.mount({} as HTMLElement);
    const after1 = detachCount(field);
    field.mount({} as HTMLElement); // guard must block
    expect(detachCount(field)).toBe(after1);
    field.destroy();
  });
});
