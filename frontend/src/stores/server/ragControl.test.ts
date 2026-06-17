// @vitest-environment happy-dom
//
// The rag control plane (rag-control-plane ADR D6): the stores-layer sole wire
// client for the brokered `/ops/rag/*` management surface.
//
// The pure job-progress interpreters (isJobTerminal / isJobFailed /
// interpretJobProgress / firstJob) — including the tiers-gated semantic-offline
// reading (never guessed from a transport error) — are covered by pure-function
// tests over explicit vectors. The live hooks run against the REAL engine broker;
// the broker's contract is that a read NEVER throws (degradation-is-read-from-
// tiers): it resolves to `{envelope, tiers}`, with the envelope present when rag
// is up and null + a semantic-unavailable tiers block when rag is down. That
// contract is asserted live and holds whether or not the rag service is running —
// no failure injection. `unwrapEnvelope` is pinned against a verbatim captured
// live envelope (a pure adapter vector).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { liveScope, liveTransport } from "../../testing/liveClient";
import { engineClient, readTierAvailability } from "./engine";
import { unwrapEnvelope } from "./liveAdapters";
import { queryClient } from "./queryClient";
import {
  firstJob,
  interpretJobProgress,
  isJobFailed,
  isJobTerminal,
  useRagProjects,
  useRagServiceState,
  useRagWatcher,
  type BrokeredResult,
  type RagJobsSnapshot,
} from "./ragControl";

// --- pure interpreters (no render) ------------------------------------------------

describe("rag job interpreters", () => {
  it("classifies live vs terminal vs failed phases", () => {
    expect(isJobTerminal("running")).toBe(false);
    expect(isJobTerminal("queued")).toBe(false);
    expect(isJobTerminal("done")).toBe(true);
    expect(isJobTerminal("error")).toBe(true);
    expect(isJobTerminal(undefined)).toBe(false);
    expect(isJobFailed("error")).toBe(true);
    expect(isJobFailed("done")).toBe(false);
  });

  it("interprets job progress with a determinate fraction", () => {
    const data: BrokeredResult<RagJobsSnapshot> = {
      envelope: {
        jobs: [
          {
            id: "j1",
            phase: "running",
            progress: { step: "embedding", completed: 4, total: 10 },
          },
        ],
      },
      tiers: { semantic: { available: true } },
    };
    const view = interpretJobProgress(data, "j1");
    expect(view.phase).toBe("running");
    expect(view.fraction).toBeCloseTo(0.4);
    expect(view.step).toBe("embedding");
    expect(view.terminal).toBe(false);
    expect(view.polling).toBe(true);
    expect(view.semanticOffline).toBe(false);
  });

  it("reads semantic-offline from the tiers block, not a transport error", () => {
    const data: BrokeredResult<RagJobsSnapshot> = {
      envelope: null,
      tiers: { semantic: { available: false, reason: "rag service down" } },
    };
    const view = interpretJobProgress(data, "j1");
    expect(view.semanticOffline).toBe(true);
    // A down rag stops the poll — never a busy loop against a dead service.
    expect(view.polling).toBe(false);
  });

  it("firstJob is the newest-first head, undefined when empty", () => {
    expect(firstJob({ jobs: [] })).toBeUndefined();
    expect(firstJob(undefined)).toBeUndefined();
    expect(firstJob({ jobs: [{ id: "a", phase: "done" }] })?.id).toBe("a");
  });
});

// --- live broker reads (real engine) ----------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

/** The broker contract: a resolved read is well-formed and EITHER carries rag's
 *  envelope (rag up) OR reports semantic unavailable in tiers (rag down) — never
 *  a thrown error. Holds whether or not the rag service is running. */
function expectBrokerContract(data: BrokeredResult<unknown> | undefined): void {
  expect(data).toBeDefined();
  const semanticUp = !readTierAvailability(data?.tiers, ["semantic"]).degraded;
  if (semanticUp) {
    expect(data?.envelope).not.toBeNull();
  } else {
    // Down rag: degraded, held to a null envelope rather than a throw.
    expect(data?.envelope ?? null).toBeNull();
  }
}

describe("rag control plane (real engine broker)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
    engineClient.useTransport(liveTransport);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("reads service-state, watcher, and projects through the broker without throwing", async () => {
    const { result } = renderHook(
      () => ({
        svc: useRagServiceState(scope),
        watcher: useRagWatcher(scope),
        projects: useRagProjects(scope),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.svc.data).toBeDefined(), {
      timeout: 6000,
    });
    await waitFor(() => expect(result.current.watcher.data).toBeDefined(), {
      timeout: 6000,
    });
    await waitFor(() => expect(result.current.projects.data).toBeDefined(), {
      timeout: 6000,
    });
    // Each read honors the broker degradation contract; none throws.
    expect(result.current.svc.isError).toBe(false);
    expect(result.current.watcher.isError).toBe(false);
    expect(result.current.projects.isError).toBe(false);
    expectBrokerContract(result.current.svc.data);
    expectBrokerContract(result.current.watcher.data);
    expectBrokerContract(result.current.projects.data);
  });
});

// --- wire fidelity: unwrapEnvelope over a verbatim captured live envelope ---------

describe("unwrapEnvelope flattens the live brokered wire shape", () => {
  it("a captured live `{data:{envelope},tiers}` flattens to `{envelope, tiers}`", () => {
    // Verbatim capture of a LIVE `GET /ops/rag/service-state` envelope: rag's
    // value nested under `data.envelope` with the tiers block. The SAME
    // unwrapEnvelope the app transport runs must flatten it.
    const liveSample = {
      data: { envelope: { index: { cuda: true } } },
      tiers: {
        declared: { available: true },
        semantic: { available: true },
        structural: { available: true },
        temporal: { available: true },
      },
    };
    const unwrapped = unwrapEnvelope(liveSample) as BrokeredResult<{
      index: { cuda: boolean };
    }>;
    expect(unwrapped.envelope?.index.cuda).toBe(true);
    expect(unwrapped.tiers.semantic?.available).toBe(true);
  });

  it("a captured live reindex `{job_id,status}` envelope unwraps to the queued shape", () => {
    const liveReindex = {
      data: { envelope: { ok: true, job_id: "f4e0a4a9376147ce", status: "queued" } },
      tiers: { semantic: { available: true } },
    };
    const unwrapped = unwrapEnvelope(liveReindex) as BrokeredResult<{
      job_id: string;
      status: string;
    }>;
    expect(unwrapped.envelope?.job_id).toBe("f4e0a4a9376147ce");
    expect(unwrapped.envelope?.status).toBe("queued");
  });
});
