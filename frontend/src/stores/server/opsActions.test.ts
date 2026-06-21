import { afterEach, describe, expect, it } from "vitest";

import { appDispatcher } from "../../platform/dispatch/middleware";
import { liveTransport } from "../../testing/liveClient";
import { engineClient } from "./engine";
import {
  OPS_ACTION,
  OPS_BODY_CONTENT_MAX_CHARS,
  OPS_BODY_STRING_LIST_MAX_ITEMS,
  OPS_BODY_STRING_MAX_CHARS,
  OPS_VERB_MAX_CHARS,
  dispatchOps,
  isOpsDispatchIntent,
  isOpsWhitelistIntent,
  normalizeOpsTarget,
  normalizeOpsVerb,
  normalizeOpsWhitelistIntent,
} from "./opsActions";

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

  it("declares app-exposed ops through the centralized whitelist predicate", () => {
    expect(isOpsWhitelistIntent({ target: "core", verb: "vault-check" })).toBe(true);
    expect(isOpsWhitelistIntent({ target: "rag", verb: "reindex" })).toBe(true);
    expect(isOpsWhitelistIntent({ target: "rag", verb: "project-evict" })).toBe(false);
    expect(isOpsWhitelistIntent({ target: "core", verb: "set-body" })).toBe(false);
  });

  it("normalizes ops target and verb text at the stores-server seam", () => {
    expect(normalizeOpsTarget(" rag ")).toBe("rag");
    expect(normalizeOpsTarget("core")).toBe("core");
    expect(normalizeOpsTarget("git")).toBeNull();
    expect(normalizeOpsTarget({ target: "rag" })).toBeNull();
    expect(normalizeOpsVerb(" reindex ")).toBe("reindex");
    expect(normalizeOpsVerb("   ")).toBeNull();
    expect(normalizeOpsVerb("x".repeat(OPS_VERB_MAX_CHARS + 1))).toBeNull();
    expect(normalizeOpsVerb({ verb: "reindex" })).toBeNull();
  });

  it("normalizes app-exposed ops intents through one server seam", () => {
    expect(normalizeOpsWhitelistIntent({ target: " rag ", verb: " reindex " })).toEqual(
      {
        target: "rag",
        verb: "reindex",
      },
    );
    expect(
      normalizeOpsWhitelistIntent({ target: "rag", verb: "project-evict" }),
    ).toBeNull();
    expect(
      normalizeOpsWhitelistIntent({ target: "core", verb: "set-body" }),
    ).toBeNull();
  });

  it("guards terminal dispatch through the centralized dispatch predicate", () => {
    expect(isOpsDispatchIntent(null)).toBe(false);
    expect(isOpsDispatchIntent("core:vault-check")).toBe(false);
    expect(isOpsDispatchIntent({ target: "core" })).toBe(false);
    expect(isOpsDispatchIntent({ target: "core", verb: 42 })).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "vault-check",
        mode: "invalid",
      }),
    ).toBe(false);
    expect(isOpsDispatchIntent({ target: "core", verb: "vault-check" })).toBe(true);
    expect(isOpsDispatchIntent({ target: "core", verb: "set-body" })).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "set-body",
        mode: "write",
        body: { ref: "plan", body: "" },
      }),
    ).toBe(true);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "rename",
        mode: "write",
        body: { ref: "old-plan", to: "new-plan" },
      }),
    ).toBe(true);
    expect(
      isOpsDispatchIntent({ target: "core", verb: "delete-everything", mode: "write" }),
    ).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "create",
        mode: "create",
        body: { doc_type: "plan", feature: "state" },
      }),
    ).toBe(true);
    expect(
      isOpsDispatchIntent({ target: "core", verb: "set-body", mode: "create" }),
    ).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "rename",
        mode: "write",
        body: { ref: "old-plan", to: "x".repeat(OPS_BODY_STRING_MAX_CHARS + 1) },
      }),
    ).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "set-body",
        mode: "write",
        body: {
          ref: "plan",
          body: "x".repeat(OPS_BODY_CONTENT_MAX_CHARS + 1),
        },
      }),
    ).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "set-frontmatter",
        mode: "write",
        body: {
          ref: "plan",
          tags: Array.from(
            { length: OPS_BODY_STRING_LIST_MAX_ITEMS + 1 },
            (_, index) => `tag-${index}`,
          ),
        },
      }),
    ).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "rag",
        verb: "project-evict",
        body: { root: "Y:/repo" },
      }),
    ).toBe(true);
    expect(
      isOpsDispatchIntent({
        target: "rag",
        verb: "reindex",
        body: { type: "vault", clean: true },
      }),
    ).toBe(true);
    expect(isOpsDispatchIntent({ target: "rag", verb: "server-start" })).toBe(true);
    expect(
      isOpsDispatchIntent({ target: "rag", verb: "project-evict", mode: "write" }),
    ).toBe(false);
  });

  it("validates the autofix dispatch mode (feature-scoped)", () => {
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "autofix",
        mode: "autofix",
        body: { scope: "wt", feature: "dashboard" },
      }),
    ).toBe(true);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "autofix",
        mode: "autofix",
        body: {},
      }),
    ).toBe(false);
    expect(
      isOpsDispatchIntent({
        target: "core",
        verb: "feature-archive",
        mode: "autofix",
        body: { feature: "dashboard" },
      }),
    ).toBe(false);
  });

  it("rejects malformed core write/create bodies before transport", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() =>
      dispatchOps({ target: "core", verb: "set-body", mode: "write" }),
    ).toThrow("operation is not dispatch-whitelisted: core:set-body");
    expect(() =>
      dispatchOps({
        target: "core",
        verb: "rename",
        mode: "write",
        body: { ref: "old-plan", to: "" },
      }),
    ).toThrow("operation is not dispatch-whitelisted: core:rename");
    expect(() =>
      dispatchOps({
        target: "core",
        verb: "create",
        mode: "create",
        body: { doc_type: "plan" },
      }),
    ).toThrow("operation is not dispatch-whitelisted: core:create");
    expect(() =>
      dispatchOps({
        target: "core",
        verb: "rename",
        mode: "write",
        body: {
          ref: "old-plan",
          to: "x".repeat(OPS_BODY_STRING_MAX_CHARS + 1),
        },
      }),
    ).toThrow("operation is not dispatch-whitelisted: core:rename");
    expect(() =>
      dispatchOps({
        target: "core",
        verb: "set-body",
        mode: "write",
        body: {
          ref: "plan",
          body: "x".repeat(OPS_BODY_CONTENT_MAX_CHARS + 1),
        },
      }),
    ).toThrow("operation is not dispatch-whitelisted: core:set-body");
    expect(() =>
      dispatchOps({
        target: "core",
        verb: "create",
        mode: "create",
        body: {
          doc_type: "plan",
          feature: "x".repeat(OPS_BODY_STRING_MAX_CHARS + 1),
        },
      }),
    ).toThrow("operation is not dispatch-whitelisted: core:create");

    expect(calls).toEqual([]);
  });

  it("rejects malformed rag control bodies before transport", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() =>
      dispatchOps({
        target: "rag",
        verb: "reindex",
        body: { type: "all", clean: "true" },
      }),
    ).toThrow("operation is not dispatch-whitelisted: rag:reindex");
    expect(() =>
      dispatchOps({
        target: "rag",
        verb: "watcher-reconfigure",
        body: { debounce_ms: "250" },
      }),
    ).toThrow("operation is not dispatch-whitelisted: rag:watcher-reconfigure");
    expect(() =>
      dispatchOps({ target: "rag", verb: "project-evict", body: { root: "" } }),
    ).toThrow("operation is not dispatch-whitelisted: rag:project-evict");
    expect(() =>
      dispatchOps({
        target: "rag",
        verb: "project-evict",
        body: { root: "x".repeat(OPS_BODY_STRING_MAX_CHARS + 1) },
      }),
    ).toThrow("operation is not dispatch-whitelisted: rag:project-evict");
    expect(() =>
      dispatchOps({ target: "rag", verb: "server-start", body: { extra: true } }),
    ).toThrow("operation is not dispatch-whitelisted: rag:server-start");

    expect(calls).toEqual([]);
  });

  it("rejects non-dispatch-whitelisted control verbs before transport", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() => dispatchOps({ target: "core", verb: "set-body" })).toThrow(
      "operation is not dispatch-whitelisted: core:set-body",
    );

    expect(calls).toEqual([]);
  });

  it("rejects non-canonical direct dispatch payloads before the dispatcher", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() => dispatchOps({ target: " core ", verb: " vault-check " })).toThrow(
      "operation is not dispatch-whitelisted:  core : vault-check ",
    );
    expect(isOpsDispatchIntent({ target: " core ", verb: " vault-check " })).toBe(
      false,
    );

    expect(calls).toEqual([]);
  });

  it("rejects malformed dispatcher payloads before transport", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() =>
      appDispatcher.dispatch({
        type: OPS_ACTION,
        payload: { target: "core", verb: 42 },
      }),
    ).toThrow("operation is not dispatch-whitelisted: core:42");
    expect(() =>
      appDispatcher.dispatch({
        type: OPS_ACTION,
        payload: { target: "core", verb: "x".repeat(OPS_VERB_MAX_CHARS + 1) },
      }),
    ).toThrow(
      `operation is not dispatch-whitelisted: core:${"x".repeat(
        OPS_VERB_MAX_CHARS + 1,
      )}`,
    );

    expect(calls).toEqual([]);
  });

  it("rejects non-dispatch-whitelisted core write/create verbs before transport", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/ops/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() =>
      dispatchOps({ target: "core", verb: "delete-everything", mode: "write" }),
    ).toThrow("operation is not dispatch-whitelisted: core:delete-everything");
    expect(() => dispatchOps({ target: "core", verb: "rename" })).toThrow(
      "operation is not dispatch-whitelisted: core:rename",
    );
    expect(() =>
      dispatchOps({ target: "core", verb: "set-body", mode: "create" }),
    ).toThrow("operation is not dispatch-whitelisted: core:set-body");

    expect(calls).toEqual([]);
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

    await dispatchOps({ target: "rag", verb: "reindex", body: {} }).catch(
      () => undefined,
    );

    expect(calls[0]).toContain("/ops/rag/reindex");
  });
});
