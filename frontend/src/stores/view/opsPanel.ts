import {
  type DashboardTimelineModeView,
  type OpsReceipt,
  type RagStatusView,
  useActiveScope,
  useDashboardTimelineModeView,
  useRagStatus,
} from "../server/queries";
import { OPS_WHITELIST, type OpsWhitelistEntry } from "../server/opsActions";
import {
  useRagProjectEvict,
  useRagControlView,
  useRagReindexWithProgress,
  useRagWatcherReconfigure,
  type RagJobProgressView,
  type RagControlView,
} from "../server/ragControl";
import { useOpsReceipt, useOpsReceiptBoundary } from "./opsReceipt";

export interface OpsPanelView {
  scope: string | null;
  timeTravel: boolean;
  verbs: readonly OpsWhitelistEntry[];
  receipt: OpsReceipt | null;
  receiptToneClass: string | null;
  liveMessage: string;
}

export interface OpsControlButtonPresentationView {
  actionType: string;
  mark: OpsControlMark;
  idleDisabled: boolean;
  idleBusy: boolean;
  idleButtonClassName: string;
  confirmDisabled: boolean;
  confirmGroupClassName: string;
  confirmButtonClassName: string;
  confirmLabel: string;
  confirmAriaLabel: string;
  cancelButtonClassName: string;
  cancelLabel: string;
  cancelAriaLabel: string;
}

export type OpsControlMark = "refresh" | "settings" | "play" | "square";

export interface RagReindexProgressPresentationView {
  statusLabel: string;
  percentLabel: string | null;
  barWidth: string | null;
  barIndeterminate: boolean;
}

export interface RagWatcherConfigPresentationView {
  sectionLabel: string;
  debounceLabel: string;
  cooldownLabel: string;
  applyLabel: string;
  fieldClassName: string;
  inputDisabled: boolean;
  applyDisabled: boolean;
  applyBusy: boolean;
  applyButtonClassName: string;
}

export interface RagControlHealthRowView {
  key: "gpu" | "vault-docs" | "models";
  label: string;
  valueLabel: string;
  mark: "gpu" | "none";
  testId: string;
}

export interface RagControlProjectRowView {
  root: string;
  evictAriaLabel: string;
  rowClassName: string;
  rootClassName: string;
  evictButtonClassName: string;
}

export interface RagControlPresentationView {
  sectionLabel: string;
  offlineMessage: string;
  healthRows: RagControlHealthRowView[];
  reindexLabel: string;
  projectsSectionLabel: string;
  projectsContainerClassName: string;
  projectsListClassName: string;
  hasProjectRows: boolean;
  projectRows: RagControlProjectRowView[];
}

const RECEIPT_TONE_CLASS: Record<OpsReceipt["tone"], string> = {
  ok: "text-state-active",
  failed: "text-state-broken",
  down: "text-state-stale",
};

export function deriveOpsControlButtonClassName(disabled: boolean): string {
  return disabled
    ? "cursor-not-allowed border-rule text-ink-faint"
    : "border-rule text-ink hover:border-rule-strong hover:bg-paper-sunken";
}

export function deriveOpsControlMark(
  op: Pick<OpsWhitelistEntry, "target" | "verb">,
): OpsControlMark {
  if (op.target === "core" && op.verb === "vault-check") return "refresh";
  if (op.target === "core" && op.verb === "vault-stats") return "settings";
  if (op.target === "rag" && op.verb === "service-start") return "play";
  if (op.target === "rag" && op.verb === "service-stop") return "square";
  if (op.target === "rag" && op.verb === "reindex") return "refresh";
  return "settings";
}

export function deriveOpsControlButtonPresentationView(
  op: Pick<OpsWhitelistEntry, "target" | "verb" | "label">,
  state: { disabled?: boolean; pending?: boolean } = {},
): OpsControlButtonPresentationView {
  const disabled = state.disabled === true;
  const pending = state.pending === true;
  return {
    actionType: `ops:${op.target}:${op.verb}`,
    mark: deriveOpsControlMark(op),
    idleDisabled: disabled,
    idleBusy: pending,
    idleButtonClassName: `inline-flex items-center gap-fg-1 rounded-fg-xs border px-fg-1-5 py-fg-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${deriveOpsControlButtonClassName(disabled)}`,
    confirmDisabled: disabled,
    confirmGroupClassName: "flex items-center gap-fg-1",
    confirmButtonClassName:
      "inline-flex items-center gap-fg-1 rounded-fg-xs border border-accent bg-accent-subtle px-fg-1-5 py-fg-0-5 font-medium text-accent-text transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    confirmLabel: "confirm?",
    confirmAriaLabel: `confirm ${op.label}`,
    cancelButtonClassName:
      "rounded-fg-xs px-fg-1 text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    cancelLabel: "cancel",
    cancelAriaLabel: `cancel ${op.label}`,
  };
}

