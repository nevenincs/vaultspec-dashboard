// The search tab (figma-parity-reconciliation W02.P05.S31; binding SearchField
// Kit primitive, Figma node 136:30): a rag-backed query over the vault and code
// corpora whose results click through into the graph stage and the right-rail
// inspector. The engine's node-id annotation (contract §8) is what makes results
// click through to the stage. Rebuilt onto the NEW Figma role-named token
// foundation: canonical radius (`rounded-fg-xs`, `rounded-fg-pill`) for the
// search field, target chips, and result rows, and the `caption` type role for
// the dense receipts. No legacy radius or px-purpose type scale.
//
// The panel is a DUMB view (dashboard-layer-ownership / views-are-projections):
// it consumes the query text + target from `stores/view/searchIntent`, then consumes
// the rag controller exclusively through the `useSearchController` stores selector
// (the sole wire client for search — the fallback, the debounce/cancel, the
// node-id derivation, and the tiers-gated degradation all live there now, pulled
// back out of this chrome layer per the rag-search ADR), reads degradation only
// through that selector's interpreted `semanticOffline` (never the raw `tiers`
// block), and emits selection intent through the scoped dashboard-selection seam -
// it fetches nothing and navigates nothing itself. Each result is a projection
// over the one model addressed by its stable node id; activating it selects that
// node, which the stage and inspector reflect.
//
// The full state machine the ADR names is realized here: idle, loading,
// results, no-results, degraded (semantic search offline, a designed state via
// the tiers seam — never an error), and a genuine transport error with retry.

import { Search } from "lucide-react";
import {
  Code,
  FileText,
  FileDashed,
  GitCommit,
  type Icon,
} from "@phosphor-icons/react";

import {
  deriveSearchPresentationView,
  type SearchResultRowView,
  useSearchController,
} from "../../stores/server/searchController";
import { openContextMenu } from "../../stores/view/contextMenu";
import {
  deriveSearchTargetRows,
  setSearchIntentQuery,
  setSearchIntentTarget,
  useSearchIntentQuery,
  useSearchIntentTarget,
} from "../../stores/view/searchIntent";
import { useDashboardNodeSelection } from "../../stores/view/selection";
import { useActiveScope } from "../../stores/server/queries";
// Centralized kit Badge (design-system-is-centralized) for the text-match
// fallback marker — the shared pill definition, not a per-surface chip.
import { Badge, Segment, SearchField, SegmentedToggle } from "../kit";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import { moveRovingFocus } from "../chrome/rovingFocus";

// Self-register the search-result resolver at module load so the context-menu
// host can resolve a result's menu the moment a row publishes its entity.
import "./menus/searchResultMenu";

// Icon sizing — the iconography ADR's grayscale-by-shape gate is 14px; the
// leading chrome adornment reads one density step smaller so the structural
// chrome stays attenuated relative to the expressive doc-type species marks.
const SPECIES_PX = 14;
const CHROME_PX = 13;

// Result species marks (search ADR / iconography ADR): SearchTab only maps the
// controller-derived species to the icon family. Stable-id prefix interpretation
// stays in `searchController`.
function speciesMark(species: SearchResultRowView["species"]): Icon {
  if (species === "commit") return GitCommit;
  if (species === "code") return Code;
  if (species === "doc") return FileText;
  return FileDashed;
}

// Roving-tabindex focus order, derived from the DOM at EVENT time (the in-repo
// pattern from `NavToolbar.rovingButtons`): read the enclosing list's result
// buttons at the moment an arrow key fires rather than tracking a render-phase
// ref array, so memoization, reorder, or a partial unmount can never desync the
// focus order from what is actually painted.
const ROVING_ATTR = "data-search-result";

function moveRowFocus(from: HTMLButtonElement, delta: number): void {
  moveRovingFocus(from, delta, {
    container: "ul",
    // Non-clickable (null-node_id) rows are `disabled` and unfocusable, so they
    // drop out of the roving set rather than stalling on a dead row.
    items: `button[${ROVING_ATTR}]:not(:disabled)`,
  });
}

interface ResultRowProps {
  row: SearchResultRowView;
  /** Roving-tabindex: only the active row is in tab order. */
  tabbable: boolean;
  onActivate: (id: string) => void;
}

function ResultRow({ row, tabbable, onActivate }: ResultRowProps) {
  const Mark = speciesMark(row.species);

  return (
    <li>
      <button
        {...{ [ROVING_ATTR]: "" }}
        type="button"
        disabled={!row.selectable}
        tabIndex={tabbable ? 0 : -1}
        aria-label={row.ariaLabel}
        aria-disabled={!row.selectable || undefined}
        onClick={() => row.nodeId && onActivate(row.nodeId)}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(row.entity, {
            x: e.clientX,
            y: e.clientY,
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveRowFocus(e.currentTarget, 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveRowFocus(e.currentTarget, -1);
          } else {
            handleKeyboardContextMenu(e, (anchor) =>
              openContextMenu(row.entity, anchor),
            );
          }
        }}
        className={row.buttonClassName}
      >
        <span className="flex items-center justify-between gap-fg-2">
          <span className="flex min-w-0 items-center gap-fg-1-5">
            <span className="shrink-0 text-ink-faint" aria-hidden>
              <Mark size={SPECIES_PX} />
            </span>
            {/* Identity is true path/stem — mono per the typography law. */}
            <span className="min-w-0 truncate font-mono text-ink">{row.source}</span>
          </span>
          <span className="flex shrink-0 items-center gap-fg-1-5 text-ink-faint">
            {row.fallbackBadgeLabel && (
              // Fallback marker — not colour-only; a labelled tag the SR reads.
              // The kit Badge is the shared pill definition.
              <Badge>{row.fallbackBadgeLabel}</Badge>
            )}
            {/* Score is data-bearing → tabular numerals. Fallback scores sit
                in a visibly lower ink band so a fallback hit never reads as
                semantic certainty (search ADR degraded row). */}
            <span className={row.scoreToneClass} data-tabular>
              {row.scoreLabel}
            </span>
          </span>
        </span>
        {row.result.excerpt && (
          <span className={row.excerptClassName}>{row.result.excerpt}</span>
        )}
      </button>
    </li>
  );
}

