import { afterEach, describe, expect, it, vi } from "vitest";

import { abortHappyDOM } from "./happyDOMAbort";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the happy-dom abort barrier", () => {
  it("does not resolve before native abort settlement", async () => {
    const abortSettlement = deferred();
    const abort = vi.fn(() => abortSettlement.promise);
    let barrierSettled = false;

    const barrier = abortHappyDOM({ abort });
    void barrier.then(() => {
      barrierSettled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(abort).toHaveBeenCalledOnce();
    expect(barrierSettled).toBe(false);

    abortSettlement.resolve();
    await barrier;
    expect(barrierSettled).toBe(true);
  });

  it("propagates native abort rejection to the owning test", async () => {
    const failure = new Error("abort settlement failed");

    await expect(abortHappyDOM({ abort: () => Promise.reject(failure) })).rejects.toBe(
      failure,
    );
  });

  it("does not restore a pre-abort drain or fixed timer", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const waitUntilComplete = vi.fn(() => Promise.resolve());
    const abort = vi.fn(() => Promise.resolve());
    const happyDOM = { abort, waitUntilComplete };

    await abortHappyDOM(happyDOM);

    expect(abort).toHaveBeenCalledOnce();
    expect(waitUntilComplete).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});
