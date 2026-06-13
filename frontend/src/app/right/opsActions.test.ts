import { afterEach, describe, expect, it } from "vitest";

import { appDispatcher } from "../../platform/dispatch/middleware";
import { engineClient } from "../../stores/server/engine";
import { MockEngine } from "../../testing/mockEngine";
import { OPS_ACTION, dispatchOps } from "./opsActions";

describe("ops dispatch adoption (B-1)", () => {
  afterEach(() => {
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("registers a handler for the ops action on the app dispatcher", () => {
    expect(appDispatcher.hasHandler(OPS_ACTION)).toBe(true);
  });

  it("routes an ops intent through the dispatch seam to the engine ops proxy", async () => {
    const mock = new MockEngine();
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return mock.fetchImpl(input, init);
    });

    const result = await dispatchOps({ target: "core", verb: "vault-check" });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/ops/core/vault-check");
    expect(result).toBeDefined();
  });

  it("routes a rag verb to the rag ops proxy", async () => {
    const mock = new MockEngine();
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return mock.fetchImpl(input, init);
    });

    await dispatchOps({ target: "rag", verb: "reindex" });

    expect(calls[0]).toContain("/ops/rag/reindex");
  });
});