export function SearchTab() {
  const query = useSearchIntentQuery();
  const target = useSearchIntentTarget();
  const scope = useActiveScope();
  const selectDashboardNode = useDashboardNodeSelection(scope);
  const search = useSearchController(query, target, scope);
  const presentation = deriveSearchPresentationView(query, search, { target, scope });
  const targetRows = deriveSearchTargetRows();

  return (
    <div className={presentation.rootClassName} data-search-tab>
      {/* Query input — the centralized kit SearchField (board 244:752, paper-sunken
          field) with its leading search glyph and clear affordance. */}
      <SearchField
        value={query}
        onChange={setSearchIntentQuery}
        placeholder={presentation.inputPlaceholder}
        ariaLabel={presentation.inputAriaLabel}
        onClear={() => setSearchIntentQuery("")}
      />

      {/* Target selector — the centralized kit SegmentedToggle (design-system-is-
          centralized): a roving-keys radiogroup whose active segment reads by raised
          paper + medium weight (grayscale-safe), replacing the prior per-surface
          hand-built radiogroup. Keyboard-initiated and instant. */}
      <SegmentedToggle
        value={target}
        onChange={setSearchIntentTarget}
        ariaLabel={presentation.targetGroupAriaLabel}
        className={presentation.targetGroupClassName}
        fullWidth
      >
        {targetRows.map((row) => (
          <Segment key={row.target} value={row.target}>
            {row.label}
          </Segment>
        ))}
      </SegmentedToggle>

      {/* The SINGLE polite live region (search ADR: "a polite live region") —
          it alone announces the settled outcome (count / offline / no-results /
          error) to assistive tech. The visible status nodes below are styled
          but NOT live regions, so a screen reader hears each outcome once. */}
      <p className="sr-only" role="status" aria-live="polite">
        {presentation.liveMessage}
      </p>

      {/* Idle / empty: an approachable prompt, never a blank panel. */}
      {!presentation.hasQuery && (
        <p className={presentation.idleClassName} data-search-idle>
          {presentation.idleMessage}
        </p>
      )}

      {/* Loading: the purposeful liveness cue tied to real pending work; goes
          static under prefers-reduced-motion (the app-wide reduced-motion floor
          neutralizes the pulse). */}
      {presentation.showLoading && (
        <p className={presentation.loadingClassName} data-search-loading>
          {presentation.loadingMessage}
        </p>
      )}

      {/* Degraded: semantic tier offline — a calm, advisory (NOT error-red)
          notice with a Lucide status mark, read through the tiers seam, followed
          by the text-match fallback. For the code target there is no text
          fallback, so the notice states that plainly. */}
      {presentation.showSemanticOffline && (
        <p className={presentation.semanticOfflineClassName} data-semantic-offline>
          <span className={presentation.semanticOfflineIconClassName} aria-hidden>
            <Search size={CHROME_PX} />
          </span>
          <span>{presentation.semanticOfflineMessage}</span>
        </p>
      )}

      {/* Error: a genuine transport failure that is NOT tier degradation —
          recoverable, plainly worded, with a retry affordance, kept distinct
          from the degraded state per the tiers contract. */}
      {presentation.showError && (
        <div className={presentation.errorClassName} data-search-error>
          <p className={presentation.errorTitleClassName}>{presentation.errorTitle}</p>
          <button
            type="button"
            onClick={search.retry}
            className={presentation.retryButtonClassName}
          >
            {presentation.retryLabel}
          </button>
        </div>
      )}

      {/* No results: honest and non-alarming, distinct from idle and degraded. */}
      {presentation.noResults && (
        <p className={presentation.noResultsClassName} data-search-empty>
          {presentation.noResultsMessage}
        </p>
      )}

      {/* Results: the list, with a quiet result-count receipt. */}
      {presentation.showResults && (
        <>
          <p
            className={presentation.resultCountClassName}
            data-search-count
            data-tabular
          >
            {/* Board 244:752: "Ranked by meaning · N results" (or by text match
                when the semantic tier is offline). */}
            {presentation.resultSummaryLabel}
          </p>
          <ul
            className={presentation.resultsListClassName}
            role="list"
            aria-label={presentation.resultsListAriaLabel}
          >
            {presentation.resultRows.map((row, i) => (
              <ResultRow
                // Object constancy: key on stable node id where present so a
                // re-query / live re-rank does not thrash the list (search ADR).
                key={row.key}
                row={row}
                // The list's single Tab-stop is the first SELECTABLE row (a
                // disabled null-node_id row cannot receive focus), so Tab always
                // enters the list on a usable result.
                tabbable={i === presentation.firstClickableIndex}
                onActivate={(id) =>
                  void selectDashboardNode(id).catch(() => undefined)
                }
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
