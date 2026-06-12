// The ops surface (W03.P10.S41, ADR G2.3/G4.b): the pillar-2 control
// surface, deliberately modest — buttons-with-confirmation over the
// whitelisted ops proxy verbs only (rag service lifecycle, reindex,
// watcher tuning; core vault check/stats — contract R1; anything else is
// a sibling filing, not whitelist growth). All verbs disable in
// time-travel mode: history is read-only.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { engineClient } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";

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

export function OpsPanel() {
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravel = timelineMode.kind === "time-travel";
  const [confirming, setConfirming] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: ({ target, verb }: { target: "core" | "rag"; verb: string }) =>
      target === "core" ? engineClient.opsCore(verb) : engineClient.opsRag(verb),
    onSuccess: (result, vars) => {
      setLastResult(`${vars.verb}: ${result.ok ? "ok" : "failed"}`);
      void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
    },
    onError: (err, vars) => {
      setLastResult(`${vars.verb}: ${err instanceof Error ? err.message : "failed"}`);
    },
    onSettled: () => setConfirming(null),
  });

  return (
    <div className="space-y-1 text-xs" data-ops-panel>
      <div className="font-medium text-stone-600">operations</div>
      {timeTravel && (
        <p className="text-amber-700">disabled while time travelling (G4.b)</p>
      )}
      <ul className="flex flex-wrap gap-1">
        {OPS_WHITELIST.map(({ target, verb, label }) => {
          const key = `${target}:${verb}`;
          const isConfirming = confirming === key;
          return (
            <li key={key}>
              <button
                type="button"
                disabled={timeTravel || run.isPending}
                onClick={() => {
                  if (isConfirming) run.mutate({ target, verb });
                  else setConfirming(key);
                }}
                className={`rounded border px-1.5 py-0.5 ${
                  timeTravel
                    ? "cursor-not-allowed border-stone-200 text-stone-300"
                    : isConfirming
                      ? "border-amber-500 bg-amber-50 text-amber-900"
                      : "border-stone-300 text-stone-700 hover:border-stone-500"
                }`}
              >
                {isConfirming ? `confirm ${label}?` : label}
              </button>
            </li>
          );
        })}
      </ul>
      {confirming && !timeTravel && (
        <button
          type="button"
          className="text-stone-400 underline"
          onClick={() => setConfirming(null)}
        >
          cancel
        </button>
      )}
      {lastResult && <p className="text-stone-500">{lastResult}</p>}
    </div>
  );
}