function ragVerbVisible(rag: RagStatusView, verb: string): boolean {
  const ragKnown = !rag.loading && !rag.errored;
  if (!ragKnown) return true;
  const ragRunning = rag.running && !rag.degraded;
  return verb === "service-start" ? !ragRunning : ragRunning;
}

export function deriveOpsPanelView(
  scope: string | null,
  timeline: Pick<DashboardTimelineModeView, "opsDisabled">,
  rag: RagStatusView,
  receipt: OpsReceipt | null,
  ops: readonly OpsWhitelistEntry[] = OPS_WHITELIST,
): OpsPanelView {
  return {
    scope,
    timeTravel: timeline.opsDisabled,
    verbs: ops.filter((op) =>
      op.target === "rag" ? ragVerbVisible(rag, op.verb) : true,
    ),
    receipt,
    receiptToneClass: receipt ? RECEIPT_TONE_CLASS[receipt.tone] : null,
    liveMessage: receipt ? `${receipt.verb} ${receipt.text}` : "",
  };
}

export function deriveRagReindexProgressView(
  progress: Pick<
    RagJobProgressView,
    "terminal" | "failed" | "step" | "phase" | "fraction"
  >,
): RagReindexProgressPresentationView {
  const statusLabel = progress.terminal
    ? progress.failed
      ? "reindex failed"
      : "reindex complete"
    : (progress.step ?? progress.phase ?? "queued");
  const percent =
    progress.fraction === undefined ? null : Math.round(progress.fraction * 100);

  return {
    statusLabel,
    percentLabel: percent === null ? null : `${percent}%`,
    barWidth: percent !== null ? `${percent}%` : progress.terminal ? "100%" : null,
    barIndeterminate: progress.fraction === undefined && !progress.terminal,
  };
}

export function deriveRagWatcherConfigPresentationView(
  state: { disabled?: boolean; pending?: boolean } = {},
): RagWatcherConfigPresentationView {
  const disabled = state.disabled === true;
  const pending = state.pending === true;
  return {
    sectionLabel: "watcher",
    debounceLabel: "debounce ms",
    cooldownLabel: "cooldown s",
    applyLabel: "apply",
    fieldClassName:
      "w-16 rounded-fg-xs border border-rule bg-paper px-fg-1 py-fg-0-5 text-caption text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint",
    inputDisabled: disabled,
    applyDisabled: disabled || pending,
    applyBusy: pending,
    applyButtonClassName:
      "inline-flex items-center gap-fg-1 rounded-fg-xs border border-rule px-fg-1-5 py-fg-0-5 text-ink hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint",
  };
}

export function deriveRagControlPresentationView(
  ragControl: Pick<RagControlView, "index" | "ready" | "projects">,
): RagControlPresentationView {
  return {
    sectionLabel: "semantic index",
    offlineMessage: "semantic engine offline — start rag to build and serve the index",
    healthRows: [
      {
        key: "gpu",
        label: "gpu",
        valueLabel: ragControl.index?.cuda
          ? (ragControl.index.gpu_name ?? "cuda")
          : "cpu",
        mark: "gpu",
        testId: "rag-gpu",
      },
      {
        key: "vault-docs",
        label: "vault docs",
        valueLabel:
          ragControl.index?.vault_count === undefined
            ? "—"
            : String(ragControl.index.vault_count),
        mark: "none",
        testId: "rag-vault-count",
      },
      {
        key: "models",
        label: "models",
        valueLabel:
          ragControl.ready === true
            ? "loaded"
            : ragControl.ready === false
              ? "loading"
              : "—",
        mark: "none",
        testId: "rag-readiness",
      },
    ],
    reindexLabel: "reindex vault",
    projectsSectionLabel: "resident projects",
    projectsContainerClassName: "space-y-fg-0-5",
    projectsListClassName: "space-y-fg-0-5",
    hasProjectRows: ragControl.projects.length > 0,
    projectRows: ragControl.projects.map((slot) => ({
      root: slot.root,
      evictAriaLabel: `evict ${slot.root}`,
      rowClassName: "flex items-center justify-between gap-fg-1 text-caption",
      rootClassName: "truncate text-ink-muted",
      evictButtonClassName:
        "shrink-0 rounded-fg-xs p-fg-0-5 text-ink-faint hover:text-state-broken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed",
    })),
  };
}

export function useOpsPanelView(): OpsPanelView {
  const scope = useActiveScope();
  const timeline = useDashboardTimelineModeView(scope);
  const rag = useRagStatus();
  const receipt = useOpsReceipt();
  useOpsReceiptBoundary(scope, timeline.opsDisabled);
  return deriveOpsPanelView(scope, timeline, rag, receipt);
}

/**
 * The app-level RAG control section consumes one stores/view seam instead of
 * assembling active scope, brokered reads, and control mutations locally.
 */
export function useOpsPanelRagControl() {
  const scope = useActiveScope();
  return {
    scope,
    ragControl: useRagControlView(scope),
    reindex: useRagReindexWithProgress(scope),
    reconfigure: useRagWatcherReconfigure(),
    evict: useRagProjectEvict(),
  };
}
