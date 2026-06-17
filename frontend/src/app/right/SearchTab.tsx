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
// it holds only ephemeral input state (the query text and target), consumes the
// rag controller exclusively through the `useSearchController` stores selector
// (the sole wire client for search — the fallback, the debounce/cancel, the
// node-id derivation, and the tiers-gated degradation all live there now, pulled
// back out of this chrome layer per the rag-search ADR), reads degradation only
// through that selector's interpreted `semanticOffline` (never the raw `tiers`
// block), and emits selection intent through the view store's `selectNode` — it
// fetches nothing and navigates nothing itself. Each result is a projection over
// the one model addressed by its stable node id; activating it selects that
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
import { useState } from "react";

import type { SearchResult } from "../../stores/server/engine";
import { useSearchController } from "../../stores/server/searchController";
import { openContextMenu } from "../../stores/view/contextMenu";
import { selectNode } from "../../stores/view/selection";
import { useActiveScope } from "../stage/Stage";
// Centralized kit Badge (design-system-is-centralized) for the text-match
// fallback marker — the shared pill definition, not a per-surface chip.
import { Badge, SearchField } from "../kit";

// Self-register the search-result resolver at module load so the context-menu
// host can resolve a result's menu the moment a row publishes its entity.
import "./menus/searchResultMenu";

// Icon sizing — the iconography ADR's grayscale-by-shape gate is 14px; the
// leading chrome adornment reads one density step smaller so the structural
// chrome stays attenuated relative to the expressive doc-type species marks.
const SPECIES_PX = 14;
const CHROME_PX = 13;

// Result species marks (search ADR / iconography ADR): the doc-type/species mark
// from Phosphor when a result maps to a known node species. Search results carry
// only a `node_id`, so species is inferred from its stable-id prefix
// (`doc:` / `code:` / `commit:`, contract §2). Each reads in `currentColor` so
// hue is never the identity channel — shape is, distinct at 14px (file-text /
// code-brackets / git-commit), with a dashed-file fallback for an unmapped or
// null id. The prefix map is intentionally chrome-only and NON-exhaustive: it
// covers the species that surface in search results today; other stable-id
// prefixes (e.g. `feature:`) fall through to the dashed-file fallback rather
// than the panel owning the engine's full node taxonomy.
function speciesMark(nodeId: string | null): Icon {
  if (!nodeId) return FileDashed;
  if (nodeId.startsWith("commit:")) return GitCommit;
  if (nodeId.startsWith("code:")) return Code;
  if (nodeId.startsWith("doc:")) return FileText;
  return FileDashed;
}

/** A result's score as a tabular-numeral percentage (data-bearing readout). */
function scorePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// Roving-tabindex focus order, derived from the DOM at EVENT time (the in-repo
// pattern from `NavToolbar.rovingButtons`): read the enclosing list's result
// buttons at the moment an arrow key fires rather than tracking a render-phase
// ref array, so memoization, reorder, or a partial unmount can never desync the
// focus order from what is actually painted.
const ROVING_ATTR = "data-search-result";

function rovingRows(from: HTMLElement): HTMLButtonElement[] {
  const list = from.closest("ul");
  if (!list) return [];
  // Non-clickable (null-node_id) rows are `disabled` and unfocusable, so they
  // drop out of the roving set — arrow nav steps over them onto the next
  // selectable result rather than stalling on a dead row.
  return Array.from(
    list.querySelectorAll<HTMLButtonElement>(`button[${ROVING_ATTR}]:not(:disabled)`),
  );
}

function moveRowFocus(from: HTMLButtonElement, delta: number): void {
  const rows = rovingRows(from);
  const at = rows.indexOf(from);
  if (at === -1) return;
  rows[Math.min(rows.length - 1, Math.max(0, at + delta))]?.focus();
}

interface ResultRowProps {
  result: SearchResult;
  /** True while serving the text-match fallback — fallback rows are tagged. */
  fallback: boolean;
  /** Roving-tabindex: only the active row is in tab order. */
  tabbable: boolean;
  /** True when the active search target is code (the source IS a shell path). */
  isCode: boolean;
  onActivate: (id: string) => void;
}

