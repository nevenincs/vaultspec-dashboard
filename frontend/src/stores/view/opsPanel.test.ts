import { describe, expect, it } from "vitest";

import type { OpsWhitelistEntry } from "../server/opsActions";
import type { RagStatusView } from "../server/queries";
import {
  deriveOpsControlButtonClassName,
  deriveOpsControlMark,
  deriveOpsControlButtonPresentationView,
  deriveOpsPanelView,
  deriveRagControlPresentationView,
  deriveRagReindexProgressView,
  deriveRagWatcherConfigPresentationView,
} from "./opsPanel";

const ops: readonly OpsWhitelistEntry[] = [
  { target: "core", verb: "vault-check", label: "vault check" },
  { target: "rag", verb: "server-start", label: "start rag" },
  { target: "rag", verb: "server-stop", label: "stop rag" },
  { target: "rag", verb: "reindex", label: "reindex" },
];

function rag(patch: Partial<RagStatusView>): RagStatusView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    running: false,
    ready: false,
    ...patch,
  };
}

describe("deriveOpsPanelView", () => {
  it("shows the full operation cluster while rag state is still unknown", () => {
    const view = deriveOpsPanelView(
      "scope-a",
      { opsDisabled: false },
      rag({ loading: true }),
      null,
      ops,
    );

    expect(view.verbs.map((op) => `${op.target}:${op.verb}`)).toEqual([
      "core:vault-check",
      "rag:server-start",
      "rag:server-stop",
      "rag:reindex",
    ]);
  });

  it("offers start when rag is stopped or degraded", () => {
    expect(
      deriveOpsPanelView(
        "scope-a",
        { opsDisabled: false },
        rag({ running: false }),
        null,
        ops,
      ).verbs.map((op) => op.verb),
    ).toEqual(["vault-check", "server-start"]);

    expect(
      deriveOpsPanelView(
        "scope-a",
        { opsDisabled: false },
        rag({ running: true, degraded: true }),
        null,
        ops,
      ).verbs.map((op) => op.verb),
    ).toEqual(["vault-check", "server-start"]);
  });

  it("offers running-rag controls when rag is available", () => {
    const view = deriveOpsPanelView(
      "scope-a",
      { opsDisabled: false },
      rag({ running: true }),
      null,
      ops,
    );

    expect(view.verbs.map((op) => op.verb)).toEqual([
      "vault-check",
      "server-stop",
      "reindex",
    ]);
  });

  it("projects time-travel disablement and receipt display state", () => {
    const view = deriveOpsPanelView(
      "scope-a",
      { opsDisabled: true },
      rag({ running: true }),
      { verb: "reindex", tone: "down", text: "rag is down - start it first" },
      ops,
    );

    expect(view.timeTravel).toBe(true);
    expect(view.receiptToneClass).toBe("text-state-stale");
    expect(view.liveMessage).toBe("reindex rag is down - start it first");
  });
});

describe("deriveOpsControlButtonClassName", () => {
  it("projects enabled and disabled ops button chrome", () => {
    expect(deriveOpsControlButtonClassName(false)).toBe(
      "border-rule text-ink hover:border-rule-strong hover:bg-paper-sunken",
    );
    expect(deriveOpsControlButtonClassName(true)).toBe(
      "cursor-not-allowed border-rule text-ink-faint",
    );
  });
});

describe("deriveOpsControlMark", () => {
  it("projects whitelist verbs to abstract chrome marks", () => {
    expect(deriveOpsControlMark({ target: "core", verb: "vault-check" })).toBe(
      "refresh",
    );
    expect(deriveOpsControlMark({ target: "core", verb: "vault-stats" })).toBe(
      "settings",
    );
    expect(deriveOpsControlMark({ target: "rag", verb: "server-start" })).toBe("play");
    expect(deriveOpsControlMark({ target: "rag", verb: "server-stop" })).toBe("square");
    expect(deriveOpsControlMark({ target: "rag", verb: "reindex" })).toBe("refresh");
    expect(deriveOpsControlMark({ target: "rag", verb: "watcher-reconfigure" })).toBe(
      "settings",
    );
  });
});

describe("deriveOpsControlButtonPresentationView", () => {
  it("projects ops action type, idle chrome, and confirm affordance copy", () => {
    expect(
      deriveOpsControlButtonPresentationView(
        { target: "rag", verb: "reindex", label: "reindex" },
        { disabled: false, pending: true },
      ),
    ).toEqual({
      actionType: "ops:rag:reindex",
      mark: "refresh",
      idleDisabled: false,
      idleBusy: true,
      idleButtonClassName:
        "inline-flex items-center gap-fg-1 rounded-fg-xs border px-fg-1-5 py-fg-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus border-rule text-ink hover:border-rule-strong hover:bg-paper-sunken",
      confirmDisabled: false,
      confirmGroupClassName: "flex items-center gap-fg-1",
      confirmButtonClassName:
        "inline-flex items-center gap-fg-1 rounded-fg-xs border border-accent bg-accent-subtle px-fg-1-5 py-fg-0-5 font-medium text-accent-text transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      confirmLabel: "confirm?",
      confirmAriaLabel: "confirm reindex",
      cancelButtonClassName:
        "rounded-fg-xs px-fg-1 text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      cancelLabel: "cancel",
      cancelAriaLabel: "cancel reindex",
    });
  });

  it("projects disabled idle and confirm button state", () => {
    expect(
      deriveOpsControlButtonPresentationView(
        { target: "core", verb: "vault-check", label: "vault check" },
        { disabled: true, pending: false },
      ),
    ).toMatchObject({
      actionType: "ops:core:vault-check",
      idleDisabled: true,
      idleBusy: false,
      confirmDisabled: true,
      confirmAriaLabel: "confirm vault check",
      cancelAriaLabel: "cancel vault check",
    });
  });
});

