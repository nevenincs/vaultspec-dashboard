import { describe, expect, it } from "vitest";

import {
  normalizeOptionalNullableScopeId,
  normalizeOptionalScopeId,
  normalizeScopeId,
  SCOPE_ID_MAX_CHARS,
} from "./scopeIdentity";

describe("platform scope identity", () => {
  it("normalizes runtime scope identities once at shared boundaries", () => {
    expect(normalizeScopeId(" scope-a ")).toBe("scope-a");
    expect(normalizeScopeId("   ")).toBeNull();
    expect(normalizeScopeId({ scope: "scope-a" })).toBeNull();
    expect(normalizeScopeId("x".repeat(SCOPE_ID_MAX_CHARS))).toBe(
      "x".repeat(SCOPE_ID_MAX_CHARS),
    );
    expect(normalizeScopeId("x".repeat(SCOPE_ID_MAX_CHARS + 1))).toBeNull();

    expect(normalizeOptionalScopeId(" scope-a ")).toBe("scope-a");
    expect(normalizeOptionalScopeId("   ")).toBeUndefined();
    expect(normalizeOptionalNullableScopeId(null)).toBeNull();
    expect(normalizeOptionalNullableScopeId(" scope-a ")).toBe("scope-a");
  });
});
