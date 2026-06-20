// The now strip (W03.P10.S40; re-skinned W02.P15.S31 onto the OKLCH token layer
// and the sanctioned Lucide chrome marks per the rag-manager surface ADR): "what
// is happening / what just changed" — git status for the current worktree,
// vaultspec-core's in-flight status, and the rag service rollup, from the /status
// recovery snapshot refreshed by the backends and git SSE channels. Each backend's
// degraded state renders honestly: stopped, crashed, absent — designed states,
// not errors.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): the strip
// is a DUMB view. The rollup is read EXCLUSIVELY through the stores/view
// `useNowStripView` selector — it never inspects the raw `status.git`,
// `status.rag`, `status.core`, transport flags, or raw `tiers` block, and it
// fetches nothing itself. Status meaning is carried by a Lucide mark plus text
// FIRST, with a semantic state token as redundant reinforcement, so every card
// survives grayscale (rag-manager ADR / both parent ADRs' non-color-only gate).

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

import { type CardState, useNowStripView } from "../../stores/view/nowStrip";

// Chrome marks read one density step below body text so the structural chrome
// stays attenuated (design-language ADR layer 4 / iconography ADR 14px gate).
const MARK_PX = 13;

// Per-tone structural Lucide mark (chrome plane, iconography ADR). The git/core
// cards use a fixed structural mark; the rag card swaps in a lifecycle mark.
const TONE_MARK: Record<CardState["tone"], LucideIcon> = {
  ok: ShieldCheck,
  warn: AlertTriangle,
  down: CircleSlash,
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
  jobsLabel?: string;
  /** The rag card pulses a liveness mark while its snapshot is loading. */
  loading?: boolean;
}

function RollupCard({ card, jobsLabel, loading }: RollupCardProps) {
  // The mark carries meaning first: the card's identity mark leads, the tone is
  // reinforced by a small trailing state mark + the token ink (never hue alone).
  const LeadMark = LABEL_MARK[card.label] ?? Database;
  const ToneMark = loading ? Loader2 : TONE_MARK[card.tone];
  return (
    <div
      className={card.rootClassName}
      data-rollup-card
      data-card={card.label}
      data-tone={card.tone}
    >
      <span className={card.identityClassName}>
        <span className={card.leadMarkClassName} aria-hidden>
          <LeadMark size={MARK_PX} />
        </span>
        <span className={card.labelClassName}>{card.label}</span>
      </span>
      <span className={card.detailRootClassName}>
        <span className={card.detailClassName} title={card.detail}>
          {card.detail}
        </span>
        {jobsLabel !== undefined && (
          // Job count is data-bearing → tabular numerals (typography law).
          <span className={card.jobsClassName} data-tabular data-rag-jobs>
            {jobsLabel}
          </span>
        )}
        <span className={card.toneMarkClassName} aria-hidden>
          <ToneMark size={MARK_PX} className={card.loadingMarkClassName} />
        </span>
      </span>
    </div>
  );
}

export function NowStrip() {
  const view = useNowStripView();

  if (view.engineUnreachable) {
    return (
      <p className={view.engineUnreachableClassName} role="status">
        {view.engineUnreachableLabel}{" "}
        <code className={view.engineCommandClassName}>{view.engineCommandLabel}</code>
      </p>
    );
  }

  // A single polite live region announces the settled rag readiness/degraded
  // transition to assistive tech (rag-manager ADR a11y: "rag became
  // stopped/running"), so a non-sighted operator tracks the rollup without sight.
  return (
    <div className={view.rootClassName} data-now-strip>
      <p className={view.liveRegionClassName} role="status" aria-live="polite">
        {view.ragLive}
      </p>
      {view.cards.map((c) => (
        <RollupCard
          key={c.card.label}
          card={c.card}
          jobsLabel={c.jobsLabel}
          loading={c.loading}
        />
      ))}
      {view.degradationLabel && (
        <p className={view.degradationClassName}>
          <span className={view.degradationIconClassName} aria-hidden>
            <AlertTriangle size={MARK_PX} />
          </span>
          <span>{view.degradationLabel}</span>
        </p>
      )}
    </div>
  );
}
