// The ops surface (W03.P10.S41; re-skinned W02.P15.S31 onto the OKLCH token layer
// and the sanctioned Lucide chrome marks per the rag-manager surface ADR): the
// pillar-2 control surface, deliberately modest — arm-then-confirm buttons over
// the whitelisted ops proxy verbs only (rag service lifecycle, reindex, watcher
// tuning; core vault check/stats — contract R1; anything else is a sibling filing,
// not whitelist growth). All verbs disable in time-travel mode: history is
// read-only.
//
// Arm-to-confirm is managed by the platform confirm guard via `useConfirmable`
// per button (W03.P04.S08 consolidation): each button owns its own armed slot
// keyed on `ops:{target}:{verb}` — distinct types prevent cross-button firing.
// The mutation stays for loading state and cache invalidation; `cancel()` disarms
// the guard before the mutation fires so the terminal handler is never reached
// through the guard path.
//
// Layer ownership (dashboard-layer-ownership / engine-read-and-infer): every op
// flows through `dispatchOps` → the platform `appDispatcher` → the engine's
// `/ops/{target}/{verb}` proxy. No component issues a direct `fetch`, no rag
// semantics are reconstructed here, and the rag CLUSTER is contextual on the rag
// status read through the stores `useRagStatus` selector — never the raw `tiers`
// block. The result is a legible receipt: a rag-down 502 surfaces as the
// section-2 tier truth, distinguishing "the backend is down" from "your request
// was wrong" (rag-manager ADR / every-wire-response-carries-the-tiers-block).