/** The SearchResultEntity a result row publishes to the context-menu host. */
function resultEntity(result: SearchResult, isCode: boolean) {
  return {
    kind: "search-result" as const,
    id: result.node_id ?? result.source,
    source: result.source,
    nodeId: result.node_id ?? undefined,
    score: result.score,
    isCode,
  };
}

function ResultRow({ result, fallback, tabbable, isCode, onActivate }: ResultRowProps) {
  const clickable = result.node_id !== null;
  const Mark = speciesMark(result.node_id);
  const percent = scorePercent(result.score);
  // The accessible name carries source + score so a screen reader hears the
  // receipt without sighted scanning; a non-clickable result says so plainly.
  const label = clickable
    ? `${result.source}, relevance ${percent}`
    : `${result.source}, relevance ${percent}, no graph node — not selectable`;

  return (
    <li>
      <button
        {...{ [ROVING_ATTR]: "" }}
        type="button"
        disabled={!clickable}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        aria-disabled={!clickable || undefined}
        onClick={() => clickable && result.node_id && onActivate(result.node_id)}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(resultEntity(result, isCode), {
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
          } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(resultEntity(result, isCode), {
              x: r.left,
              y: r.bottom,
            });
          }
        }}
        className={`w-full rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          clickable
            ? "hover:border-rule-strong hover:bg-paper-sunken"
            : "cursor-default opacity-70"
        }`}
      >
        <span className="flex items-center justify-between gap-fg-2">
          <span className="flex min-w-0 items-center gap-fg-1-5">
            <span className="shrink-0 text-ink-faint" aria-hidden>
              <Mark size={SPECIES_PX} />
            </span>
            {/* Identity is true path/stem — mono per the typography law. */}
            <span className="min-w-0 truncate font-mono text-ink">{result.source}</span>
          </span>
          <span className="flex shrink-0 items-center gap-fg-1-5 text-ink-faint">
            {fallback && (
              // Fallback marker — not colour-only; a labelled tag the SR reads.
              // The kit Badge is the shared pill definition.
              <Badge>text match</Badge>
            )}
            {/* Score is data-bearing → tabular numerals. Fallback scores sit
                in a visibly lower ink band so a fallback hit never reads as
                semantic certainty (search ADR degraded row). */}
            <span
              className={fallback ? "text-ink-faint" : "text-ink-muted"}
              data-tabular
            >
              {percent}
            </span>
          </span>
        </span>
        {result.excerpt && (
          <span className="mt-fg-0-5 block truncate text-ink-muted">
            {result.excerpt}
          </span>
        )}
      </button>
    </li>
  );
}

