// Node-scoped discover (W02.P06.S26, ADR G3.c): run semantic discovery on
// the selected node. Candidates arrive visually QUARANTINED — listed in
// this panel with score and a question mark, rendered on stage in the
// semantic haze treatment only while pinned — and they never join the
// persistent graph: pinning is session-only client state. Probabilistic
// suggestions must look like suggestions.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { engineClient } from "../../stores/server/engine";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";

export function Discover() {
  const selectedId = useViewStore((s) => s.selectedId);
  const pinned = useViewStore((s) => s.pinnedDiscoveries);
  const pin = useViewStore((s) => s.pinDiscovery);
  const unpin = useViewStore((s) => s.unpinDiscovery);
  const [openFor, setOpenFor] = useState<string | null>(null);

  const discovery = useQuery({
    queryKey: ["engine", "discover", openFor ?? ""],
    queryFn: () => engineClient.discover(openFor!),
    enabled: openFor !== null,
    retry: false,
  });

  if (!selectedId && openFor === null) return null;

  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 z-10 max-w-xs text-[11px]">
      {openFor === null ? (
        <button
          type="button"
          onClick={() => setOpenFor(selectedId)}
          className="rounded border border-violet-300 bg-white/90 px-2 py-1 text-violet-800 shadow-sm hover:border-violet-500"
        >
          ≈ discover related…
        </button>
      ) : (
        <div className="rounded-md border border-violet-200 bg-white/95 p-2 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-violet-900">
              discovery — {openFor.replace(/^(feature|doc):/, "")}
            </span>
            <button
              type="button"
              aria-label="Close discovery"
              onClick={() => setOpenFor(null)}
              className="text-ink-faint hover:text-ink"
            >
              ×
            </button>
          </div>
          {discovery.isPending && <p className="mt-1 text-ink-faint">asking rag…</p>}
          {discovery.isError && (
            <p className="mt-1 text-state-broken">
              semantic discovery offline — rag is not available
            </p>
          )}
          {discovery.data && discovery.data.candidates.length === 0 && (
            <p className="mt-1 text-ink-faint">no candidates above the floor</p>
          )}
          <ul className="mt-1 space-y-1">
            {discovery.data?.candidates.map((candidate) => {
              const isPinned = pinned.some((e) => e.id === candidate.id);
              return (
                <li key={candidate.id} className="flex items-center gap-2">
                  <span className="text-violet-400" title="quarantined suggestion">
                    ?≈
                  </span>
                  <button
                    type="button"
                    className="flex-1 truncate text-left hover:underline"
                    onClick={() => selectNode(candidate.dst)}
                    title={candidate.dst}
                  >
                    {candidate.dst.replace(/^(feature|doc):/, "")}
                  </button>
                  <span className="text-ink-faint">
                    {Math.round(candidate.confidence * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      isPinned ? unpinDiscoveryById(candidate.id) : pin(candidate)
                    }
                    className={
                      isPinned
                        ? "text-violet-800"
                        : "text-ink-faint hover:text-ink-muted"
                    }
                  >
                    {isPinned ? "pinned (session)" : "pin"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  function unpinDiscoveryById(id: string) {
    unpin(id);
  }
}
