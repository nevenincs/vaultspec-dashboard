import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createLiveRenderQueryTeardown, isStructuralQueryKey } from "./queryTeardown";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (cause: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function queryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function startQuery(
  client: QueryClient,
  queryKey: readonly unknown[],
  work: Promise<string>,
): Promise<string> {
  return client.fetchQuery({ queryKey, queryFn: () => work });
}

describe("live-render query teardown", () => {
  it("awaits finite work while mounted, then structural and authoring settlement before clear/reset", async () => {
    const order: string[] = [];
    const finite = deferred<string>();
    const structural = deferred<string>();
    const authoring = deferred<void>();
    const cleanupStarted = deferred<void>();
    const client = queryClient();
    const clear = vi.spyOn(client, "clear").mockImplementation(() => {
      order.push("clear");
    });
    const teardown = createLiveRenderQueryTeardown({
      cleanup: () => {
        order.push("cleanup");
        cleanupStarted.resolve();
      },
      getAuthoringStopSettlement: () => authoring.promise,
    });
    teardown.enroll(client);
    const finiteFetch = startQuery(client, ["session", "finite"], finite.promise);
    const structuralFetch = startQuery(
      client,
      ["engine", "stream", "graph"],
      structural.promise,
    );
    const completed = teardown.run(() => order.push("reset"));

    await Promise.resolve();
    expect(order).toEqual([]);
    finite.resolve("finite");
    await finiteFetch;
    await cleanupStarted.promise;
    expect(order).toEqual(["cleanup"]);

    authoring.resolve();
    await Promise.resolve();
    expect(order).toEqual(["cleanup"]);

    structural.resolve("structural");
    await structuralFetch;
    await completed;
    expect(order).toEqual(["cleanup", "clear", "reset"]);
    expect(clear).toHaveBeenCalledOnce();
  });

  it("makes omitted enrollment observably skip finite ownership", async () => {
    const finite = deferred<string>();
    const client = queryClient();
    const cleanup = vi.fn();
    const teardown = createLiveRenderQueryTeardown({
      cleanup,
      getAuthoringStopSettlement: () => Promise.resolve(),
    });
    const fetch = startQuery(client, ["session", "finite"], finite.promise);

    await teardown.run(() => undefined);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(client.getQueryState(["session", "finite"])?.fetchStatus).toBe("fetching");
    finite.resolve("done");
    await fetch;
    client.clear();
  });

  it("fails after exactly one post-settlement snapshot when new finite work starts", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const client = queryClient();
    const teardown = createLiveRenderQueryTeardown({
      cleanup: vi.fn(),
      getAuthoringStopSettlement: () => Promise.resolve(),
    });
    teardown.enroll(client);
    let secondFetch: Promise<string> | undefined;
    const firstFetch = client.fetchQuery({
      queryKey: ["finite", "first"],
      queryFn: async () => {
        const result = await first.promise;
        secondFetch = startQuery(client, ["finite", "second"], second.promise);
        return result;
      },
    });
    const completed = teardown.run(() => undefined);

    first.resolve("first");
    await firstFetch;
    await expect(completed).rejects.toThrow(
      "new finite query work started during teardown",
    );
    expect(client.getQueryState(["finite", "second"])?.fetchStatus).toBe("fetching");

    second.resolve("second");
    await secondFetch;
    client.clear();
  });

  it.each([
    ["engine stream", ["engine", "stream", "graph"], true],
    ["a2a relay", ["a2a", "run-relay", "run-1"], true],
    ["engine near miss", ["engine", "streams", "graph"], false],
    ["a2a near miss", ["a2a", "relay", "run-1"], false],
    ["other stream", ["authoring", "stream"], false],
  ])("classifies the exact %s key", (_label, queryKey, expected) => {
    expect(isStructuralQueryKey(queryKey)).toBe(expected);
  });

  it("preserves a finite query rejection in query state until cleanup", async () => {
    const failure = new Error("finite failed");
    const finite = deferred<string>();
    const client = queryClient();
    let stateAtCleanup: unknown;
    const teardown = createLiveRenderQueryTeardown({
      cleanup: () => {
        stateAtCleanup = client.getQueryState(["finite", "failure"]);
      },
      getAuthoringStopSettlement: () => Promise.resolve(),
    });
    teardown.enroll(client);
    const fetch = startQuery(client, ["finite", "failure"], finite.promise);
    void fetch.catch(() => undefined);
    const completed = teardown.run(() => undefined);

    finite.reject(failure);
    await completed;

    expect(stateAtCleanup).toMatchObject({ status: "error", error: failure });
  });

  it("surfaces the original authoring settlement rejection before clear/reset", async () => {
    const failure = new Error("reader cancel failed");
    const client = queryClient();
    const clear = vi.spyOn(client, "clear");
    const reset = vi.fn();
    const teardown = createLiveRenderQueryTeardown({
      cleanup: vi.fn(),
      getAuthoringStopSettlement: () => Promise.reject(failure),
    });
    teardown.enroll(client);

    await expect(teardown.run(reset)).rejects.toBe(failure);

    expect(clear).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
