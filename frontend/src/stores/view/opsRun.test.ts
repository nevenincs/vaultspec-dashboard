import { describe, expect, it } from "vitest";

import { EngineError } from "../server/engine";
import {
  classifyCommandPaletteOpsError,
  classifyCommandPaletteOpsResult,
  normalizeOpsRunVariables,
  opsRunReceiptVerb,
} from "./opsRun";

describe("ops run variable boundary", () => {
  it("normalizes whitelisted runtime ops variables before dispatch", () => {
    expect(normalizeOpsRunVariables({ target: " rag ", verb: " reindex " })).toEqual({
      target: "rag",
      verb: "reindex",
    });
    expect(
      normalizeOpsRunVariables({ target: " core ", verb: " vault-check " }),
    ).toEqual({
      target: "core",
      verb: "vault-check",
    });
  });

  it("rejects malformed or non-whitelisted runtime ops variables", () => {
    expect(normalizeOpsRunVariables(null)).toBeNull();
    expect(normalizeOpsRunVariables({ target: "rag", verb: "   " })).toBeNull();
    expect(
      normalizeOpsRunVariables({ target: { raw: "rag" }, verb: "reindex" }),
    ).toBeNull();
    expect(normalizeOpsRunVariables({ target: "core", verb: "set-body" })).toBeNull();
  });

  it("keeps receipt labels from exposing malformed runtime values", () => {
    expect(opsRunReceiptVerb({ target: "rag", verb: " reindex " })).toBe("reindex");
    expect(opsRunReceiptVerb({ target: "core", verb: " set-body " })).toBe("operation");
    expect(opsRunReceiptVerb({ target: "git", verb: "status" })).toBe("operation");
    expect(opsRunReceiptVerb({ target: "rag", verb: { raw: "reindex" } })).toBe(
      "operation",
    );
    expect(opsRunReceiptVerb(null)).toBe("operation");
  });
});

describe("command palette operation outcome classifier", () => {
  it("treats successful core and disable operations as succeeded", () => {
    expect(
      classifyCommandPaletteOpsResult("check-workspace", {
        ok: true,
        envelope: {},
        tiers: {},
      }),
    ).toBe("succeeded");
    expect(
      classifyCommandPaletteOpsResult("show-workspace-details", {
        ok: true,
        envelope: {},
        tiers: {},
      }),
    ).toBe("succeeded");
    expect(
      classifyCommandPaletteOpsResult("disable-search", {
        ok: true,
        envelope: {},
        tiers: { semantic: { available: false } },
      }),
    ).toBe("succeeded");
  });

  it("requires semantic availability for successful search operations", () => {
    expect(
      classifyCommandPaletteOpsResult("enable-search", {
        ok: true,
        envelope: {},
        tiers: { semantic: { available: true } },
      }),
    ).toBe("succeeded");
    expect(
      classifyCommandPaletteOpsResult("refresh-search", {
        ok: true,
        envelope: {},
        tiers: { semantic: { available: false } },
      }),
    ).toBe("unavailable");
    expect(
      classifyCommandPaletteOpsResult("apply-search-settings", {
        ok: true,
        envelope: {},
        tiers: {},
      }),
    ).toBe("unavailable");
  });

  it("keeps resolved non-ok outcomes failed even when search is unavailable", () => {
    expect(
      classifyCommandPaletteOpsResult("refresh-search", {
        ok: false,
        envelope: {},
        tiers: { semantic: { available: false } },
      }),
    ).toBe("failed");
  });

  it("uses explicit semantic degradation from EngineError without exposing it", () => {
    expect(
      classifyCommandPaletteOpsError(
        "enable-search",
        new EngineError("/ops/rag/server-start", 502, {
          tiers: { semantic: { available: false, reason: "service missing" } },
        }),
      ),
    ).toBe("unavailable");
    expect(
      classifyCommandPaletteOpsError(
        "enable-search",
        new EngineError("/ops/rag/server-start", 500, {
          tiers: {
            declared: { available: false },
            semantic: { available: true },
          },
        }),
      ),
    ).toBe("failed");
    expect(
      classifyCommandPaletteOpsError("enable-search", new Error("private detail")),
    ).toBe("failed");
    expect(
      classifyCommandPaletteOpsError(
        "disable-search",
        new EngineError("/ops/rag/server-stop", 502, {
          tiers: { semantic: { available: false } },
        }),
      ),
    ).toBe("failed");
  });
});
