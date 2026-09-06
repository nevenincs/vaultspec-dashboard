/**
 * @vitest-environment happy-dom
 *
 * Proves the application harness does not destroy the happy-dom window between
 * tests. RTL cleanup owns component unmount at that boundary; Vitest alone owns
 * the awaited window abort after this file finishes.
 *
 * Restoring a global afterEach hook that calls `happyDOM.abort()` makes the
 * second case observe an abort call and fail. The exact property descriptor is
 * restored in afterAll so Vitest's file teardown invokes the native implementation
 * normally.
 */

import { afterAll, describe, expect, it } from "vitest";

interface HappyDOMLifecycle {
  abort(): Promise<void>;
}

const happyDOM = (
  globalThis as typeof globalThis & {
    happyDOM?: HappyDOMLifecycle;
  }
).happyDOM;

if (!happyDOM) {
  throw new Error("happy-dom lifecycle guard requires the happy-dom environment");
}

const ownAbortDescriptor = Object.getOwnPropertyDescriptor(happyDOM, "abort");
let abortCalls = 0;

Object.defineProperty(happyDOM, "abort", {
  configurable: true,
  value: async () => {
    abortCalls += 1;
  },
});

afterAll(() => {
  if (ownAbortDescriptor) {
    Object.defineProperty(happyDOM, "abort", ownAbortDescriptor);
  } else {
    delete (happyDOM as Partial<HappyDOMLifecycle>).abort;
  }
});

describe("the per-test window lifecycle boundary", () => {
  it("arms an observer on the live happy-dom abort capability", () => {
    expect(abortCalls).toBe(0);
  });

  it("reaches the next case without an application-owned window abort", () => {
    expect(
      (
        globalThis as typeof globalThis & {
          happyDOM?: HappyDOMLifecycle;
        }
      ).happyDOM,
    ).toBe(happyDOM);
    expect(abortCalls).toBe(0);
  });
});