export function SearchTab() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<"vault" | "code">("vault");
  const scope = useActiveScope();
  const search = useSearchController(query, target, scope);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  // The settled phase for the polite live region: the count on results, the
  // offline notice on degradation, and the no-results message — so a screen
  // reader operator learns the outcome without polling. The interpreted `state`
  // from the stores controller is the single source the view switches on. The
  // list renders whenever the controller hands back hits — semantic results, the
  // offline text-match fallback, OR the held last-good set carried under the
  // error banner (the ADR's recoverable error state must not blank a list the
  // operator was reading), so the gate is simply "are there results to show".
  const showResults = search.results.length > 0;
  // The list's Tab entry is the first selectable row (disabled rows can't focus).
  const firstClickable = search.results.findIndex((r) => r.node_id !== null);
  const noResults = search.state === "no-results";
  const liveMessage = search.error
    ? "search request failed"
    : search.semanticOffline
      ? "semantic search offline — showing title and text matches"
      : showResults
        ? `${search.results.length} result${search.results.length === 1 ? "" : "s"}`
        : noResults
          ? "no results"
          : "";

  return (
    <div className="space-y-fg-2 text-body" data-search-tab>
      {/* Query input — the centralized kit SearchField (board 244:752, paper-sunken
          field) with its leading search glyph and clear affordance. */}
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search documents and code…"
        ariaLabel="search query"
        onClear={() => setQuery("")}
      />

      {/* Target selector — stays a radiogroup; an active chip is marked by the
          accent AND aria-checked, never colour alone (grayscale-safe). Keyboard-
          initiated, so the toggle is instant (no animation). */}
      <div className="flex gap-fg-1" role="radiogroup" aria-label="search target">
        {(["vault", "code"] as const).map((t) => {
          const on = target === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTarget(t)}
              className={`rounded-fg-pill border px-fg-2 py-fg-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                on
                  ? "border-accent bg-accent-subtle font-medium text-ink"
                  : "border-rule text-ink-muted hover:border-rule-strong hover:text-ink"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* The SINGLE polite live region (search ADR: "a polite live region") —
          it alone announces the settled outcome (count / offline / no-results /
          error) to assistive tech. The visible status nodes below are styled
          but NOT live regions, so a screen reader hears each outcome once. */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      {/* Idle / empty: an approachable prompt, never a blank panel. */}
      {!hasQuery && (
        <p className="px-fg-1 py-fg-2 text-label text-ink-faint" data-search-idle>
          search semantically across the vault and code. select a result to focus it on
          the stage.
        </p>
      )}

      {/* Loading: the purposeful liveness cue tied to real pending work; goes
          static under prefers-reduced-motion (the app-wide reduced-motion floor
          neutralizes the pulse). */}
      {search.state === "loading" && (
        <p
          className="animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint"
          data-search-loading
        >
          searching…
        </p>
      )}

      {/* Degraded: semantic tier offline — a calm, advisory (NOT error-red)
          notice with a Lucide status mark, read through the tiers seam, followed
          by the text-match fallback. For the code target there is no text
          fallback, so the notice states that plainly. */}
      {search.semanticOffline && (
        <p
          className="flex items-start gap-fg-1-5 rounded-fg-xs border border-state-stale/40 bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted"
          data-semantic-offline
        >
          <span className="mt-px shrink-0 text-state-stale" aria-hidden>
            <Search size={CHROME_PX} />
          </span>
          <span>
            semantic search offline — showing title and text matches
            {search.noCodeFallback ? " (vault only; no code fallback available)" : ""}
          </span>
        </p>
      )}

      {/* Error: a genuine transport failure that is NOT tier degradation —
          recoverable, plainly worded, with a retry affordance, kept distinct
          from the degraded state per the tiers contract. */}
      {search.error && (
        <div
          className="space-y-fg-1 rounded-fg-xs border border-state-broken/40 px-fg-2 py-fg-1"
          data-search-error
        >
          <p className="text-label text-state-broken">search request failed</p>
          <button
            type="button"
            onClick={search.retry}
            className="rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            try again
          </button>
        </div>
      )}

      {/* No results: honest and non-alarming, distinct from idle and degraded. */}
      {noResults && !search.semanticOffline && (
        <p className="px-fg-1 py-fg-2 text-label text-ink-faint" data-search-empty>
          no matches for “{trimmed}”. try broadening the query or switching target.
        </p>
      )}

      {/* Results: the list, with a quiet result-count receipt. */}
      {showResults && (
        <>
          <p
            className="px-fg-1 text-caption text-ink-faint"
            data-search-count
            data-tabular
          >
            {/* Board 244:752: "Ranked by meaning · N results" (or by text match
                when the semantic tier is offline). */}
            {search.semanticOffline ? "Ranked by text match" : "Ranked by meaning"} ·{" "}
            {search.results.length} result{search.results.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-fg-1" role="list" aria-label="search results">
            {search.results.map((result, i) => (
              <ResultRow
                // Object constancy: key on stable node id where present so a
                // re-query / live re-rank does not thrash the list (search ADR).
                key={result.node_id ?? `${result.source}:${i}`}
                result={result}
                fallback={search.semanticOffline}
                // The list's single Tab-stop is the first SELECTABLE row (a
                // disabled null-node_id row cannot receive focus), so Tab always
                // enters the list on a usable result.
                tabbable={i === firstClickable}
                // The target IS the authoritative code/vault signal: a code
                // result's `source` is the shell path open-in-editor needs.
                isCode={target === "code"}
                onActivate={selectNode}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
