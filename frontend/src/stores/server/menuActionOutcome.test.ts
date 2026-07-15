import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { COPY_ACTION } from "../../platform/actions/clipboardActions";
import { adaptDirectWriteOutcome } from "./authoring";
import { consumeMenuActionOutcome } from "./menuActionOutcome";
import { OPS_ACTION } from "./opsActions";
import { engineKeys } from "./queries/internal";
import { RELATE_ACTION, type RelateAlreadyLinked } from "./relateActions";

const tiers = {};

const archiveDispatch = {
  type: OPS_ACTION,
  payload: {
    target: "core",
    verb: "feature-archive",
    mode: "archive",
    body: { feature: "search" },
  },
} as const;

const repairDispatch = {
  type: OPS_ACTION,
  payload: {
    target: "core",
    verb: "autofix",
    mode: "autofix",
    body: { feature: "search" },
  },
} as const;

const copyDispatch = {
  type: COPY_ACTION,
  payload: { text: "Document" },
} as const;

const localizedCopyDispatch = {
  type: COPY_ACTION,
  payload: { message: { key: "documents:documentTypes.adr" } },
} as const;

const relateDispatch = {
  type: RELATE_ACTION,
  payload: { src: "source", dst: "target", scope: "scope-a" },
} as const;

function queryClientWithStatus(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(engineKeys.status(), { ok: true });
  return client;
}

function statusInvalidated(client: QueryClient): boolean {
  return client.getQueryState(engineKeys.status())?.isInvalidated === true;
}

describe("consumeMenuActionOutcome", () => {
  it("classifies archive and repair success, refusal, and transport failure without leaking details", async () => {
    const archiveClient = queryClientWithStatus();
    await expect(
      consumeMenuActionOutcome(
        archiveDispatch,
        Promise.resolve({
          ok: true,
          envelope: { status: "ok", data: {} },
          tiers,
        }),
        "scope-a",
        archiveClient,
      ),
    ).resolves.toEqual({ ok: true, feedback: "archive-succeeded" });
    expect(statusInvalidated(archiveClient)).toBe(true);

    const repairClient = queryClientWithStatus();
    await expect(
      consumeMenuActionOutcome(
        repairDispatch,
        Promise.resolve({
          ok: true,
          envelope: {
            status: "failed",
            data: { errors: ["private/path"], reason: "internal detail" },
          },
          tiers,
        }),
        "scope-a",
        repairClient,
      ),
    ).resolves.toEqual({ ok: false, feedback: "repair-rejected" });
    expect(statusInvalidated(repairClient)).toBe(false);

    await expect(
      consumeMenuActionOutcome(
        archiveDispatch,
        Promise.reject(new Error("private transport detail")),
        "scope-a",
        queryClientWithStatus(),
      ),
    ).resolves.toEqual({ ok: false, feedback: "archive-unavailable" });
  });

  it("invalidates OPS caches only for a verified successful outcome", async () => {
    for (const malformed of [
      undefined,
      { ok: true, envelope: { status: "ok", data: {} } },
      { ok: true, envelope: { status: "unexpected", data: {} }, tiers },
      { ok: false, envelope: { status: "ok", data: {} }, tiers },
    ]) {
      const client = queryClientWithStatus();
      await expect(
        consumeMenuActionOutcome(archiveDispatch, malformed, "scope-a", client),
      ).resolves.toEqual({ ok: false, feedback: "action-unavailable" });
      expect(statusInvalidated(client)).toBe(false);
    }
  });

  it("classifies copy outcomes and fails malformed copy results closed", async () => {
    await expect(
      consumeMenuActionOutcome(copyDispatch, Promise.resolve({ ok: true }), null),
    ).resolves.toEqual({ ok: true, feedback: "copy-succeeded" });
    await expect(
      consumeMenuActionOutcome(copyDispatch, Promise.resolve({ ok: false }), null),
    ).resolves.toEqual({ ok: false, feedback: "copy-failed" });
    await expect(
      consumeMenuActionOutcome(
        copyDispatch,
        Promise.resolve({ ok: true, path: "x" }),
        null,
      ),
    ).resolves.toEqual({ ok: false, feedback: "action-unavailable" });
    await expect(
      consumeMenuActionOutcome(copyDispatch, Promise.reject(new Error("denied")), null),
    ).resolves.toEqual({ ok: false, feedback: "copy-failed" });
    await expect(
      consumeMenuActionOutcome(
        localizedCopyDispatch,
        Promise.resolve({ ok: true }),
        null,
      ),
    ).resolves.toEqual({ ok: true, feedback: "copy-succeeded" });
  });

  it("rejects mixed and extended copy payloads before classifying outcomes", async () => {
    for (const payload of [
      {
        text: "Decisions",
        message: { key: "documents:documentTypes.adr" },
      },
      { text: "Decisions", unexpected: true },
      { message: { key: "documents:documentTypes.adr" }, unexpected: true },
    ]) {
      await expect(
        consumeMenuActionOutcome(
          { type: COPY_ACTION, payload },
          Promise.resolve({ ok: true }),
          null,
        ),
      ).resolves.toEqual({ ok: false, feedback: "action-unavailable" });
    }
  });

  it("classifies every production relate outcome without duplicating invalidation", async () => {
    const outcomes = [
      [
        adaptDirectWriteOutcome({
          status: "applied",
          changeset_id: "change-1",
          record: {},
          apply_receipt: { child: {} },
          tiers,
        }),
        { ok: true, feedback: "link-succeeded" },
      ],
      [
        { kind: "already_related" } satisfies RelateAlreadyLinked,
        { ok: true, feedback: "already-linked" },
      ],
      [
        adaptDirectWriteOutcome({ status: "conflict", conflict: {}, tiers }),
        { ok: false, feedback: "link-conflict" },
      ],
      [
        adaptDirectWriteOutcome({ status: "denied", eligibility: {}, tiers }),
        { ok: false, feedback: "link-failed" },
      ],
      [
        adaptDirectWriteOutcome({ status: "failed", apply_receipt: {}, tiers }),
        { ok: false, feedback: "link-failed" },
      ],
      [
        adaptDirectWriteOutcome({ status: "in_flight", tiers }),
        { ok: false, feedback: "link-in-progress" },
      ],
    ] as const;

    for (const [outcome, expected] of outcomes) {
      await expect(
        consumeMenuActionOutcome(relateDispatch, Promise.resolve(outcome), "scope-a"),
      ).resolves.toEqual(expected);
    }
  });

  it("keeps unknown dispatches silent and recognized malformed input generic", async () => {
    await expect(
      consumeMenuActionOutcome(
        { type: "some:store-intent" },
        Promise.resolve({ reason: "do not expose" }),
        null,
      ),
    ).resolves.toEqual({ ok: true, feedback: null });

    for (const dispatch of [
      { type: COPY_ACTION, payload: { text: 42 } },
      { type: RELATE_ACTION, payload: { src: "source" } },
      { type: OPS_ACTION, payload: { target: "core", verb: "feature-archive" } },
    ]) {
      await expect(
        consumeMenuActionOutcome(dispatch, Promise.resolve(undefined), null),
      ).resolves.toEqual({ ok: false, feedback: "action-unavailable" });
    }
  });
});
