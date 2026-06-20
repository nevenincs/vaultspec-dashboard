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
//
// W02.P06 (figma-parity-reconciliation): rebuilt faithfully to the binding Figma
// Discover frame (17:778) on the canonical Figma radius/elevation scales
// (rounded-fg-*, shadow-fg-*) in place of the legacy alias shims. The
// discover-offline state stays read from the stores-derived discovery view (the
// tiers truth), never guessed from a transport error.

import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { TierMark } from "../../scene/field/markComponents";
import { useDiscover } from "../../stores/server/queries";
import {
  closeDiscoveryPanel,
  openDiscoveryPanel,
  pinDiscoveryCandidate,
  useDiscoveryCandidateSelection,
  useDiscoveryCandidateRows,
  useDiscoveryPanelOpenView,
  unpinDiscoveryCandidate,
} from "../../stores/view/discoveries";

interface DiscoverProps {
  selectedId?: string | null;
  scope?: string | null;
}

export function Discover({
  selectedId: canonicalSelectedId,
  scope = null,
}: DiscoverProps = {}) {
  const selectedId = canonicalSelectedId ?? null;
  const selectCandidate = useDiscoveryCandidateSelection(scope);
  const openView = useDiscoveryPanelOpenView();
  const openFor = openView?.id ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  // The wire read lives in the stores layer; the panel consumes the interpreted
  // loading / offline / candidates view (never the raw tiers block).
  const discovery = useDiscover(openFor, scope);
  const candidateRows = useDiscoveryCandidateRows(discovery.candidates);

  // Close on Escape — this is a non-modal role="dialog" surface, consistent with
  // the filter sidebar and layout panel.
  useDismissOnEscape(closeDiscoveryPanel, { enabled: openFor !== null });

  // Focus the panel on open so keyboard users land inside it.
  useEffect(() => {
    if (openFor !== null) panelRef.current?.focus();
  }, [openFor]);

  // Discovery is scoped to the canonical selected node. If selection moves while
  // the panel is open, follow it rather than querying/displaying a stale node.
  useEffect(() => {
    if (openFor === null) return;
    if (!selectedId || !scope) {
      closeDiscoveryPanel();
      return;
    }
    if (openFor !== selectedId) openDiscoveryPanel(selectedId);
  }, [openFor, selectedId, scope]);

  if (!selectedId && openFor === null) return null;

  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 z-10 max-w-xs text-label">
      {openFor === null ? (
        <button
          type="button"
          onClick={() => {
            if (selectedId) openDiscoveryPanel(selectedId);
          }}
          className="flex items-center gap-fg-1 rounded-fg-xs border border-tier-semantic/50 bg-paper-raised/90 px-fg-2 py-fg-1 text-accent-text shadow-fg-raised transition-colors duration-ui-fast ease-settle hover:border-tier-semantic focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
          className="rounded-fg-md border border-tier-semantic/40 bg-paper-raised/95 p-fg-2 shadow-fg-overlay backdrop-blur-sm focus:outline-none animate-slide-in-up"
          data-discover-panel
        >
          <div className="flex items-center justify-between gap-fg-2">
            <span className="flex items-center gap-fg-1 font-medium text-ink">
              <TierMark tier="semantic" size={14} title="semantic discovery" />
              discovery — {openView?.label ?? ""}
            </span>
            <button
              type="button"
              aria-label="close discovery"
              onClick={closeDiscoveryPanel}
              className="flex items-center rounded-fg-xs text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
          {discovery.loading && (
            // The liveness cue is tied to the real in-progress request.
            <p className="mt-fg-1 text-ink-faint" aria-busy>
              <span className="animate-pulse-live">asking rag…</span>
            </p>
          )}
          {discovery.offline && (
            // Designed degraded state (rag absent): discover-offline, never an
            // anonymous error.
            <p className="mt-fg-1 text-state-stale" data-discover-offline>
              semantic discovery offline — rag is not available
            </p>
          )}
          {!discovery.loading &&
            !discovery.offline &&
            discovery.candidates.length === 0 && (
              <p className="mt-fg-1 text-ink-faint">no candidates above the floor</p>
            )}
          <ul className="mt-fg-1 space-y-fg-1" role="list">
            {candidateRows.map((row) => {
              const { candidate } = row;
              return (
                <li key={candidate.id} className="flex items-center gap-fg-2">
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
                    onClick={() => selectCandidate(candidate.dst)}
                    title={candidate.dst}
                  >
                    {row.targetLabel}
                  </button>
                  <span data-tabular className="tabular-nums text-ink-faint">
                    {row.confidenceLabel}
                  </span>
                  <button
                    type="button"
                    aria-pressed={row.pinned}
                    onClick={() =>
                      row.pinned
                        ? unpinDiscoveryCandidate(candidate.id)
                        : pinDiscoveryCandidate(candidate)
                    }
                    className={`rounded-fg-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                      row.pinned
                        ? "text-accent-text"
                        : "text-ink-faint hover:text-ink-muted"
                    }`}
                  >
                    {row.pinned ? "pinned (session)" : "pin"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
