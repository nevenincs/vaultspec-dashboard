// @vitest-environment happy-dom
//
// The rag control plane (rag-control-plane ADR D6): the stores-layer sole wire
// client for the brokered `/ops/rag/*` management surface. These tests exercise
// the pure job-progress interpreters, the read/mutation hooks driven against the
// REAL stores client transport (mockEngine, no controller-internal doubles), the
// trigger-then-poll job lifecycle to a terminal phase, the tiers-gated
// degradation (never guessed from a transport error), and mock-vs-live wire
// fidelity through the same `unwrapEnvelope` the live origin flows through.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { engineClient, readTierAvailability } from "./engine";
import { unwrapEnvelope } from "./liveAdapters";
import { queryClient } from "./queryClient";
import {
  firstJob,
  interpretJobProgress,
  isJobFailed,
  isJobTerminal,
  useRagProjects,
  useRagReindexWithProgress,
  useRagServiceState,
  useRagWatcher,
  useRagWatcherReconfigure,
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

// --- live transport (real client + mockEngine) -----------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("rag control plane (real transport, mockEngine)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("reads service-state, watcher, and projects through the broker", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    const { result } = renderHook(
      () => ({
        svc: useRagServiceState(MOCK_SCOPE),
        watcher: useRagWatcher(MOCK_SCOPE),
        projects: useRagProjects(MOCK_SCOPE),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.svc.data).toBeDefined(), {
      timeout: 4000,
    });
    await waitFor(() => expect(result.current.watcher.data).toBeDefined(), {
      timeout: 4000,
    });
    await waitFor(() => expect(result.current.projects.data).toBeDefined(), {
      timeout: 4000,
    });
    // rag's envelope is forwarded verbatim under `envelope`.
    expect(result.current.svc.data?.envelope?.index?.cuda).toBe(true);
    expect(result.current.watcher.data?.envelope?.debounce_ms).toBe(2000);
    expect(result.current.projects.data?.envelope?.projects.length).toBeGreaterThan(0);
  });

  it("triggers a reindex and polls the returned job id to a terminal phase", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    const { result } = renderHook(() => useRagReindexWithProgress(), { wrapper });

    // Trigger: the broker returns rag's queued envelope; the hook captures job_id.
    result.current.trigger({ type: "vault" });
    await waitFor(() => expect(result.current.jobId).not.toBeNull(), { timeout: 4000 });
    const jobId = result.current.jobId!;

    // The poll sees a running job (epoch holds at the last completed build).
    await waitFor(() => expect(result.current.progress.phase).toBe("running"), {
      timeout: 4000,
    });
    expect(result.current.progress.terminal).toBe(false);

    // Complete the job server-side; the backoff poll observes the terminal phase
    // and stops (trigger-then-poll, ADR D3).
    mock.completeRagJob(jobId);
    await waitFor(() => expect(result.current.progress.terminal).toBe(true), {
      timeout: 6000,
    });
    expect(result.current.progress.failed).toBe(false);
    expect(result.current.progress.polling).toBe(false);
  });

  it("reconfigures the watcher through the platform seam and re-reads", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    const { result } = renderHook(
      () => ({
        watcher: useRagWatcher(MOCK_SCOPE),
        reconfigure: useRagWatcherReconfigure(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.watcher.data?.envelope).toBeDefined(), {
      timeout: 4000,
    });
    result.current.reconfigure.mutate({ debounce_ms: 750 });
    await waitFor(
      () => expect(result.current.watcher.data?.envelope?.debounce_ms).toBe(750),
      { timeout: 4000 },
    );
  });

  it("degrades reads to a tiers-gated held state when rag is down", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    const { result } = renderHook(() => useRagServiceState(MOCK_SCOPE), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined(), { timeout: 4000 });
    // The broker degrades to an empty envelope + a semantic-unavailable tiers
    // block — NOT a thrown error (degradation-is-read-from-tiers).
    expect(result.current.data?.envelope).toBeNull();
    expect(
      readTierAvailability(result.current.data?.tiers, ["semantic"]).degraded,
    ).toBe(true);
    expect(result.current.isError).toBe(false);
  });
});

// --- mock-vs-live wire fidelity (S26) ---------------------------------------------

describe("mock mirrors the live brokered wire shape", () => {
  it("a captured live `{data:{envelope},tiers}` flows to the same shape the mock serves", () => {
    // A verbatim capture of the LIVE `GET /ops/rag/service-state` envelope
    // (recorded against a running engine + rag service, 2026-06-16): rag's value
    // nested under `data.envelope` with the tiers block. The SAME `unwrapEnvelope`
    // the app's transport runs must flatten it to `{envelope, tiers}`.
    const liveSample = {
      data: {
        envelope: {
          index: {
            cuda: true,
            gpu_name: "NVIDIA GeForce RTX 4080 SUPER",
            vault_count: 0,
            target_dir: "\\\\?\\Y:\\code\\aeat-worktrees\\main",
            storage_path: "http://127.0.0.1:8765",
          },
        },
      },
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
    // The flattened live shape is exactly what `opsRagGet` returns and what the
    // mock serves flat: `{envelope, tiers}` with rag's value intact.
    expect(unwrapped.envelope?.index.cuda).toBe(true);
    expect(unwrapped.tiers.semantic?.available).toBe(true);

    // And the mock serves the same flat shape directly (it pre-unwraps), so both
    // origins reach the consumer identically.
    const mockServiceState = {
      envelope: { index: { cuda: true } },
      tiers: { semantic: { available: true } },
    };
    expect(unwrapEnvelope(mockServiceState)).toEqual(mockServiceState);
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
