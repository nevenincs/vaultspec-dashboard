// Node-scoped discover (canvas-controls ADR): run semantic discovery on the
// selected node. Candidates arrive visually QUARANTINED — listed in this panel
// with a confidence score and a question-mark-qualified semantic domain mark,
// rendered on stage in the semantic-haze treatment only while pinned — and they
// never join the persistent graph: pinning is session-only client state.
// Probabilistic suggestions must look like suggestions.
//
// Palette: the ad-hoc violet/white skin is replaced by the semantic-tier token
// (the species color, via the shared semantic TierMark) and the muted-accent
// system, so candidates read as the semantic species in any theme.
//
// Layer ownership (dashboard-layer-ownership): the panel is a dumb view and does
// NOT fetch — the discovery wire read lives behind the stores `useDiscover` hook
// (stores is the sole wire client). The panel consumes the interpreted view and
// emits pin/unpin/select intent; it never calls `engineClient` and never reads
// the raw `tiers` block.

import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { TierMark } from "../../scene/field/markComponents";
import { useDiscover } from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";

export function Discover() {
  const selectedId = useViewStore((s) => s.selectedId);
  const pinned = useViewStore((s) => s.pinnedDiscoveries);
  const pin = useViewStore((s) => s.pinDiscovery);
  const unpin = useViewStore((s) => s.unpinDiscovery);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The wire read lives in the stores layer; the panel consumes the interpreted
  // loading / offline / candidates view (never the raw tiers block).
  const discovery = useDiscover(openFor);

  // Close on Escape — this is a non-modal role="dialog" surface, consistent with
  // the filter sidebar and layout panel.
  useEffect(() => {
    if (openFor === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFor]);

  // Focus the panel on open so keyboard users land inside it.
  useEffect(() => {
    if (openFor !== null) panelRef.current?.focus();
  }, [openFor]);

  if (!selectedId && openFor === null) return null;

  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 z-10 max-w-xs text-label">
      {openFor === null ? (
        <button
          type="button"
          onClick={() => setOpenFor(selectedId)}
          className="flex items-center gap-vs-1 rounded-vs-sm border border-tier-semantic/50 bg-paper-raised/90 px-vs-2 py-vs-1 text-accent-text shadow-card transition-colors duration-ui-fast ease-settle hover:border-tier-semantic focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <TierMark tier="semantic" size={14} title="semantic" />
          discover related…
        </button>
      ) : (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="semantic discovery"
          aria-modal={false}
          tabIndex={-1}
          className="rounded-vs-md border border-tier-semantic/40 bg-paper-raised/95 p-vs-2 shadow-float backdrop-blur-sm focus:outline-none animate-slide-in-up"
          data-discover-panel
        >
          <div className="flex items-center justify-between gap-vs-2">
            <span className="flex items-center gap-vs-1 font-medium text-ink">
              <TierMark tier="semantic" size={14} title="semantic discovery" />
              discovery — {openFor.replace(/^(feature|doc):/, "")}
            </span>
            <button
              type="button"
              aria-label="close discovery"
              onClick={() => setOpenFor(null)}
              className="flex items-center rounded-vs-sm text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
          {discovery.loading && (
            // The liveness cue is tied to the real in-progress request.
            <p className="mt-vs-1 text-ink-faint" aria-busy>
              <span className="animate-pulse-live">asking rag…</span>
            </p>
          )}
          {discovery.offline && (
            // Designed degraded state (rag absent): discover-offline, never an
            // anonymous error.
            <p className="mt-vs-1 text-state-stale" data-discover-offline>
              semantic discovery offline — rag is not available
            </p>
          )}
          {!discovery.loading &&
            !discovery.offline &&
            discovery.candidates.length === 0 && (
              <p className="mt-vs-1 text-ink-faint">no candidates above the floor</p>
            )}
          <ul className="mt-vs-1 space-y-vs-1" role="list">
            {discovery.candidates.map((candidate) => {
              const isPinned = pinned.some((e) => e.id === candidate.id);
              return (
                <li key={candidate.id} className="flex items-center gap-vs-2">
                  {/* Question-mark-qualified semantic mark: a quarantined
                      suggestion, distinct from an asserted edge. */}
                  <span
                    className="flex items-center text-tier-semantic"
                    title="quarantined suggestion"
                  >
                    <HelpCircle size={11} aria-hidden />
                    <TierMark tier="semantic" size={14} title="semantic suggestion" />
                  </span>
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-ink-muted hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                    onClick={() => selectNode(candidate.dst)}
                    title={candidate.dst}
                  >
                    {candidate.dst.replace(/^(feature|doc):/, "")}
                  </button>
                  <span data-tabular className="tabular-nums text-ink-faint">
                    {Math.round(candidate.confidence * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-pressed={isPinned}
                    onClick={() =>
                      isPinned ? unpinDiscoveryById(candidate.id) : pin(candidate)
                    }
                    className={`rounded-vs-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                      isPinned
                        ? "text-accent-text"
                        : "text-ink-faint hover:text-ink-muted"
                    }`}
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
