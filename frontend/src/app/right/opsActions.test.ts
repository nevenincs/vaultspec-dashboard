import { afterEach, describe, expect, it } from "vitest";

import { appDispatcher } from "../../platform/dispatch/middleware";
import { engineClient } from "../../stores/server/engine";
import { liveTransport } from "../../testing/liveClient";
import { OPS_ACTION, dispatchOps } from "./opsActions";

// The ops dispatch seam routed against the REAL engine ops proxy (no mock). The
// request URL is captured by a counting wrapper over the LIVE transport — real
// traffic observation, not a stub — so a passing test proves the verb reaches the
// genuine /ops/{target}/{verb} endpoint.

describe("ops dispatch adoption (B-1)", () => {
  afterEach(() => {
    engineClient.useTransport(liveTransport);
  });

  it("registers a handler for the ops action on the app dispatcher", () => {
    expect(appDispatcher.hasHandler(OPS_ACTION)).toBe(true);
  });

  it("routes an ops intent through the dispatch seam to the engine ops proxy", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    // The routing is what's under test: the verb must reach /ops/core/vault-check
    // on the real proxy. The core result itself (a clean vault-check vs a
    // findings-bearing non-zero exit) is incidental, so tolerate either outcome.
    const result = await dispatchOps({ target: "core", verb: "vault-check" }).catch(
      (e: unknown) => e,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/ops/core/vault-check");
    expect(result).toBeDefined();
  });

  it("routes a rag verb to the rag ops proxy", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    await dispatchOps({ target: "rag", verb: "reindex" }).catch(() => undefined);

    expect(calls[0]).toContain("/ops/rag/reindex");
  });
});
