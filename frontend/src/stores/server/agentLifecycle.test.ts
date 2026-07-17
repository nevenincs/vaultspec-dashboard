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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleAuthoringStreamChunk,
  resetAuthoringStreamCursor,
  type AuthoringLifecycleEvent,
} from "./authoring";
import type { StreamChunk } from "./queries";
import { queryClient } from "./queryClient";
import {
  agentKeys,
  isAgentLifecycleEvent,
  isTerminalRunLifecycleEvent,
  routeAgentLifecycleEvent,
} from "./agent";

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

  it("claims the specific turn.queued kind WITHOUT widening the whole turn aggregate (S37)", () => {
    // turn.queued changes served queued_turn_ids, so the agent slice reacts to it.
    expect(
      isAgentLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "turn", event_kind: "turn.queued" }),
      ),
    ).toBe(true);
    // But an unrelated turn-aggregate event is NOT claimed — the widening is scoped
    // to the one kind, so other consumers never receive turn events they never handled.
    expect(
      isAgentLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "turn", event_kind: "turn.created" }),
      ),
    ).toBe(false);
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

describe("isTerminalRunLifecycleEvent", () => {
  it("claims the settled run terminals (completed, cancelled, failed)", () => {
    for (const event_kind of ["run.completed", "run.cancelled", "run.failed"]) {
      expect(
        isTerminalRunLifecycleEvent(
          lifecycleEvent({ aggregate_kind: "run", event_kind }),
        ),
      ).toBe(true);
    }
  });

  it("does not claim an in-flight run.started", () => {
    expect(
      isTerminalRunLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "run", event_kind: "run.started" }),
      ),
    ).toBe(false);
  });

  it("does not claim a session event that merely names a run-like kind", () => {
    expect(
      isTerminalRunLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "session", event_kind: "run.completed" }),
      ),
    ).toBe(false);
  });

  it("claims a terminal session.cancelled so its settled snapshot lands inactive (S37)", () => {
    expect(
      isTerminalRunLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "session", event_kind: "session.cancelled" }),
      ),
    ).toBe(true);
    // A non-terminal session event stays in-flight (active-only invalidation).
    expect(
      isTerminalRunLifecycleEvent(
        lifecycleEvent({ aggregate_kind: "session", event_kind: "session.created" }),
      ),
    ).toBe(false);
  });
});

describe("turn.queued routing (S37)", () => {
  it("invalidates the agent session caches so served queued_turn_ids refresh", () => {
    seedAgentSessionCache();
    routeAgentLifecycleEvent(
      lifecycleEvent({ aggregate_kind: "turn", event_kind: "turn.queued" }),
    );
    expect(agentSessionsInvalidated()).toBe(true);
  });
});

describe("terminal-aware invalidation: run.completed lands the settled snapshot", () => {
  // Seed an INACTIVE (no-observer) session-detail query carrying a counting
  // fetcher, so a later invalidation's refetchType is observable through the
  // fetch count — a backgrounded, cached open session. Real react-query, no mock.
  async function seedInactiveSessionDetail(
    sessionId: string,
    counter: { n: number },
  ): Promise<void> {
    await queryClient.prefetchQuery({
      queryKey: agentKeys.session(sessionId),
      queryFn: () => {
        counter.n += 1;
        return { seeded: true, sessionId };
      },
    });
  }

  it("refetches an inactive session detail on a terminal run.completed", async () => {
    const counter = { n: 0 };
    await seedInactiveSessionDetail("session:backgrounded", counter);
    expect(counter.n).toBe(1);

    routeAgentLifecycleEvent(
      lifecycleEvent({
        aggregate_kind: "run",
        aggregate_id: "run:done",
        event_kind: "run.completed",
      }),
    );

    // A terminal event forces a refetch even of the inactive query so the settled
    // snapshot (which the transcript renders as Done) lands durably.
    await vi.waitFor(() => expect(counter.n).toBe(2));
  });

  it("leaves an inactive session detail unfetched on an in-flight run.started", async () => {
    const counter = { n: 0 };
    await seedInactiveSessionDetail("session:backgrounded-2", counter);
    expect(counter.n).toBe(1);

    routeAgentLifecycleEvent(
      lifecycleEvent({
        aggregate_kind: "run",
        aggregate_id: "run:live",
        event_kind: "run.started",
      }),
    );

    // The in-flight event only refreshes active (on-screen) caches, so a
    // backgrounded session is marked stale but not refetched — no churn.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(counter.n).toBe(1);
    expect(
      queryClient.getQueryState(agentKeys.session("session:backgrounded-2"))
        ?.isInvalidated,
    ).toBe(true);
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
