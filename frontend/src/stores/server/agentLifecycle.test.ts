// Agent lifecycle-routing tests.
//
// The session/run lifecycle events ride the ONE authoring SSE feed the review
// store pumps. Before this wiring, `session.created`/`run.started` reached the
// stream handler and invalidated only the authoring proposal cache — nothing
// refreshed the agent plane, so a new session/run was silent data loss. These
// tests prove the shared-feed fan-out now routes those events into the agent
// session caches, and leaves non-agent events (proposals, comments) alone.
//
// Pure logic over the real seam with no mocked engine wire.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  handleAuthoringStreamChunk,
  resetAuthoringStreamCursor,
  type AuthoringLifecycleEvent,
} from "./authoring";
import type { StreamChunk } from "./queries";
import { queryClient } from "./queryClient";
import { agentKeys, isAgentLifecycleEvent, routeAgentLifecycleEvent } from "./agent";

function lifecycleEvent(
  overrides: Partial<AuthoringLifecycleEvent> = {},
): AuthoringLifecycleEvent {
  return {
    seq: 1,
    event_id: "event:test",
    aggregate_kind: "session",
    aggregate_id: "session:test",
    event_kind: "session.created",
    schema_version: 1,
    actor: { id: "human:local-operator", kind: "human" },
    payload: {},
    payload_hash: "",
    created_at_ms: 1,
    ...overrides,
  };
}

function seedAgentSessionCache(): void {
  queryClient.setQueryData(agentKeys.sessions(), { seeded: true });
}

function agentSessionsInvalidated(): boolean {
  return queryClient.getQueryState(agentKeys.sessions())?.isInvalidated ?? false;
}

beforeEach(() => {
  resetAuthoringStreamCursor();
  queryClient.clear();
});

afterEach(() => {
  resetAuthoringStreamCursor();
  queryClient.clear();
});

describe("isAgentLifecycleEvent", () => {
  it("claims session and run aggregates for the agent plane", () => {
    expect(isAgentLifecycleEvent(lifecycleEvent({ aggregate_kind: "session" }))).toBe(
      true,
    );
    expect(
      isAgentLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "run", event_kind: "run.started" }),
      ),
    ).toBe(true);
  });

  it("ignores proposal, changeset, and comment aggregates (the review store's own)", () => {
    for (const aggregate_kind of ["proposal", "changeset", "approval", "comment"]) {
      expect(isAgentLifecycleEvent(lifecycleEvent({ aggregate_kind }))).toBe(false);
    }
  });
});

describe("routeAgentLifecycleEvent", () => {
  it("invalidates the agent session caches for a session/run event", () => {
    seedAgentSessionCache();
    routeAgentLifecycleEvent(lifecycleEvent({ aggregate_kind: "run" }));
    expect(agentSessionsInvalidated()).toBe(true);
  });

  it("does not touch the agent caches for a non-agent event", () => {
    seedAgentSessionCache();
    routeAgentLifecycleEvent(lifecycleEvent({ aggregate_kind: "proposal" }));
    expect(agentSessionsInvalidated()).toBe(false);
  });
});

describe("shared-feed fan-out: the dropped session/run events reach the agent slice", () => {
  it("routes a session.created stream frame into the agent session caches", async () => {
    seedAgentSessionCache();
    const chunk: StreamChunk = {
      channel: "lifecycle",
      data: lifecycleEvent({
        seq: 42,
        aggregate_kind: "session",
        event_kind: "session.created",
      }),
    };

    await handleAuthoringStreamChunk(chunk);

    // The importing of `./agent` registered the listener on the shared feed, so
    // the pump fanned the session event out to it (not dropped).
    expect(agentSessionsInvalidated()).toBe(true);
  });

  it("routes a run.started stream frame into the agent session caches", async () => {
    seedAgentSessionCache();
    const chunk: StreamChunk = {
      channel: "lifecycle",
      data: lifecycleEvent({
        seq: 43,
        aggregate_kind: "run",
        aggregate_id: "run:test",
        event_kind: "run.started",
      }),
    };

    await handleAuthoringStreamChunk(chunk);

    expect(agentSessionsInvalidated()).toBe(true);
  });

  it("leaves the agent caches untouched for a proposal stream frame", async () => {
    seedAgentSessionCache();
    const chunk: StreamChunk = {
      channel: "lifecycle",
      data: lifecycleEvent({
        seq: 44,
        aggregate_kind: "proposal",
        aggregate_id: "changeset:test",
        event_kind: "proposal.created",
      }),
    };

    await handleAuthoringStreamChunk(chunk);

    expect(agentSessionsInvalidated()).toBe(false);
  });
});
