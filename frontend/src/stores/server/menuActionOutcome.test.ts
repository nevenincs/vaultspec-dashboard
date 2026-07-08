import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { COPY_ACTION } from "../../platform/actions/clipboardActions";
import { consumeMenuActionOutcome } from "./menuActionOutcome";
import { OPS_ACTION } from "./opsActions";

// KAR-006 / KAR-004. The outcomes here MIRROR the live wire shape — the engine
// forwards the sibling `{status, data}` envelope under `envelope`, HTTP 200 for
// BOTH success and refusal — so this pins the three consequences the fix closes
// by driving the pure interpreter with faithful envelopes, never a divergent
// engine double (mock-mirrors-live-wire-shape: the wire itself is not stubbed).

function opsResult(envelope: unknown, ok = true) {
  return { ok, envelope, tiers: {} };
}

describe("consumeMenuActionOutcome (KAR-006 / KAR-004)", () => {
  it("(a) surfaces a business refusal instead of silent success, and does NOT invalidate", async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const outcome = Promise.resolve(
      opsResult({
        status: "failed",
        data: { errors: ["dangling target: doc:nope"] },
      }),
    );

    const result = await consumeMenuActionOutcome(OPS_ACTION, outcome, "scope-a", qc);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("dangling target: doc:nope");
    // A refusal is not a mutation: the cache must NOT be invalidated.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("(b) catches a transport failure into a degraded message (no unhandled rejection)", async () => {
    const qc = new QueryClient();
    const outcome = Promise.reject(new Error("socket hang up"));

    const result = await consumeMenuActionOutcome(OPS_ACTION, outcome, "scope-a", qc);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/engine/i);
  });

  it("(c) invalidates the vault-mutation caches on a successful op", async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const outcome = Promise.resolve(opsResult({ status: "ok", data: {} }));

    const result = await consumeMenuActionOutcome(OPS_ACTION, outcome, "scope-a", qc);

    expect(result.ok).toBe(true);
    expect(invalidate).toHaveBeenCalled();
  });

  it("surfaces copy success and failure (KAR-004 fold-in)", async () => {
    const qc = new QueryClient();
    const copied = await consumeMenuActionOutcome(
      COPY_ACTION,
      Promise.resolve({ ok: true }),
      null,
      qc,
    );
    expect(copied.message).toBe("Copied.");

    const failed = await consumeMenuActionOutcome(
      COPY_ACTION,
      Promise.resolve({ ok: false }),
      null,
      qc,
    );
    expect(failed.message).toBe("Couldn't copy.");
  });

  it("reports nothing (null message) for a dispatch type with no observable outcome", async () => {
    const qc = new QueryClient();
    const result = await consumeMenuActionOutcome(
      "some:store-intent",
      Promise.resolve(undefined),
      null,
      qc,
    );
    expect(result.message).toBeNull();
  });
});