describe("deriveRagReindexProgressView", () => {
  it("projects determinate progress labels and bar width", () => {
    expect(
      deriveRagReindexProgressView({
        terminal: false,
        failed: false,
        step: "embedding",
        phase: "running",
        fraction: 0.426,
      }),
    ).toEqual({
      statusLabel: "embedding",
      percentLabel: "43%",
      barWidth: "43%",
      barIndeterminate: false,
    });
  });

  it("projects indeterminate queued progress without a width", () => {
    expect(
      deriveRagReindexProgressView({
        terminal: false,
        failed: false,
        step: undefined,
        phase: undefined,
        fraction: undefined,
      }),
    ).toEqual({
      statusLabel: "queued",
      percentLabel: null,
      barWidth: null,
      barIndeterminate: true,
    });
  });

  it("projects terminal success and failure states", () => {
    expect(
      deriveRagReindexProgressView({
        terminal: true,
        failed: false,
        step: "done",
        phase: "done",
        fraction: undefined,
      }),
    ).toMatchObject({
      statusLabel: "reindex complete",
      barWidth: "100%",
      barIndeterminate: false,
    });

    expect(
      deriveRagReindexProgressView({
        terminal: true,
        failed: true,
        step: "failed",
        phase: "failed",
        fraction: undefined,
      }).statusLabel,
    ).toBe("reindex failed");
  });
});

describe("deriveRagControlPresentationView", () => {
  it("projects rag health and project labels for the ops panel", () => {
    expect(
      deriveRagControlPresentationView({
        index: {
          cuda: true,
          gpu_name: "RTX 4080",
          vault_count: 42,
        },
        ready: true,
        projects: [{ root: "Y:/vault" }],
      }),
    ).toEqual({
      sectionLabel: "semantic index",
      offlineMessage:
        "semantic engine offline — start rag to build and serve the index",
      healthRows: [
        {
          key: "gpu",
          label: "gpu",
          valueLabel: "RTX 4080",
          mark: "gpu",
          testId: "rag-gpu",
        },
        {
          key: "vault-docs",
          label: "vault docs",
          valueLabel: "42",
          mark: "none",
          testId: "rag-vault-count",
        },
        {
          key: "models",
          label: "models",
          valueLabel: "loaded",
          mark: "none",
          testId: "rag-readiness",
        },
      ],
      reindexLabel: "reindex vault",
      projectsSectionLabel: "resident projects",
      projectsContainerClassName: "space-y-fg-0-5",
      projectsListClassName: "space-y-fg-0-5",
      hasProjectRows: true,
      projectRows: [
        {
          root: "Y:/vault",
          evictAriaLabel: "evict Y:/vault",
          rowClassName: "flex items-center justify-between gap-fg-1 text-caption",
          rootClassName: "truncate text-ink-muted",
          evictButtonClassName:
            "shrink-0 rounded-fg-xs p-fg-0-5 text-ink-faint hover:text-state-broken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed",
        },
      ],
    });
  });

  it("projects fallback rag health labels when broker fields are absent", () => {
    const view = deriveRagControlPresentationView({
      index: undefined,
      ready: false,
      projects: [],
    });

    expect(view.healthRows.map((row) => row.valueLabel)).toEqual([
      "cpu",
      "—",
      "loading",
    ]);

    expect(
      deriveRagControlPresentationView({
        index: undefined,
        ready: undefined,
        projects: [],
      }),
    ).toMatchObject({
      healthRows: [{ valueLabel: "cpu" }, { valueLabel: "—" }, { valueLabel: "—" }],
      hasProjectRows: false,
      projectRows: [],
    });
  });
});

describe("deriveRagWatcherConfigPresentationView", () => {
  it("keeps watcher control labels behind the ops panel seam", () => {
    expect(deriveRagWatcherConfigPresentationView()).toEqual({
      sectionLabel: "watcher",
      debounceLabel: "debounce ms",
      cooldownLabel: "cooldown s",
      applyLabel: "apply",
      fieldClassName:
        "w-16 rounded-fg-xs border border-rule bg-paper px-fg-1 py-fg-0-5 text-caption text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint",
      inputDisabled: false,
      applyDisabled: false,
      applyBusy: false,
      applyButtonClassName:
        "inline-flex items-center gap-fg-1 rounded-fg-xs border border-rule px-fg-1-5 py-fg-0-5 text-ink hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint",
    });
  });

  it("projects watcher control disabled and pending state", () => {
    expect(
      deriveRagWatcherConfigPresentationView({ disabled: true, pending: false }),
    ).toMatchObject({
      inputDisabled: true,
      applyDisabled: true,
      applyBusy: false,
    });

    expect(
      deriveRagWatcherConfigPresentationView({ disabled: false, pending: true }),
    ).toMatchObject({
      inputDisabled: false,
      applyDisabled: true,
      applyBusy: true,
    });
  });
});
