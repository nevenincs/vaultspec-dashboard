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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { liveScope, liveTransport } from "../../testing/liveClient";
import { engineClient } from "./engine";
import { unwrapEnvelope } from "./liveAdapters";
import { queryClient } from "./queryClient";
import { engineKeys } from "./queries";
import {
  RAG_CONTROL_KEY_PART_MAX_CHARS,
  RAG_JOBS_LIMIT_CAP,
  RAG_JOB_TEXT_MAX_CHARS,
  RAG_PROJECT_SLOTS_MAX_ITEMS,
  WATCHER_COOLDOWN_S_MAX,
  WATCHER_DEBOUNCE_MS_MAX,
  boundedRagJobsLimit,
  deriveRagControlView,
  firstJob,
  invalidateAfterRagOpsRun,
  invalidateRagControlQueries,
  invalidateRagReindexSettlementQueries,
  interpretJobProgress,
  invalidateRagWatcherControlQueries,
  normalizeRagControlKeyPart,
  normalizeRagJobsRequestIdentity,
  normalizeRagReindexArgs,
  normalizeRagProjectRoot,
  normalizeRagProjectSlot,
  normalizeRagProjectSlots,
  normalizeRagRequestSeq,
  normalizeWatcherReconfigureArgs,
  isJobFailed,
  isJobTerminal,
  normalizeRagControlScope,
  ragControlKeys,
  ragSemanticOffline,
  requestedJob,
  shouldAcceptRagJobReceipt,
  useRagReindexJobStore,
  useRagJobProgress,
  useRagJobs,
  useRagProjects,
  useRagReadiness,
  useRagServiceState,
  useRagWatcher,
  type BrokeredResult,
  type RagJobsSnapshot,
  type RagProjectsState,
  type RagProjectSlot,
} from "./ragControl";
import { ENGINE_WAIT } from "../../testing/timing";

// --- pure interpreters (no render) ------------------------------------------------

