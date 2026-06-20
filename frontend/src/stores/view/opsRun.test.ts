import { describe, expect, it } from "vitest";

import { normalizeOpsRunVariables, opsRunReceiptVerb } from "./opsRun";

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
    expect(opsRunReceiptVerb({ target: "core", verb: " set-body " })).toBe(
      "operation",
    );
    expect(opsRunReceiptVerb({ target: "git", verb: "status" })).toBe("operation");
    expect(opsRunReceiptVerb({ target: "rag", verb: { raw: "reindex" } })).toBe(
      "operation",
    );
    expect(opsRunReceiptVerb(null)).toBe("operation");
  });
});