import { useMutation } from "@tanstack/react-query";
import {
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Square,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { useConfirmable } from "../../platform/dispatch/useAction";
import {
  classifyOpsOutcome,
  engineKeys,
  useRagStatus,
} from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { dispatchOps } from "./opsActions";

type OpsTarget = "core" | "rag";

interface OpsVerb {
  target: OpsTarget;
  verb: string;
  label: string;
  /** The conventional Lucide chrome mark for the verb (iconography ADR). */
  mark: LucideIcon;
}

// Chrome marks read at the iconography ADR's 14px grayscale-by-shape gate.
const MARK_PX = 14;

/** The R1 whitelist, verbatim — never grown GUI-side. Marks are chrome-only. */
export const OPS_WHITELIST: OpsVerb[] = [
  { target: "core", verb: "vault-check", label: "vault check", mark: RefreshCw },
  { target: "core", verb: "vault-stats", label: "vault stats", mark: Settings2 },
  { target: "rag", verb: "service-start", label: "start rag", mark: Play },
  { target: "rag", verb: "service-stop", label: "stop rag", mark: Square },
  { target: "rag", verb: "reindex", label: "reindex", mark: RefreshCw },
  {
    target: "rag",
    verb: "watcher-reconfigure",
    label: "watcher tuning",
    mark: Settings2,
  },
];

// ---------------------------------------------------------------------------
// Per-button arm-to-confirm, wired to the platform confirm guard.
// ---------------------------------------------------------------------------

interface OpsButtonProps {
  op: OpsVerb;
  /** Calls run.mutate with the target+verb pair after the confirm arm fires. */
  onFire: (target: OpsTarget, verb: string) => void;
  disabled: boolean;
  /** This op's mutation is in flight — drives the purposeful liveness cue. */
  pending: boolean;
}

function OpsButton({ op, onFire, disabled, pending }: OpsButtonProps) {
  const { target, verb, label, mark: Mark } = op;
  // Each button has a unique action type so arms never cross-fire.
  const confirmable = useConfirmable<void>(`ops:${target}:${verb}`);

  const handleArm = () => {
    confirmable.trigger();
  };

  const handleFire = () => {
    // Disarm the guard slot before routing through the mutation so the
    // terminal dispatch (via dispatchOps / "ops:run") never sees a guard hit.
    confirmable.cancel();
    onFire(target, verb);
  };

  if (confirmable.armed) {
    // Armed: an accented "confirm?" affordance with an explicit cancel. The
    // confirm button auto-focuses so the two-step flow is completable by
    // keyboard (rag-manager ADR: "arm focuses the confirm affordance").
    return (
      <span className="flex items-center gap-vs-1">
        <button
          type="button"
          disabled={disabled}
          autoFocus
          onClick={handleFire}
          aria-label={`confirm ${label}`}
          className="inline-flex items-center gap-vs-1 rounded-vs-sm border border-accent bg-accent-subtle px-vs-1-5 py-vs-0-5 font-medium text-accent-text transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <span aria-hidden>
            <Mark size={MARK_PX} />
          </span>
          confirm?
        </button>
        <button
          type="button"
          onClick={confirmable.cancel}
          onKeyDown={(e) => {
            if (e.key === "Escape") confirmable.cancel();
          }}
          aria-label={`cancel ${label}`}
          className="rounded-vs-sm px-vs-1 text-2xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={pending || undefined}
      onClick={handleArm}
      className={`inline-flex items-center gap-vs-1 rounded-vs-sm border px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
        disabled
          ? "cursor-not-allowed border-rule text-ink-faint"
          : "border-rule text-ink hover:border-rule-strong hover:bg-paper-sunken"
      }`}
    >
      <span aria-hidden>
        {/* The Codex thinking-state liveness cue, tied to THIS op's real pending
            mutation; goes static under prefers-reduced-motion (app-wide floor). */}
        {pending ? (
          <Loader2 size={MARK_PX} className="animate-pulse-live" />
        ) : (
          <Mark size={MARK_PX} />
        )}
      </span>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface OpsReceipt {
  verb: string;
  tone: "ok" | "failed" | "down";
  text: string;
}

export function OpsPanel() {
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravel = timelineMode.kind === "time-travel";
  const rag = useRagStatus();
  const [receipt, setReceipt] = useState<OpsReceipt | null>(null);

  const run = useMutation({
    // The intent flows through the platform dispatch seam (logged + traced +
    // guardable centrally), not an ad-hoc client call (B-1 / platform D2).
    mutationFn: ({ target, verb }: { target: OpsTarget; verb: string }) =>
      dispatchOps({ target, verb }),
    onSuccess: (result, vars) => {
      // The stores layer classifies the outcome (ok / failed) so the receipt
      // copy is interpreted truth, not a raw envelope read.
      const outcome = classifyOpsOutcome({ ok: result.ok });
      setReceipt({
        verb: vars.verb,
        tone: outcome === "ok" ? "ok" : "failed",
        text: outcome === "ok" ? "ok" : "failed",
      });
      void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
    },
    onError: (err, vars) => {
      // The stores layer decides whether this is the backend reporting itself
      // down (a rag-down 502 carries the section-2 tiers block) or a plain
      // failure — the chrome never inspects the raw `tiers` block itself
      // (dashboard-layer-ownership / every-wire-response-carries-the-tiers-block).
      const outcome = classifyOpsOutcome({ ok: false, error: err });
      const down = outcome === "backend-down";
      setReceipt({
        verb: vars.verb,
        tone: down ? "down" : "failed",
        text: down
          ? "rag is down — start it first"
          : err instanceof Error
            ? err.message
            : "failed",
      });
    },
  });

  // The rag cluster is contextual (rag-manager ADR): start rag is offered when
  // rag is stopped/absent; stop/reindex/watcher tuning when rag is running.
  // Derived from the interpreted rag view, NEVER the raw status — and only once
  // the status snapshot has settled so we don't flap the cluster while loading.
  const ragKnown = !rag.loading && !rag.errored;
  const ragRunning = ragKnown && rag.running && !rag.degraded;
  function ragVerbVisible(verb: string): boolean {
    if (!ragKnown) return true; // unknown → show the full cluster, all disabled-capable
    return verb === "service-start" ? !ragRunning : ragRunning;
  }

  const verbs = OPS_WHITELIST.filter((op) =>
    op.target === "rag" ? ragVerbVisible(op.verb) : true,
  );

  const receiptTone: Record<OpsReceipt["tone"], string> = {
    ok: "text-state-active",
    failed: "text-state-broken",
    down: "text-state-stale",
  };

  return (
    <div className="space-y-vs-1-5 text-body" data-ops-panel>
      <div className="flex items-center gap-vs-1-5 font-medium text-ink-muted">
        <span aria-hidden>
          <Settings2 size={MARK_PX} />
        </span>
        operations
      </div>

      {/* A single polite live region announces the op flow (armed handled by the
          button label swap; firing, result, and the contextual rag transition)
          to assistive tech (rag-manager ADR a11y). */}
      <p className="sr-only" role="status" aria-live="polite">
        {run.isPending
          ? "operation running"
          : receipt
            ? `${receipt.verb} ${receipt.text}`
            : ""}
      </p>

      {/* Time-travel: a designed, EXPLAINED disabled state, not an error
          (rag-manager ADR: "history is read-only"). */}
      {timeTravel && (
        <p
          className="flex items-start gap-vs-1-5 text-label text-state-stale"
          role="status"
        >
          <span className="mt-px shrink-0" aria-hidden>
            <Square size={MARK_PX - 1} />
          </span>
          <span>disabled while time travelling — history is read-only (G4.b)</span>
        </p>
      )}

      <ul className="flex flex-wrap gap-vs-1" aria-label="operations">
        {verbs.map((op) => (
          <li key={`${op.target}:${op.verb}`}>
            <OpsButton
              op={op}
              onFire={(t, v) => run.mutate({ target: t, verb: v })}
              disabled={timeTravel || run.isPending}
              pending={
                run.isPending &&
                run.variables?.target === op.target &&
                run.variables?.verb === op.verb
              }
            />
          </li>
        ))}
      </ul>

      {/* The legible receipt: a transient ok / failed / rag-down line derived
          verbatim from the sibling outcome, carried by text + token ink (not hue
          alone). */}
      {receipt && (
        <p
          className={`flex items-center gap-vs-1 text-label ${receiptTone[receipt.tone]}`}
          data-testid="ops-receipt"
          data-ops-receipt
          data-ops-tone={receipt.tone}
        >
          <span className="font-medium">{receipt.verb}</span>
          <span className="text-ink-muted">·</span>
          <span>{receipt.text}</span>
        </p>
      )}
    </div>
  );
}
