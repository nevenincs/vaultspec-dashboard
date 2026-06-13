// The ops surface (W03.P10.S41, ADR G2.3/G4.b): the pillar-2 control
// surface, deliberately modest — buttons-with-confirmation over the
// whitelisted ops proxy verbs only (rag service lifecycle, reindex,
// watcher tuning; core vault check/stats — contract R1; anything else is
// a sibling filing, not whitelist growth). All verbs disable in
// time-travel mode: history is read-only.
//
// Arm-to-confirm is now managed by the platform confirm guard via
// `useConfirmable` per button (W03.P04.S08 consolidation), replacing the
// bespoke local `confirming` state. Each button owns its own armed slot
// keyed on `ops:{target}:{verb}` — distinct types prevent cross-button
// firing. The mutation stays for loading state and cache invalidation;
// `cancel()` disarms the guard before the mutation fires so the terminal
// handler is never reached through the guard path.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useConfirmable } from "../../platform/dispatch/useAction";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { dispatchOps } from "./opsActions";

/** The R1 whitelist, verbatim — never grown GUI-side. */
export const OPS_WHITELIST: { target: "core" | "rag"; verb: string; label: string }[] =
  [
    { target: "core", verb: "vault-check", label: "vault check" },
    { target: "core", verb: "vault-stats", label: "vault stats" },
    { target: "rag", verb: "service-start", label: "start rag" },
    { target: "rag", verb: "service-stop", label: "stop rag" },
    { target: "rag", verb: "reindex", label: "reindex" },
    { target: "rag", verb: "watcher-reconfigure", label: "watcher tuning" },
  ];

// ---------------------------------------------------------------------------
// Per-button arm-to-confirm, wired to the platform confirm guard.
// ---------------------------------------------------------------------------

interface OpsButtonProps {
  target: "core" | "rag";
  verb: string;
  label: string;
  /** Calls run.mutate with the target+verb pair after the confirm arm fires. */
  onFire: (target: "core" | "rag", verb: string) => void;
  disabled: boolean;
}

function OpsButton({ target, verb, label, onFire, disabled }: OpsButtonProps) {
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
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={handleFire}
          className="rounded-vs-sm border border-state-stale bg-paper-sunken px-vs-1-5 py-vs-0-5 text-state-stale transition-colors duration-ui-fast ease-settle"
        >
          confirm {label}?
        </button>
        <button
          type="button"
          onClick={confirmable.cancel}
          className="text-2xs text-ink-faint underline hover:text-ink-muted"
        >
          cancel
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleArm}
      className={`rounded-vs-sm border px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle ${
        disabled
          ? "cursor-not-allowed border-rule text-ink-faint"
          : "border-rule text-ink hover:border-rule-strong"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function OpsPanel() {
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravel = timelineMode.kind === "time-travel";
  const [lastResult, setLastResult] = useState<string | null>(null);

  const run = useMutation({
    // The intent flows through the platform dispatch seam (logged + traced +
    // guardable centrally), not an ad-hoc client call (B-1 / platform D2).
    mutationFn: ({ target, verb }: { target: "core" | "rag"; verb: string }) =>
      dispatchOps({ target, verb }),
    onSuccess: (result, vars) => {
      setLastResult(`${vars.verb}: ${result.ok ? "ok" : "failed"}`);
      void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
    },
    onError: (err, vars) => {
      setLastResult(`${vars.verb}: ${err instanceof Error ? err.message : "failed"}`);
    },
  });

  return (
    <div className="space-y-vs-1 text-body" data-ops-panel>
      <div className="font-medium text-ink-muted">operations</div>
      {timeTravel && (
        <p className="text-state-stale">disabled while time travelling (G4.b)</p>
      )}
      <ul className="flex flex-wrap gap-vs-1">
        {OPS_WHITELIST.map(({ target, verb, label }) => (
          <li key={`${target}:${verb}`} className="flex items-center gap-vs-1">
            <OpsButton
              target={target}
              verb={verb}
              label={label}
              onFire={(t, v) => run.mutate({ target: t, verb: v })}
              disabled={timeTravel || run.isPending}
            />
          </li>
        ))}
      </ul>
      {lastResult && <p className="text-ink-muted">{lastResult}</p>}
    </div>
  );
}
