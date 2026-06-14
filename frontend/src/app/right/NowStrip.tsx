// The now strip (W03.P10.S40; re-skinned W02.P15.S31 onto the OKLCH token layer
// and the sanctioned Lucide chrome marks per the rag-manager surface ADR): "what
// is happening / what just changed" — git status for the current worktree,
// vaultspec-core's in-flight status, and the rag service rollup, from the /status
// recovery snapshot refreshed by the backends and git SSE channels. Each backend's
// degraded state renders honestly: stopped, crashed, absent — designed states,
// not errors.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): the strip
// is a DUMB view. The rag rollup is read EXCLUSIVELY through the stores
// `useRagStatus` selector — it never inspects the raw `status.rag` or the raw
// `tiers` block, and it fetches nothing itself. git/core stay pure rollups over
// the same snapshot. Status meaning is carried by a Lucide mark plus text FIRST,
// with a semantic state token as redundant reinforcement, so every card survives
// grayscale (rag-manager ADR / both parent ADRs' non-color-only gate).

import {
  AlertTriangle,
  CircleSlash,
  Database,
  Eye,
  GitBranch,
  Loader2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { debounce } from "../../platform/timing";
import type { EngineStatus } from "../../stores/server/engine";
import { useEngineStatus } from "../../stores/server/engine";
import {
  engineKeys,
  useEngineStream,
  useRagStatus,
  type RagStatusView,
} from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";

// Chrome marks read one density step below body text so the structural chrome
// stays attenuated (design-language ADR layer 4 / iconography ADR 14px gate).
const MARK_PX = 13;

// --- pure rollups (unit-tested) ---------------------------------------------------

export interface CardState {
  label: string;
  tone: "ok" | "warn" | "down";
  detail: string;
}

export function gitCard(status: EngineStatus | undefined): CardState {
  if (!status?.git) {
    return { label: "git", tone: "down", detail: "no repository state" };
  }
  const { branch, ahead, behind, dirty } = status.git;
  const drift = [
    ahead > 0 ? `↑${ahead}` : "",
    behind > 0 ? `↓${behind}` : "",
    dirty.length > 0 ? `${dirty.length} dirty` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    label: "git",
    tone: dirty.length > 0 ? "warn" : "ok",
    detail: `${branch}${drift ? ` · ${drift}` : " · clean"}`,
  };
}

export function coreCard(status: EngineStatus | undefined): CardState {
  if (!status?.core?.reachable) {
    return { label: "core", tone: "down", detail: "unreachable" };
  }
  return {
    label: "core",
    tone: status.core.vault_health === "green" ? "ok" : "warn",
    detail: `vault ${status.core.vault_health ?? "unknown"}`,
  };
}

// --- rag rollup projection (rag-manager ADR) -----------------------------------------
//
// A pure projection of the interpreted `RagStatusView` onto the card vocabulary:
// the composite readiness line, the lifecycle tone, and the structural Lucide
// mark. Kept pure and exported so the readiness/degraded/stopped/in-flight
// branches are unit-tested without a DOM.

export interface RagCardView extends CardState {
  /** Whether a numeric job count is present (drives tabular-numeral rendering). */
  jobs?: number;
  /** True while a status snapshot carrying rag is loading. */
  loading: boolean;
}

export function ragCardView(rag: RagStatusView): RagCardView {
  if (rag.loading) {
    return { label: "rag", tone: "down", detail: "checking…", loading: true };
  }
  if (rag.errored) {
    return { label: "rag", tone: "down", detail: "unreachable", loading: false };
  }
  // Designed degradation: the engine reports the semantic tier unavailable. This
  // is the capability being down, distinct from an operator-stopped service.
  if (rag.degraded) {
    return {
      label: "rag",
      tone: "warn",
      detail: rag.reason ? `degraded · ${rag.reason}` : "degraded",
      loading: false,
    };
  }
  if (!rag.running) {
    // stopped / absent — a designed state, plainly worded, never an error.
    return {
      label: "rag",
      tone: "down",
      detail: rag.service ?? "absent",
      loading: false,
    };
  }
  // Running. State the composite readiness plainly rather than making the
  // operator infer it (rag-manager ADR). Detail carries watcher · index · jobs.
  const detail = `${rag.ready ? "ready" : "starting"} · ${rag.watcher ?? "?"} · index ${
    rag.index ?? "?"
  }`;
  return {
    label: "rag",
    tone: rag.ready ? "ok" : "warn",
    detail,
    jobs: rag.jobs,
    loading: false,
  };
}

// Tone → token treatment. Hue is REDUNDANT reinforcement only — the Lucide mark
// and the text carry the meaning first, so the card survives grayscale (both
// parent ADRs' non-color-only gate). Soft rounded low-contrast border + subtle
// elevation: structure felt, not seen (design-language ADR layer 4).
const TONE_CLASSES: Record<CardState["tone"], string> = {
  ok: "border-rule bg-paper-raised text-ink",
  warn: "border-state-stale/40 bg-paper-raised text-ink",
  down: "border-rule bg-paper text-ink-muted",
};

// Per-tone structural Lucide mark (chrome plane, iconography ADR). The git/core
// cards use a fixed structural mark; the rag card swaps in a lifecycle mark.
const TONE_MARK: Record<CardState["tone"], LucideIcon> = {
  ok: ShieldCheck,
  warn: AlertTriangle,
  down: CircleSlash,
};

const TONE_INK: Record<CardState["tone"], string> = {
  ok: "text-state-active",
  warn: "text-state-stale",
  down: "text-ink-faint",
};

// Fixed leading marks for the git/core cards (their identity, not their tone).
const LABEL_MARK: Record<string, LucideIcon> = {
  git: GitBranch,
  core: Database,
  rag: Eye,
};

// --- the strip ----------------------------------------------------------------------

interface RollupCardProps {
  card: CardState;
  /** A rag-specific tabular job count appended as a legible receipt. */
  jobs?: number;
  /** The rag card pulses a liveness mark while its snapshot is loading. */
  loading?: boolean;
}

function RollupCard({ card, jobs, loading }: RollupCardProps) {
  // The mark carries meaning first: the card's identity mark leads, the tone is
  // reinforced by a small trailing state mark + the token ink (never hue alone).
  const LeadMark = LABEL_MARK[card.label] ?? Database;
  const ToneMark = loading ? Loader2 : TONE_MARK[card.tone];
  return (
    <div
      className={`flex items-center justify-between gap-vs-2 rounded-vs-md border px-vs-2 py-vs-1 shadow-card transition-colors duration-ui-fast ease-settle ${
        TONE_CLASSES[card.tone]
      }`}
      data-rollup-card
      data-card={card.label}
      data-tone={card.tone}
    >
      <span className="flex min-w-0 items-center gap-vs-1-5">
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <LeadMark size={MARK_PX} />
        </span>
        <span className="font-medium text-ink">{card.label}</span>
      </span>
      <span className="flex min-w-0 items-center gap-vs-1-5 text-label">
        <span className="min-w-0 truncate text-ink-muted" title={card.detail}>
          {card.detail}
        </span>
        {jobs !== undefined && (
          // Job count is data-bearing → tabular numerals (typography law).
          <span
            className="shrink-0 rounded-vs-sm bg-paper-sunken px-vs-1 text-2xs text-ink-muted"
            data-tabular
            data-rag-jobs
          >
            {jobs} job{jobs === 1 ? "" : "s"}
          </span>
        )}
        <span className={`shrink-0 ${TONE_INK[card.tone]}`} aria-hidden>
          <ToneMark
            size={MARK_PX}
            className={loading ? "animate-pulse-live" : undefined}
          />
        </span>
      </span>
    </div>
  );
}

export function NowStrip() {
  const status = useEngineStatus();
  const rag = useRagStatus();
  // Backend/git transitions refresh the snapshot (stream is delta,
  // /status is recovery — contract §7).
  const stream = useEngineStream(["backends", "git"]);
  // Debounce the recovery refetch: a flapping backend bursts events; one
  // trailing /status invalidation, not one per event (P-HIGH-2).
  const invalidateStatus = useMemo(
    () =>
      debounce(() => {
        void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
      }, 150),
    [],
  );
  useEffect(() => () => invalidateStatus.cancel(), [invalidateStatus]);
  useEffect(() => {
    if ((stream.data?.length ?? 0) > 0) invalidateStatus();
  }, [stream.data?.length, invalidateStatus]);

  if (status.isError) {
    return (
      <p className="text-label text-state-broken" role="status">
        engine unreachable — start it with{" "}
        <code className="font-mono">vaultspec serve</code>
      </p>
    );
  }

  const ragView = ragCardView(rag);
  const cards: RollupCardProps[] = [
    { card: gitCard(status.data) },
    { card: coreCard(status.data) },
    { card: ragView, jobs: ragView.jobs, loading: ragView.loading },
  ];

  // A single polite live region announces the settled rag readiness/degraded
  // transition to assistive tech (rag-manager ADR a11y: "rag became
  // stopped/running"), so a non-sighted operator tracks the rollup without sight.
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

  return (
    <div className="space-y-vs-1 text-label" data-now-strip>
      <p className="sr-only" role="status" aria-live="polite">
        {ragLive}
      </p>
      {cards.map((c) => (
        <RollupCard
          key={c.card.label}
          card={c.card}
          jobs={c.jobs}
          loading={c.loading}
        />
      ))}
      {status.data && status.data.degradations.length > 0 && (
        <p className="flex items-start gap-vs-1-5 text-state-broken">
          <span className="mt-px shrink-0" aria-hidden>
            <AlertTriangle size={MARK_PX} />
          </span>
          <span>degraded: {status.data.degradations.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
