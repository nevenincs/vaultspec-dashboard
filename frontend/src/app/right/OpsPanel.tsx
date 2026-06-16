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
  Activity,
  Cpu,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { useConfirmable } from "../../platform/dispatch/useAction";
import { readTierAvailability } from "../../stores/server/engine";
import {
  classifyOpsOutcome,
  engineKeys,
  useRagStatus,
} from "../../stores/server/queries";
import {
  useRagProjectEvict,
  useRagProjects,
  useRagReadiness,
  useRagReindexWithProgress,
  useRagServiceState,
  useRagWatcher,
  useRagWatcherReconfigure,
} from "../../stores/server/ragControl";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
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
      <span className="flex items-center gap-fg-1">
        <button
          type="button"
          disabled={disabled}
          autoFocus
          onClick={handleFire}
          aria-label={`confirm ${label}`}
          className="inline-flex items-center gap-fg-1 rounded-fg-xs border border-accent bg-accent-subtle px-fg-1-5 py-fg-0-5 font-medium text-accent-text transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
          className="rounded-fg-xs px-fg-1 text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
      className={`inline-flex items-center gap-fg-1 rounded-fg-xs border px-fg-1-5 py-fg-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
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
      // The stores layer classifies the outcome (ok / backend-down / failed) so
      // the receipt copy is interpreted truth, not a raw envelope read. Reaching
      // onSuccess means the dispatch RESOLVED (the transport did not throw), so
      // the op is `ok` UNLESS the brokered envelope's tiers report the backend
      // down — a rag control verb degrades to a 200 + semantic-unavailable tiers
      // rather than a 502 (rag-control-plane ADR D2), and `classifyOpsOutcome`
      // reads that truth from the block (never a raw read here).
      const outcome = classifyOpsOutcome({ ok: true, tiers: result.tiers });
      const down = outcome === "backend-down";
      setReceipt({
        verb: vars.verb,
        tone: outcome === "ok" ? "ok" : down ? "down" : "failed",
        text:
          outcome === "ok" ? "ok" : down ? "rag is down — start it first" : "failed",
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
    <div className="space-y-fg-1-5 text-body" data-ops-panel>
      <div className="flex items-center gap-fg-1-5 font-medium text-ink-muted">
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
          className="flex items-start gap-fg-1-5 text-label text-state-stale"
          role="status"
        >
          <span className="mt-px shrink-0" aria-hidden>
            <Square size={MARK_PX - 1} />
          </span>
          <span>disabled while time travelling — history is read-only (G4.b)</span>
        </p>
      )}

      <ul className="flex flex-wrap gap-fg-1" aria-label="operations">
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
          className={`flex items-center gap-fg-1 text-label ${receiptTone[receipt.tone]}`}
          data-testid="ops-receipt"
          data-ops-receipt
          data-ops-tone={receipt.tone}
        >
          <span className="font-medium">{receipt.verb}</span>
          <span className="text-ink-muted">·</span>
          <span>{receipt.text}</span>
        </p>
      )}

      {/* The brokered rag control plane (rag-control-plane ADR D6): the semantic
          index health readout, the reindex trigger with live job progress, the
          watcher configuration, and the resident-project management — all read
          and driven through the stores `ragControl` hooks (never a direct fetch),
          degrading to the designed held state when the semantic tier is down. */}
      <RagControlSection timeTravel={timeTravel} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The rag semantic-index control plane (rag-control-plane ADR D6 / P05)
// ---------------------------------------------------------------------------

const SECTION_MARK_PX = 13;

/** A small section header in the ops idiom (token ink + a Lucide chrome mark). */
function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-fg-1 text-label font-medium text-ink-muted">
      <span aria-hidden>
        <Icon size={SECTION_MARK_PX} />
      </span>
      {children}
    </div>
  );
}

function RagControlSection({ timeTravel }: { timeTravel: boolean }) {
  const scope = useActiveScope();
  const serviceState = useRagServiceState(scope);
  const readiness = useRagReadiness(scope);
  const watcher = useRagWatcher(scope);
  const projects = useRagProjects(scope);
  const reindex = useRagReindexWithProgress();
  const reconfigure = useRagWatcherReconfigure();
  const evict = useRagProjectEvict();

  // Degradation is read from the served tiers block, never guessed (degradation-
  // is-read-from-tiers). When the semantic tier is unavailable the whole section
  // renders the designed held state rather than empty/erroring controls.
  const semanticOffline =
    serviceState.data !== undefined &&
    readTierAvailability(serviceState.data.tiers, ["semantic"]).degraded;
  const disabled = timeTravel || semanticOffline;

  const index = serviceState.data?.envelope?.index;
  const watch = watcher.data?.envelope;
  const ready = readiness.data?.envelope as { ready?: boolean } | null | undefined;
  const slots = projects.data?.envelope?.projects ?? [];

  return (
    <section className="space-y-fg-1-5 border-t border-rule pt-fg-1-5" data-rag-control>
      <SectionLabel icon={Database}>semantic index</SectionLabel>

      {semanticOffline ? (
        // The held state (ADR D5): rag is down, the engine does not auto-start it,
        // so the surface invites the operator to start rag rather than erroring.
        <p
          className="flex items-start gap-fg-1-5 text-label text-state-stale"
          role="status"
          data-testid="rag-offline"
        >
          <span className="mt-px shrink-0" aria-hidden>
            <Square size={MARK_PX - 1} />
          </span>
          <span>semantic engine offline — start rag to build and serve the index</span>
        </p>
      ) : (
        <>
          {/* Service / GPU / index health readout. */}
          <dl
            className="grid grid-cols-2 gap-x-fg-2 gap-y-fg-0-5 text-label"
            data-testid="rag-health"
          >
            <dt className="flex items-center gap-fg-1 text-ink-faint">
              <span aria-hidden>
                <Cpu size={SECTION_MARK_PX} />
              </span>
              gpu
            </dt>
            <dd className="text-ink" data-testid="rag-gpu">
              {index?.cuda ? (index.gpu_name ?? "cuda") : "cpu"}
            </dd>
            <dt className="text-ink-faint">vault docs</dt>
            <dd className="text-ink" data-testid="rag-vault-count">
              {index?.vault_count ?? "—"}
            </dd>
            <dt className="text-ink-faint">models</dt>
            <dd className="text-ink" data-testid="rag-readiness">
              {ready?.ready === true
                ? "loaded"
                : ready?.ready === false
                  ? "loading"
                  : "—"}
            </dd>
          </dl>

          {/* Reindex trigger + live job progress (trigger-then-poll, ADR D3). */}
          <div className="space-y-fg-0-5" data-testid="rag-reindex">
            <button
              type="button"
              disabled={disabled || reindex.pending || reindex.progress.polling}
              aria-busy={reindex.pending || reindex.progress.polling || undefined}
              onClick={() => reindex.trigger({ type: "vault" })}
              className={`inline-flex items-center gap-fg-1 rounded-fg-xs border px-fg-1-5 py-fg-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                disabled
                  ? "cursor-not-allowed border-rule text-ink-faint"
                  : "border-rule text-ink hover:border-rule-strong hover:bg-paper-sunken"
              }`}
            >
              <span aria-hidden>
                {reindex.pending || reindex.progress.polling ? (
                  <Loader2 size={MARK_PX} className="animate-pulse-live" />
                ) : (
                  <RefreshCw size={MARK_PX} />
                )}
              </span>
              reindex vault
            </button>
            {reindex.jobId && (
              <div
                className="space-y-fg-0-5"
                role="status"
                aria-live="polite"
                data-testid="rag-progress"
              >
                <div className="flex items-center justify-between text-caption text-ink-muted">
                  <span className="flex items-center gap-fg-1">
                    <span aria-hidden>
                      <Activity size={SECTION_MARK_PX} />
                    </span>
                    {reindex.progress.terminal
                      ? reindex.progress.failed
                        ? "reindex failed"
                        : "reindex complete"
                      : (reindex.progress.step ?? reindex.progress.phase ?? "queued")}
                  </span>
                  {reindex.progress.fraction !== undefined && (
                    <span data-testid="rag-progress-pct">
                      {Math.round(reindex.progress.fraction * 100)}%
                    </span>
                  )}
                </div>
                {/* A bounded progress track: a determinate width when rag reports
                    a fraction, an indeterminate pulse otherwise. */}
                <div className="h-1 overflow-hidden rounded-fg-xs bg-paper-sunken">
                  <div
                    className={`h-full bg-accent transition-all duration-ui-fast ${
                      reindex.progress.fraction === undefined &&
                      !reindex.progress.terminal
                        ? "w-1/3 animate-pulse-live"
                        : ""
                    }`}
                    style={
                      reindex.progress.fraction !== undefined
                        ? { width: `${Math.round(reindex.progress.fraction * 100)}%` }
                        : reindex.progress.terminal
                          ? { width: "100%" }
                          : undefined
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Watcher configuration (debounce / cooldown / enabled). */}
          {watch && (
            <WatcherConfig
              watch={watch}
              disabled={disabled}
              pending={reconfigure.isPending}
              onApply={(args) => reconfigure.mutate(args)}
            />
          )}

          {/* Resident projects + evict. */}
          {slots.length > 0 && (
            <div className="space-y-fg-0-5" data-testid="rag-projects">
              <SectionLabel icon={Database}>resident projects</SectionLabel>
              <ul className="space-y-fg-0-5">
                {slots.map((slot) => (
                  <li
                    key={slot.root}
                    className="flex items-center justify-between gap-fg-1 text-caption"
                  >
                    <span className="truncate text-ink-muted" title={slot.root}>
                      {slot.root}
                    </span>
                    <button
                      type="button"
                      disabled={disabled || evict.isPending}
                      onClick={() => evict.mutate(slot.root)}
                      aria-label={`evict ${slot.root}`}
                      className="shrink-0 rounded-fg-xs p-fg-0-5 text-ink-faint hover:text-state-broken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed"
                    >
                      <span aria-hidden>
                        <Trash2 size={SECTION_MARK_PX} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface WatcherConfigProps {
  watch: { watch_enabled: boolean; debounce_ms: number; cooldown_s: number };
  disabled: boolean;
  pending: boolean;
  onApply: (args: { debounce_ms?: number; cooldown_s?: number }) => void;
}

function WatcherConfig({ watch, disabled, pending, onApply }: WatcherConfigProps) {
  const [debounce, setDebounce] = useState(String(watch.debounce_ms));
  const [cooldown, setCooldown] = useState(String(watch.cooldown_s));

  const fieldClass =
    "w-16 rounded-fg-xs border border-rule bg-paper px-fg-1 py-fg-0-5 text-caption text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint";

  return (
    <div className="space-y-fg-0-5" data-testid="rag-watcher">
      <SectionLabel icon={Settings2}>watcher</SectionLabel>
      <div className="flex flex-wrap items-center gap-fg-1-5 text-caption text-ink-muted">
        <label className="flex items-center gap-fg-1">
          debounce ms
          <input
            type="number"
            min={0}
            value={debounce}
            disabled={disabled}
            onChange={(e) => setDebounce(e.target.value)}
            className={fieldClass}
            data-testid="rag-watcher-debounce"
          />
        </label>
        <label className="flex items-center gap-fg-1">
          cooldown s
          <input
            type="number"
            min={0}
            value={cooldown}
            disabled={disabled}
            onChange={(e) => setCooldown(e.target.value)}
            className={fieldClass}
            data-testid="rag-watcher-cooldown"
          />
        </label>
        <button
          type="button"
          disabled={disabled || pending}
          aria-busy={pending || undefined}
          onClick={() =>
            onApply({
              debounce_ms: Number(debounce),
              cooldown_s: Number(cooldown),
            })
          }
          className="inline-flex items-center gap-fg-1 rounded-fg-xs border border-rule px-fg-1-5 py-fg-0-5 text-ink hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          {pending ? <Loader2 size={MARK_PX} className="animate-pulse-live" /> : null}
          apply
        </button>
      </div>
    </div>
  );
}
