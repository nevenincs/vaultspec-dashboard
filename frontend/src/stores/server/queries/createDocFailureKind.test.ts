import { describe, expect, it } from "vitest";

import type { DirectWriteOutcome } from "../authoring";
import { createDocFailureKind } from "./mutations";

const tiers = {};

function denied(
  denialKind: Extract<DirectWriteOutcome, { kind: "denied" }>["denialKind"],
): DirectWriteOutcome {
  return {
    kind: "denied",
    reason: "hostile diagnostic /private/path actor_id receipt_123",
    denialKind,
    tiers,
  };
}

describe("create document failure classification", () => {
  it("maps structured recovery categories without reading refusal prose", () => {
    expect(createDocFailureKind(denied("path_collision"))).toBe("path-collision");
    expect(createDocFailureKind(denied("scope_mismatch"))).toBe("scope-changed");
    expect(createDocFailureKind(denied("stale_base"))).toBe("project-changed");
    expect(createDocFailureKind(denied("forbidden_actor"))).toBe("create-failed");
    expect(createDocFailureKind(denied("self_approval"))).toBe("create-failed");
    expect(createDocFailureKind(denied("other"))).toBe("create-failed");
  });

  it("classifies conflict, in-flight, failed, and applied outcomes", () => {
    expect(
      createDocFailureKind({
        kind: "conflict",
        conflict: {
          document_ref: "doc:x",
          document_path: "/private/path",
          expected_blob_hash: "expected",
          actual_blob_hash: "actual",
          target_blob_hash: "target",
        },
        tiers,
      }),
    ).toBe("project-changed");
    expect(createDocFailureKind({ kind: "in_flight", tiers })).toBe("in-flight");
    expect(
      createDocFailureKind({
        kind: "failed",
        reason: "hostile diagnostic /private/path",
        tiers,
      }),
    ).toBe("create-failed");
    expect(
      createDocFailureKind({
        kind: "applied",
        changesetId: "private-change-id",
        documentPath: "/private/path",
        blobHash: "private-hash",
        replayed: false,
        tiers,
      }),
    ).toBeNull();
  });
});