describe("rag job interpreters", () => {
  it("normalizes runtime rag-control scope values", () => {
    expect(normalizeRagControlScope(" scope-a ")).toBe("scope-a");
    expect(normalizeRagControlScope("   ")).toBeNull();
    expect(normalizeRagControlScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeRagControlKeyPart(" scope-a ")).toBe("scope-a");
    expect(normalizeRagControlKeyPart("   ", "all")).toBe("all");
    expect(normalizeRagControlKeyPart(null)).toBe("");
    expect(normalizeRagProjectRoot(" Y:/repo ")).toBe("Y:/repo");
    expect(normalizeRagProjectRoot("   ")).toBeNull();
    expect(normalizeRagProjectRoot({ root: "Y:/repo" })).toBeNull();
    expect(normalizeRagProjectSlot({ root: " Y:/repo ", ref_count: 2 })).toEqual({
      root: "Y:/repo",
      ref_count: 2,
    });
    expect(normalizeRagProjectSlot({ root: "   " })).toBeNull();
    expect(normalizeRagProjectSlot({ root: "Y:/repo", ref_count: Number.NaN })).toEqual(
      {
        root: "Y:/repo",
      },
    );
    expect(normalizeRagProjectSlots({ projects: [{ root: "Y:/repo" }] })).toEqual([]);
    expect(
      normalizeRagControlKeyPart("x".repeat(RAG_CONTROL_KEY_PART_MAX_CHARS + 1)),
    ).toBe("");
    expect(
      normalizeRagProjectSlot({
        root: "x".repeat(RAG_CONTROL_KEY_PART_MAX_CHARS + 1),
      }),
    ).toBeNull();
    expect(
      normalizeRagProjectSlots(
        Array.from({ length: RAG_PROJECT_SLOTS_MAX_ITEMS + 1 }, (_, index) => ({
          root: `Y:/repo-${index}`,
        })),
      ),
    ).toHaveLength(RAG_PROJECT_SLOTS_MAX_ITEMS);
    expect(normalizeRagRequestSeq(2)).toBe(2);
    expect(normalizeRagRequestSeq(2.5)).toBeNull();
    expect(normalizeRagRequestSeq(-1)).toBeNull();
    expect(normalizeRagRequestSeq("2")).toBeNull();
  });

  it("normalizes reindex args at the rag control seam", () => {
    expect(normalizeRagReindexArgs({ type: " vault ", clean: true })).toEqual({
      type: "vault",
      clean: true,
    });
    expect(normalizeRagReindexArgs({ type: "code", clean: false })).toEqual({
      type: "code",
      clean: false,
    });
    expect(normalizeRagReindexArgs(null)).toEqual({});
    expect(normalizeRagReindexArgs({ type: "all", clean: "true" })).toEqual({});
    expect(normalizeRagReindexArgs({ type: { value: "vault" }, clean: 1 })).toEqual({});
  });

  it("normalizes watcher reconfigure args at the rag control seam", () => {
    expect(
      normalizeWatcherReconfigureArgs({
        debounce_ms: "250",
        cooldown_s: "3.5",
      }),
    ).toEqual({
      debounce_ms: 250,
      cooldown_s: 3.5,
    });
    expect(
      normalizeWatcherReconfigureArgs({
        debounce_ms: 0,
        cooldown_s: "0",
      }),
    ).toEqual({
      debounce_ms: 0,
      cooldown_s: 0,
    });
  });

  it("drops invalid watcher reconfigure args before dispatch", () => {
    expect(normalizeWatcherReconfigureArgs(null)).toEqual({});
    expect(
      normalizeWatcherReconfigureArgs({
        debounce_ms: "",
        cooldown_s: "",
      }),
    ).toEqual({});
    expect(
      normalizeWatcherReconfigureArgs({
        debounce_ms: "10.5",
        cooldown_s: "nope",
      }),
    ).toEqual({});
    expect(
      normalizeWatcherReconfigureArgs({
        debounce_ms: { value: "250" },
        cooldown_s: ["3"],
      }),
    ).toEqual({});
    expect(
      normalizeWatcherReconfigureArgs({
        debounce_ms: String(WATCHER_DEBOUNCE_MS_MAX + 1),
        cooldown_s: String(WATCHER_COOLDOWN_S_MAX + 0.5),
      }),
    ).toEqual({});
  });

  it("keys job progress by active scope first, then job id", () => {
    expect(ragControlKeys.jobs("wt-a", "job-1")).toEqual([
      "engine",
      "ops-rag",
      "jobs",
      "wt-a",
      "job-1",
    ]);
    expect(ragControlKeys.jobs("wt-a", "job-1")).not.toEqual(
      ragControlKeys.jobs("wt-b", "job-1"),
    );
    expect(ragControlKeys.jobs("wt-a", "job-1")).not.toEqual(
      ragControlKeys.jobs("wt-a", "job-2"),
    );
  });

  it("normalizes rag-control key scope and job parts before cache identity", () => {
    expect(ragControlKeys.serviceState(" wt-a ")).toEqual(
      ragControlKeys.serviceState("wt-a"),
    );
    expect(ragControlKeys.watcher(" wt-a ")).toEqual(ragControlKeys.watcher("wt-a"));
    expect(ragControlKeys.projects(" wt-a ")).toEqual(ragControlKeys.projects("wt-a"));
    expect(ragControlKeys.readiness(" wt-a ")).toEqual(
      ragControlKeys.readiness("wt-a"),
    );
    expect(ragControlKeys.jobs(" wt-a ", " job-1 ")).toEqual(
      ragControlKeys.jobs("wt-a", "job-1"),
    );
    expect(ragControlKeys.jobs("wt-a", "   ")).toEqual(ragControlKeys.jobs("wt-a"));
  });

  it("classifies live vs terminal vs failed phases", () => {
    expect(isJobTerminal("running")).toBe(false);
    expect(isJobTerminal(" running ")).toBe(false);
    expect(isJobTerminal("queued")).toBe(false);
    expect(isJobTerminal("done")).toBe(true);
    expect(isJobTerminal("error")).toBe(true);
    expect(isJobTerminal(undefined)).toBe(false);
    expect(isJobFailed(" error ")).toBe(true);
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

  it("treats an absent semantic tier in a brokered read as offline", () => {
    const data: BrokeredResult<RagJobsSnapshot> = {
      envelope: { jobs: [] },
      tiers: { structural: { available: true } },
    };

    expect(ragSemanticOffline(data)).toBe(true);
    expect(interpretJobProgress(data, "j1")).toMatchObject({
      semanticOffline: true,
      polling: false,
    });
  });

  it("firstJob is the newest-first head, undefined when empty", () => {
    expect(firstJob({ jobs: [] })).toBeUndefined();
    expect(firstJob(undefined)).toBeUndefined();
    expect(firstJob({ jobs: [{ id: "a", phase: "done" }] })?.id).toBe("a");
  });

  it("bounds non-polling rag jobs reads before query key and broker body", () => {
    expect(boundedRagJobsLimit(0)).toBe(1);
    expect(boundedRagJobsLimit(Number.NaN)).toBe(1);
    expect(boundedRagJobsLimit(Number.POSITIVE_INFINITY)).toBe(1);
    expect(boundedRagJobsLimit(" 12 ")).toBe(12);
    expect(boundedRagJobsLimit("")).toBe(1);
    expect(boundedRagJobsLimit({ limit: 10 })).toBe(1);
    expect(boundedRagJobsLimit(10.8)).toBe(10);
    expect(boundedRagJobsLimit(RAG_JOBS_LIMIT_CAP + 100)).toBe(RAG_JOBS_LIMIT_CAP);
    expect(normalizeRagJobsRequestIdentity(" scope-a ", " 8 ")).toEqual({
      scope: "scope-a",
      limit: 8,
    });
    expect(normalizeRagJobsRequestIdentity({ scope: "scope-a" }, 8)).toEqual({
      scope: null,
      limit: 8,
    });
  });

  it("reads progress only for the requested job id, not the envelope head", () => {
    const snapshot: RagJobsSnapshot = {
      jobs: [
        { id: "stale-head", phase: "done" },
        {
          id: "requested",
          phase: "running",
          progress: { completed: 2, total: 5 },
        },
      ],
    };

    expect(requestedJob(snapshot, "requested")?.id).toBe("requested");

    const view = interpretJobProgress(
      { envelope: snapshot, tiers: { semantic: { available: true } } },
      "requested",
    );

    expect(view).toMatchObject({
      job: { id: "requested" },
      phase: "running",
      terminal: false,
      polling: true,
    });
    expect(view.fraction).toBeCloseTo(0.4);
  });

  it("normalizes brokered job ids phases steps and malformed progress counts", () => {
    const snapshot: RagJobsSnapshot = {
      jobs: [
        {
          id: " requested ",
          phase: " running ",
          progress: {
            step: " embedding ",
            completed: Number.NaN,
            total: 5,
          },
        },
      ],
    };

    expect(requestedJob(snapshot, "requested")?.id).toBe(" requested ");

    const view = interpretJobProgress(
      { envelope: snapshot, tiers: { semantic: { available: true } } },
      " requested ",
    );

    expect(view).toMatchObject({
      job: { id: " requested " },
      phase: "running",
      step: "embedding",
      fraction: undefined,
      terminal: false,
      polling: true,
    });

    const overlong = "x".repeat(RAG_JOB_TEXT_MAX_CHARS + 1);
    const dropped = interpretJobProgress(
      {
        envelope: {
          jobs: [
            {
              id: overlong,
              phase: overlong,
              progress: { step: overlong, completed: 1, total: 2 },
            },
          ],
        },
        tiers: { semantic: { available: true } },
      },
      overlong,
    );
    expect(dropped).toMatchObject({
      job: undefined,
      phase: undefined,
      step: undefined,
      fraction: undefined,
      terminal: false,
      polling: false,
    });
  });

  it("treats blank job ids as no active poll", () => {
    const view = interpretJobProgress(
      {
        envelope: { jobs: [{ id: "   ", phase: "running" }] },
        tiers: { semantic: { available: true } },
      },
      "   ",
    );

    expect(view).toMatchObject({
      job: undefined,
      phase: undefined,
      terminal: false,
      polling: false,
    });
  });

  it("keeps polling when a brokered jobs snapshot does not include the requested id", () => {
    const view = interpretJobProgress(
      {
        envelope: { jobs: [{ id: "other", phase: "done" }] },
        tiers: { semantic: { available: true } },
      },
      "requested",
    );

    expect(view).toMatchObject({
      job: undefined,
      phase: undefined,
      terminal: false,
      polling: true,
    });
  });

  it("accepts reindex job receipts only for the current scope and latest trigger", () => {
    expect(
      shouldAcceptRagJobReceipt({
        currentScope: "scope-a",
        requestScope: "scope-a",
        currentSeq: 2,
        requestSeq: 2,
      }),
    ).toBe(true);
    expect(
      shouldAcceptRagJobReceipt({
        currentScope: " scope-a ",
        requestScope: "scope-a",
        currentSeq: 2,
        requestSeq: 2,
      }),
    ).toBe(true);
    expect(
      shouldAcceptRagJobReceipt({
        currentScope: "scope-b",
        requestScope: "scope-a",
        currentSeq: 2,
        requestSeq: 2,
      }),
    ).toBe(false);
    expect(
      shouldAcceptRagJobReceipt({
        currentScope: "scope-a",
        requestScope: "scope-a",
        currentSeq: 3,
        requestSeq: 2,
      }),
    ).toBe(false);
    expect(
      shouldAcceptRagJobReceipt({
        currentScope: { scope: "scope-a" },
        requestScope: "scope-a",
        currentSeq: 2,
        requestSeq: 2,
      }),
    ).toBe(false);
    expect(
      shouldAcceptRagJobReceipt({
        currentScope: "scope-a",
        requestScope: "scope-a",
        currentSeq: 2,
        requestSeq: "2",
      }),
    ).toBe(false);
  });

  it("centralizes the scoped reindex job identity and rejects stale receipts", () => {
    useRagReindexJobStore.setState({ scope: null, jobId: null, requestSeq: 0 });

    const firstSeq = useRagReindexJobStore.getState().beginRequest("scope-a");
    useRagReindexJobStore.getState().acceptReceipt("scope-a", firstSeq, "job-a");
    expect(useRagReindexJobStore.getState()).toMatchObject({
      scope: "scope-a",
      jobId: "job-a",
      requestSeq: firstSeq,
    });

    const secondSeq = useRagReindexJobStore.getState().beginRequest("scope-a");
    useRagReindexJobStore.getState().acceptReceipt("scope-a", firstSeq, "stale-job");
    expect(useRagReindexJobStore.getState()).toMatchObject({
      scope: "scope-a",
      jobId: null,
      requestSeq: secondSeq,
    });

    useRagReindexJobStore.getState().acceptReceipt("scope-b", secondSeq, "wrong-scope");
    expect(useRagReindexJobStore.getState().jobId).toBeNull();

    useRagReindexJobStore.getState().setScope("scope-b");
    expect(useRagReindexJobStore.getState()).toMatchObject({
      scope: "scope-b",
      jobId: null,
      requestSeq: secondSeq + 1,
    });

    useRagReindexJobStore.setState({ scope: null, jobId: null, requestSeq: 0 });
  });

  it("normalizes reindex job identity mutations at the store boundary", () => {
    useRagReindexJobStore.setState({ scope: null, jobId: null, requestSeq: 0 });

    const seq = useRagReindexJobStore.getState().beginRequest(" scope-a ");
    expect(useRagReindexJobStore.getState()).toMatchObject({
      scope: "scope-a",
      jobId: null,
      requestSeq: seq,
    });

    useRagReindexJobStore.getState().acceptReceipt(" scope-a ", seq, " job-a ");
    expect(useRagReindexJobStore.getState().jobId).toBe("job-a");

    useRagReindexJobStore.getState().acceptReceipt(" scope-a ", seq, "   ");
    expect(useRagReindexJobStore.getState().jobId).toBe("job-a");

    useRagReindexJobStore
      .getState()
      .acceptReceipt("scope-a", `${seq}`, "job-string-seq");
    expect(useRagReindexJobStore.getState().jobId).toBe("job-a");

    useRagReindexJobStore.getState().setScope({ scope: "scope-b" });
    expect(useRagReindexJobStore.getState()).toMatchObject({
      scope: null,
      jobId: null,
      requestSeq: seq + 1,
    });

    useRagReindexJobStore.setState({ scope: null, jobId: null, requestSeq: 0 });
  });

  it("projects brokered rag control reads into one panel view", () => {
    const view = deriveRagControlView(
      "scope-a",
      {
        envelope: { index: { cuda: true, gpu_name: "RTX", vault_count: 42 } },
        tiers: { semantic: { available: true } },
      },
      {
        envelope: {
          watch_enabled: true,
          debounce_ms: 250,
          cooldown_s: 5,
          watching: ["docs"],
        },
        tiers: { semantic: { available: true } },
      },
      {
        envelope: { ready: true },
        tiers: { semantic: { available: true } },
      },
      {
        envelope: { projects: [{ root: "/repo" }] },
        tiers: { semantic: { available: true } },
      },
    );

    expect(view).toMatchObject({
      semanticOffline: false,
      disabled: false,
      index: { gpu_name: "RTX", vault_count: 42 },
      watch: { watch_enabled: true, debounce_ms: 250, cooldown_s: 5 },
      hasWatcherConfig: true,
      ready: true,
      projects: [{ root: "/repo" }],
      hasProjects: true,
    });
  });

  it("holds the rag control view disabled when semantic tier degrades", () => {
    const view = deriveRagControlView(
      "scope-a",
      {
        envelope: null,
        tiers: { semantic: { available: false, reason: "rag service down" } },
      },
      undefined,
      undefined,
      undefined,
    );

    expect(view).toMatchObject({
      semanticOffline: true,
      disabled: true,
      index: undefined,
      watch: null,
      hasWatcherConfig: false,
      ready: undefined,
      projects: [],
      hasProjects: false,
    });
  });

  it("holds the rag control view disabled when any control read degrades", () => {
    const view = deriveRagControlView(
      "scope-a",
      {
        envelope: { index: { cuda: true, gpu_name: "RTX", vault_count: 42 } },
        tiers: { semantic: { available: true } },
      },
      {
        envelope: null,
        tiers: { semantic: { available: false, reason: "watcher unavailable" } },
      },
      {
        envelope: { ready: true },
        tiers: { semantic: { available: true } },
      },
      {
        envelope: { projects: [{ root: "/repo" }] },
        tiers: { semantic: { available: true } },
      },
    );

    expect(view).toMatchObject({
      semanticOffline: true,
      disabled: true,
      index: { gpu_name: "RTX", vault_count: 42 },
      watch: null,
      hasWatcherConfig: false,
      ready: true,
      projects: [{ root: "/repo" }],
      hasProjects: true,
    });
  });

  it("projects only normalized resident project slots into the rag control view", () => {
    const view = deriveRagControlView("scope-a", undefined, undefined, undefined, {
      envelope: {
        projects: [
          { root: " Y:/repo ", ref_count: 1, idle_seconds: 2 },
          { root: "   ", ref_count: 99 },
          { root: { path: "Y:/bad" } },
          { root: "Y:/finite-only", idle_seconds: Number.NaN, last_access: 5 },
        ] as unknown as RagProjectsState["projects"],
      },
      tiers: { semantic: { available: true } },
    });

    expect(view.projects).toEqual([
      { root: "Y:/repo", ref_count: 1, idle_seconds: 2 },
      { root: "Y:/finite-only", last_access: 5 },
    ]);
    expect(view.hasProjects).toBe(true);
  });

  it("treats malformed resident project payloads as an empty control projection", () => {
    const view = deriveRagControlView("scope-a", undefined, undefined, undefined, {
      envelope: { projects: { root: "Y:/repo" } as unknown as RagProjectSlot[] },
      tiers: { semantic: { available: true } },
    });

    expect(view.projects).toEqual([]);
    expect(view.hasProjects).toBe(false);
  });

  it("invalidates watcher readiness together after watcher controls", () => {
    const client = new QueryClient();
    const watcherKey = ragControlKeys.watcher("wt-a");
    const readinessKey = ragControlKeys.readiness("wt-a");
    const projectsKey = ragControlKeys.projects("wt-a");
    client.setQueryData(watcherKey, { envelope: { watch_enabled: true } });
    client.setQueryData(readinessKey, { envelope: { ready: true } });
    client.setQueryData(projectsKey, { envelope: { projects: [] } });

    invalidateRagWatcherControlQueries(client);

    expect(client.getQueryState(watcherKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(readinessKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(projectsKey)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("invalidates the brokered rag control read family after a rag operation", () => {
    const client = new QueryClient();
    const scope = "wt-a";
    const keys = [
      ragControlKeys.serviceState(scope),
      ragControlKeys.readiness(scope),
      ragControlKeys.jobs(scope, "job-1"),
      ragControlKeys.projects(scope),
      ragControlKeys.watcher(scope),
    ];
    for (const key of keys) {
      client.setQueryData(key, { ok: true });
    }

    invalidateRagControlQueries(client);

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    client.clear();
  });

  it("refreshes scoped semantic consumers after rag service lifecycle ops", () => {
    const client = new QueryClient();
    const scope = "wt-a";
    const otherScope = "wt-b";
    const affectedKeys = [
      engineKeys.status(),
      ragControlKeys.serviceState(scope),
      ragControlKeys.readiness(scope),
      ragControlKeys.jobs(scope, "job-1"),
      ragControlKeys.projects(scope),
      ragControlKeys.watcher(scope),
      engineKeys.search(scope, "state", "vault"),
      engineKeys.graphEmbeddings(scope, "status", null),
    ];
    const unaffectedKeys = [
      engineKeys.search(otherScope, "state", "vault"),
      engineKeys.graphEmbeddings(otherScope, "status", null),
    ];
    for (const key of [...affectedKeys, ...unaffectedKeys]) {
      client.setQueryData(key, { ok: true });
    }

    invalidateAfterRagOpsRun(client, scope, "server-start");

    for (const key of affectedKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
    client.clear();
  });

  it("keeps semantic result caches stable for non-lifecycle rag ops", () => {
    const client = new QueryClient();
    const scope = "wt-a";
    const controlKeys = [
      engineKeys.status(),
      ragControlKeys.serviceState(scope),
      ragControlKeys.readiness(scope),
      ragControlKeys.jobs(scope, "job-1"),
      ragControlKeys.projects(scope),
      ragControlKeys.watcher(scope),
    ];
    const semanticKeys = [
      engineKeys.search(scope, "state", "vault"),
      engineKeys.graphEmbeddings(scope, "status", null),
    ];
    for (const key of [...controlKeys, ...semanticKeys]) {
      client.setQueryData(key, { ok: true });
    }

    invalidateAfterRagOpsRun(client, scope, "reindex");

    for (const key of controlKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of semanticKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
    client.clear();
  });

  it("refreshes semantic consumers after a successful reindex settles", () => {
    const client = new QueryClient();
    const scope = "wt-a";
    const otherScope = "wt-b";
    const affectedKeys = [
      engineKeys.status(),
      ragControlKeys.serviceState(scope),
      ragControlKeys.readiness(scope),
      ragControlKeys.jobs(scope, "job-1"),
      ragControlKeys.projects(scope),
      engineKeys.search(scope, "state", "vault"),
      engineKeys.graphEmbeddings(scope, "status", null),
    ];
    const unaffectedKeys = [
      engineKeys.search(otherScope, "state", "vault"),
      engineKeys.graphEmbeddings(otherScope, "status", null),
    ];

    for (const key of [...affectedKeys, ...unaffectedKeys]) {
      client.setQueryData(key, { ok: true });
    }

    invalidateRagReindexSettlementQueries(client, scope, true);

    for (const key of affectedKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
    client.clear();
  });

  it("keeps semantic result caches stable after a failed reindex settles", () => {
    const client = new QueryClient();
    const scope = "wt-a";
    const controlKeys = [
      engineKeys.status(),
      ragControlKeys.serviceState(scope),
      ragControlKeys.readiness(scope),
      ragControlKeys.jobs(scope, "job-1"),
      ragControlKeys.projects(scope),
    ];
    const semanticKeys = [
      engineKeys.search(scope, "state", "vault"),
      engineKeys.graphEmbeddings(scope, "status", null),
    ];

    for (const key of [...controlKeys, ...semanticKeys]) {
      client.setQueryData(key, { ok: true });
    }

    invalidateRagReindexSettlementQueries(client, scope, false);

    for (const key of controlKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of semanticKeys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
    client.clear();
  });
});

// --- live broker reads (real engine) ----------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function clientWrapper(client: QueryClient) {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

/** The broker contract: a resolved read is well-formed and EITHER carries rag's
 *  envelope (rag up) OR reports semantic unavailable in tiers (rag down) — never
 *  a thrown error. Holds whether or not the rag service is running. */
function expectBrokerContract(data: BrokeredResult<unknown> | undefined): void {
  expect(data).toBeDefined();
  if (!ragSemanticOffline(data)) {
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
    await waitFor(() => expect(result.current.svc.data).toBeDefined(), ENGINE_WAIT);
    await waitFor(() => expect(result.current.watcher.data).toBeDefined(), ENGINE_WAIT);
    await waitFor(
      () => expect(result.current.projects.data).toBeDefined(),
      ENGINE_WAIT,
    );
    // Each read honors the broker degradation contract; none throws.
    expect(result.current.svc.isError).toBe(false);
    expect(result.current.watcher.isError).toBe(false);
    expect(result.current.projects.isError).toBe(false);
    expectBrokerContract(result.current.svc.data);
    expectBrokerContract(result.current.watcher.data);
    expectBrokerContract(result.current.projects.data);
  });
});

describe("rag control disabled cache boundaries", () => {
  const availableTiers = { semantic: { available: true } };

  it("does not expose cached broker reads when no scope is selected", () => {
    const client = new QueryClient();
    client.setQueryData(ragControlKeys.serviceState(""), {
      envelope: { index: { cuda: true, gpu_name: "cached" } },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.watcher(""), {
      envelope: {
        watch_enabled: true,
        debounce_ms: 250,
        cooldown_s: 5,
        watching: ["cached"],
      },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.projects(""), {
      envelope: { projects: [{ root: "cached" }] },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.readiness(""), {
      envelope: { ready: true },
      tiers: availableTiers,
    });

    const { result } = renderHook(
      () => ({
        service: useRagServiceState(null),
        watcher: useRagWatcher(null),
        projects: useRagProjects(null),
        readiness: useRagReadiness(null),
      }),
      { wrapper: clientWrapper(client) },
    );

    expect(result.current.service.data).toBeUndefined();
    expect(result.current.watcher.data).toBeUndefined();
    expect(result.current.projects.data).toBeUndefined();
    expect(result.current.readiness.data).toBeUndefined();
    client.clear();
  });

  it("does not expose cached broker reads for malformed runtime scope values", () => {
    const client = new QueryClient();
    client.setQueryData(ragControlKeys.serviceState("scope-a"), {
      envelope: { index: { cuda: true, gpu_name: "cached" } },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.watcher("scope-a"), {
      envelope: {
        watch_enabled: true,
        debounce_ms: 250,
        cooldown_s: 5,
        watching: ["cached"],
      },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.projects("scope-a"), {
      envelope: { projects: [{ root: "cached" }] },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.readiness("scope-a"), {
      envelope: { ready: true },
      tiers: availableTiers,
    });

    const malformedScope = { scope: "scope-a" };
    const { result } = renderHook(
      () => ({
        service: useRagServiceState(malformedScope),
        watcher: useRagWatcher(malformedScope),
        projects: useRagProjects(malformedScope),
        readiness: useRagReadiness(malformedScope),
      }),
      { wrapper: clientWrapper(client) },
    );

    expect(result.current.service.data).toBeUndefined();
    expect(result.current.watcher.data).toBeUndefined();
    expect(result.current.projects.data).toBeUndefined();
    expect(result.current.readiness.data).toBeUndefined();
    client.clear();
  });

  it("does not expose cached job data when polling is disabled", () => {
    const client = new QueryClient();
    client.setQueryData(ragControlKeys.jobs("", "job-1"), {
      envelope: {
        jobs: [
          {
            id: "job-1",
            phase: "running",
            progress: { completed: 1, total: 2, step: "cached" },
          },
        ],
      },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.jobs("", "recent-10"), {
      envelope: { jobs: [{ id: "recent", phase: "done" }] },
      tiers: availableTiers,
    });

    const { result } = renderHook(
      () => ({
        progress: useRagJobProgress(null, "job-1"),
        jobs: useRagJobs(null),
      }),
      { wrapper: clientWrapper(client) },
    );

    expect(result.current.progress).toMatchObject({
      job: undefined,
      phase: undefined,
      terminal: false,
      polling: false,
      semanticOffline: false,
    });
    expect(result.current.jobs.data).toBeUndefined();
    client.clear();
  });

  it("does not expose cached job data for malformed runtime scope values", () => {
    const client = new QueryClient();
    client.setQueryData(ragControlKeys.jobs("scope-a", "job-1"), {
      envelope: {
        jobs: [
          {
            id: "job-1",
            phase: "running",
            progress: { completed: 1, total: 2, step: "cached" },
          },
        ],
      },
      tiers: availableTiers,
    });
    client.setQueryData(ragControlKeys.jobs("scope-a", "recent-10"), {
      envelope: { jobs: [{ id: "recent", phase: "done" }] },
      tiers: availableTiers,
    });

    const malformedScope = { scope: "scope-a" };
    const { result } = renderHook(
      () => ({
        progress: useRagJobProgress(malformedScope, "job-1"),
        jobs: useRagJobs(malformedScope),
      }),
      { wrapper: clientWrapper(client) },
    );

    expect(result.current.progress).toMatchObject({
      job: undefined,
      phase: undefined,
      terminal: false,
      polling: false,
      semanticOffline: false,
    });
    expect(result.current.jobs.data).toBeUndefined();
    client.clear();
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
