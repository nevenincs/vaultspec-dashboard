// The identity projection's unit guard (advanced-service-console ADR D4). The
// console header states WHO the attached tool is, so the rule this pins is that a
// fact is either SERVED or ABSENT: the projection never substitutes one field for
// another, never invents a default, and never lets a tool-side shape change throw.
//
// It also pins the bound: a free-form served string is length-capped, so a
// misbehaving sibling cannot push an unbounded blob into the header.

import { describe, expect, it } from "vitest";

import type { TierComponent } from "./engine";
import {
  RAG_IDENTITY_TEXT_MAX_CHARS,
  deriveRagServiceIdentity,
} from "./ragServiceIdentity";

const COMPONENT: TierComponent = {
  name: "vaultspec-rag",
  floor: "0.2.20",
  version: null,
};

describe("deriveRagServiceIdentity", () => {
  it("reports empty when nothing at all was served", () => {
    const view = deriveRagServiceIdentity(undefined, undefined, undefined);
    expect(view.empty).toBe(true);
    expect(view.requiredVersion).toBeNull();
    expect(view.storageEndpoint).toBeNull();
    expect(view.documents).toBeNull();
  });

  it("carries no served package identifier — the console titles itself", () => {
    // The handshake's component name is a BACKEND identifier the labels law keeps
    // off screen, so the projection deliberately does not carry it at all.
    const view = deriveRagServiceIdentity(COMPONENT, undefined, undefined);
    expect(Object.keys(view)).not.toContain("name");
    expect(JSON.stringify(view)).not.toContain("vaultspec-rag");
  });

  it("reduces a served version literal to its version token, never the package name", () => {
    // Provisioning serves "vaultspec-rag v0.4.1" — the internal package
    // identifier must never reach a screen through a served literal
    // (observed live, 2026-08-02). A version fact is the version alone; an
    // unparseable literal is an absent fact, not a leaked one.
    const view = deriveRagServiceIdentity(undefined, undefined, "vaultspec-rag v0.4.1");
    expect(view.installedVersion).toBe("0.4.1");
    expect(JSON.stringify(view)).not.toContain("vaultspec-rag");
    expect(
      deriveRagServiceIdentity(undefined, undefined, "not a version").installedVersion,
    ).toBeNull();
  });

  it("maps every served field from the handshake, the ops-state blocks, and provisioning", () => {
    const view = deriveRagServiceIdentity(
      { ...COMPONENT, version: "0.2.25" },
      {
        index: {
          storage_path: "~/.vaultspec-rag/qdrant-server",
          vault_count: 1284,
          code_count: 21903,
        },
        qdrant: {
          mode: "server",
          url: "127.0.0.1:6333",
          pid: 48213,
          version: "1.18.2",
        },
      },
      "0.2.25",
      { port: 8766, pid: 82300 },
    );
    expect(view).toEqual({
      port: 8766,
      processId: 82300,
      version: "0.2.25",
      installedVersion: "0.2.25",
      requiredVersion: "0.2.20",
      storageMode: "server",
      storageEndpoint: "127.0.0.1:6333",
      storageProcessId: 48213,
      storageVersion: "1.18.2",
      storagePath: "~/.vaultspec-rag/qdrant-server",
      documents: 1284,
      code: 21903,
      empty: false,
    });
  });

  it("is not empty once a single fact is served", () => {
    const view = deriveRagServiceIdentity(undefined, undefined, "0.2.25");
    expect(view.empty).toBe(false);
    expect(view.installedVersion).toBe("0.2.25");
    expect(view.storagePath).toBeNull();
  });

  it("drops a renamed or wrongly-typed field rather than throwing", () => {
    const view = deriveRagServiceIdentity(
      COMPONENT,
      {
        // The tool renamed `storage_path` and now reports counts as strings.
        index: { storagePath: "/elsewhere", vault_count: "1284" },
        qdrant: { mode: 42, url: "", pid: "48213" },
      },
      null,
    );
    expect(view.storagePath).toBeNull();
    expect(view.documents).toBeNull();
    expect(view.storageMode).toBeNull();
    expect(view.storageEndpoint).toBeNull();
    expect(view.storageProcessId).toBeNull();
    // The handshake still carried a floor, so the view is not empty.
    expect(view.requiredVersion).toBe("0.2.20");
    expect(view.empty).toBe(false);
  });

  it("treats a non-object ops-state block as absent", () => {
    const view = deriveRagServiceIdentity(
      undefined,
      { index: null, qdrant: null },
      undefined,
    );
    expect(view.empty).toBe(true);
  });

  it("trims a served string and drops a blank one", () => {
    const view = deriveRagServiceIdentity(
      { name: "vaultspec-rag", floor: "   ", version: "  0.2.25  " },
      undefined,
      undefined,
    );
    expect(view.version).toBe("0.2.25");
    expect(view.requiredVersion).toBeNull();
  });

  it("drops a served string that breaches the length bound", () => {
    // An overlong served literal is dropped BEFORE version-token extraction —
    // the length bound guards the parse itself, so a pathological string never
    // reaches the regex. A bounded version-bearing literal still yields its
    // token.
    const overlong = `0.2.25-${"x".repeat(RAG_IDENTITY_TEXT_MAX_CHARS)}`;
    const view = deriveRagServiceIdentity(
      { name: "vaultspec-rag", floor: "0.2.20", version: overlong },
      undefined,
      undefined,
    );
    expect(view.version).toBeNull();
    expect(view.requiredVersion).toBe("0.2.20");
  });

  it("keeps a served zero count as a fact, not as an absence", () => {
    const view = deriveRagServiceIdentity(
      undefined,
      { index: { vault_count: 0, code_count: 0 } },
      undefined,
    );
    expect(view.documents).toBe(0);
    expect(view.code).toBe(0);
    expect(view.empty).toBe(false);
  });

  it("drops a non-finite count rather than rendering NaN", () => {
    const view = deriveRagServiceIdentity(
      undefined,
      { index: { vault_count: Number.NaN, code_count: Number.POSITIVE_INFINITY } },
      undefined,
    );
    expect(view.documents).toBeNull();
    expect(view.code).toBeNull();
    expect(view.empty).toBe(true);
  });
});
