import {
  type CoreStatusView,
  type GitStatusView,
  type RagStatusView,
  type StatusRollupView,
  useStatusRecoveryRefresh,
  useStatusRollup,
} from "../server/queries";

export interface CardState {
  label: string;
  tone: "ok" | "warn" | "down";
  toneClass: string;
  toneInkClass: string;
  detail: string;
  rootClassName: string;
  identityClassName: string;
  leadMarkClassName: string;
  labelClassName: string;
  detailRootClassName: string;
  detailClassName: string;
  jobsClassName: string;
  toneMarkClassName: string;
  loadingMarkClassName: string | undefined;
}

const CARD_ROOT_CLASS =
  "flex items-center justify-between gap-fg-2 rounded-fg-md border px-fg-2 py-fg-1 shadow-fg-raised transition-colors duration-ui-fast ease-settle";
const CARD_IDENTITY_CLASS = "flex min-w-0 items-center gap-fg-1-5";
const CARD_LEAD_MARK_CLASS = "shrink-0 text-ink-faint";
const CARD_LABEL_CLASS = "font-medium text-ink";
const CARD_DETAIL_ROOT_CLASS = "flex min-w-0 items-center gap-fg-1-5 text-label";
const CARD_DETAIL_CLASS = "min-w-0 truncate text-ink-muted";
const CARD_JOBS_CLASS =
  "shrink-0 rounded-fg-xs bg-paper-sunken px-fg-1 text-caption text-ink-muted";
const CARD_TONE_MARK_CLASS = "shrink-0";
const CARD_LOADING_MARK_CLASS = "animate-pulse-live";

const TONE_CLASSES: Record<CardState["tone"], string> = {
  ok: "border-rule bg-paper-raised text-ink",
  warn: "border-state-stale/40 bg-paper-raised text-ink",
  down: "border-rule bg-paper text-ink-muted",
};

const TONE_INK: Record<CardState["tone"], string> = {
  ok: "text-state-active",
  warn: "text-state-stale",
  down: "text-ink-faint",
};

function cardState(
  label: string,
  tone: CardState["tone"],
  detail: string,
  loading = false,
): CardState {
  return {
    label,
    tone,
    toneClass: TONE_CLASSES[tone],
    toneInkClass: TONE_INK[tone],
    detail,
    rootClassName: `${CARD_ROOT_CLASS} ${TONE_CLASSES[tone]}`,
    identityClassName: CARD_IDENTITY_CLASS,
    leadMarkClassName: CARD_LEAD_MARK_CLASS,
    labelClassName: CARD_LABEL_CLASS,
    detailRootClassName: CARD_DETAIL_ROOT_CLASS,
    detailClassName: CARD_DETAIL_CLASS,
    jobsClassName: CARD_JOBS_CLASS,
    toneMarkClassName: `${CARD_TONE_MARK_CLASS} ${TONE_INK[tone]}`,
    loadingMarkClassName: loading ? CARD_LOADING_MARK_CLASS : undefined,
  };
}

export function gitCard(git: GitStatusView): CardState {
  if (git.loading) {
    return cardState("git", "down", "checking...");
  }
  if (git.errored) {
    return cardState("git", "down", "unavailable");
  }
  if (git.degraded || !git.git) {
    return cardState("git", "down", "no repository state");
  }
  const { branch, ahead, behind, dirty } = git.git;
  const drift = [
    ahead !== undefined && ahead > 0 ? `↑${ahead}` : "",
    behind !== undefined && behind > 0 ? `↓${behind}` : "",
    dirty ? "dirty" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return cardState(
    "git",
    dirty ? "warn" : "ok",
    `${branch}${drift ? ` · ${drift}` : " · clean"}`,
  );
}

export function coreCard(core: CoreStatusView): CardState {
  if (core.loading) {
    return cardState("core", "down", "checking...");
  }
  if (core.errored) {
    return cardState("core", "down", "unavailable");
  }
  if (!core.reachable) {
    return cardState("core", "down", "unreachable");
  }
  return cardState(
    "core",
    core.vaultHealth === "green" ? "ok" : "warn",
    `vault ${core.vaultHealth ?? "unknown"}`,
  );
}

export interface RagCardView extends CardState {
  /** Whether a numeric job count is present (drives tabular-numeral rendering). */
  jobs?: number;
  /** True while a status snapshot carrying rag is loading. */
  loading: boolean;
}

export function ragCardView(rag: RagStatusView): RagCardView {
  if (rag.loading) {
    return { ...cardState("rag", "down", "checking…", true), loading: true };
  }
  if (rag.errored) {
    return { ...cardState("rag", "down", "unreachable"), loading: false };
  }
  if (rag.degraded) {
    return {
      ...cardState("rag", "warn", rag.reason ? `degraded · ${rag.reason}` : "degraded"),
      loading: false,
    };
  }
  if (!rag.running) {
    return {
      ...cardState("rag", "down", rag.service ?? "absent"),
      loading: false,
    };
  }
  const detail = `${rag.ready ? "ready" : "starting"} · ${rag.watcher ?? "?"} · index ${
    rag.index ?? "?"
  }`;
  return {
    ...cardState("rag", rag.ready ? "ok" : "warn", detail),
    jobs: rag.jobs,
    loading: false,
  };
}

export interface NowStripCardView {
  card: CardState;
  jobs?: number;
  jobsLabel?: string;
  loading?: boolean;
}

export interface NowStripView {
  engineUnreachable: boolean;
  engineUnreachableLabel: string;
  engineCommandLabel: string;
  engineUnreachableClassName: string;
  engineCommandClassName: string;
  rootClassName: string;
  liveRegionClassName: string;
  cards: NowStripCardView[];
  degradations: string[];
  degradationLabel: string | null;
  degradationClassName: string;
  degradationIconClassName: string;
  ragLive: string;
}

function jobsLabel(jobs: number | undefined): string | undefined {
  return jobs === undefined ? undefined : `${jobs} job${jobs === 1 ? "" : "s"}`;
}

export function deriveNowStripView(rollup: StatusRollupView): NowStripView {
  const ragView = ragCardView(rollup.rag);
  const rag = rollup.rag;
  const ragLive = rag.loading
    ? ""
    : rag.errored
      ? "rag status unavailable"
      : rag.degraded
        ? "rag degraded"
        : rag.running
          ? rag.ready
            ? "rag ready"
            : "rag starting"
          : `rag ${rag.service ?? "absent"}`;

  return {
    engineUnreachable: rollup.engineUnreachable,
    engineUnreachableLabel: "engine unreachable — start it with",
    engineCommandLabel: "vaultspec serve",
    engineUnreachableClassName: "text-label text-state-broken",
    engineCommandClassName: "font-mono",
    rootClassName: "space-y-fg-1 text-label",
    liveRegionClassName: "sr-only",
    cards: [
      { card: gitCard(rollup.git) },
      { card: coreCard(rollup.core) },
      {
        card: ragView,
        jobs: ragView.jobs,
        jobsLabel: jobsLabel(ragView.jobs),
        loading: ragView.loading,
      },
    ],
    degradations: rollup.degradations,
    degradationLabel:
      rollup.degradations.length > 0
        ? `degraded: ${rollup.degradations.join(", ")}`
        : null,
    degradationClassName: "flex items-start gap-fg-1-5 text-state-broken",
    degradationIconClassName: "mt-px shrink-0",
    ragLive,
  };
}

export function useNowStripView(): NowStripView {
  const rollup = useStatusRollup();
  useStatusRecoveryRefresh();
  return deriveNowStripView(rollup);
}
