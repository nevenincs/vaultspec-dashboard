// The search tab (W03.P11.S44; re-skinned W02.P08.S24 onto the OKLCH token layer
// and the sanctioned icon families per the search surface ADR): a rag-backed
// query over the vault and code corpora whose results click through into the
// graph stage and the right-rail inspector. The engine's node-id annotation
// (contract §8) is what makes results click through to the stage.
//
// The panel is a DUMB view (dashboard-layer-ownership / views-are-projections):
// it holds only ephemeral input state (the query text and target), consumes the
// rag controller exclusively through the `useSearchWithFallback` stores hook,
// reads degradation only through that hook's interpreted `semanticOffline`
// (never the raw `tiers` block), and emits selection intent through the view
// store's `selectNode` — it fetches nothing and navigates nothing itself. Each
// result is a projection over the one model addressed by its stable node id;
// activating it selects that node, which the stage and inspector reflect.
//
// The full state machine the ADR names is realized here: idle, loading,
// results, no-results, degraded (semantic search offline, a designed state via
// the tiers seam — never an error), and a genuine transport error with retry.

import { Search, X } from "lucide-react";
import {
  Code,
  FileText,
  FileDashed,
  GitCommit,
  type Icon,
} from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";

import type { SearchResult } from "../../stores/server/engine";
import { selectNode } from "../../stores/view/selection";
import { useActiveScope } from "../stage/Stage";
import { useSearchWithFallback } from "./searchFallback";

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
// null id.
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

interface ResultRowProps {
  result: SearchResult;
  /** True while serving the text-match fallback — fallback rows are tagged. */
  fallback: boolean;
  /** Roving-tabindex: only the active row is in tab order. */
  tabbable: boolean;
  registerRow: (el: HTMLButtonElement | null) => void;
  onActivate: (id: string) => void;
  onArrow: (from: HTMLButtonElement, delta: number) => void;
}

function ResultRow({
  result,
  fallback,
  tabbable,
  registerRow,
  onActivate,
  onArrow,
}: ResultRowProps) {
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
        ref={registerRow}
        type="button"
        disabled={!clickable}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        aria-disabled={!clickable || undefined}
        onClick={() => clickable && result.node_id && onActivate(result.node_id)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            onArrow(e.currentTarget, 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onArrow(e.currentTarget, -1);
          }
        }}
        className={`w-full rounded-vs-sm border border-rule px-vs-2 py-vs-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          clickable
            ? "hover:border-rule-strong hover:bg-paper-sunken"
            : "cursor-default opacity-70"
        }`}
      >
        <span className="flex items-center justify-between gap-vs-2">
          <span className="flex min-w-0 items-center gap-vs-1-5">
            <span className="shrink-0 text-ink-faint" aria-hidden>
              <Mark size={SPECIES_PX} />
            </span>
            {/* Identity is true path/stem — mono per the typography law. */}
            <span className="min-w-0 truncate font-mono text-ink">{result.source}</span>
          </span>
          <span className="flex shrink-0 items-center gap-vs-1-5 text-ink-faint">
            {fallback && (
              // Fallback marker — not colour-only; a labelled tag the SR reads.
              <span className="rounded-vs-sm bg-paper-sunken px-vs-1 text-2xs text-ink-muted">
                text match
              </span>
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
          <span className="mt-vs-0-5 block truncate text-ink-muted">
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
  const search = useSearchWithFallback(query, target, scope);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  // Roving-tabindex result list (a11y contract): one Tab-stop, ArrowUp/ArrowDown
  // move within it, the focused row's button activates on Enter/Space natively.
  const rowRefs = useRef<HTMLButtonElement[]>([]);
  rowRefs.current = [];
  const registerRow = useCallback((el: HTMLButtonElement | null) => {
    if (el) rowRefs.current.push(el);
  }, []);
  const moveFocus = useCallback((from: HTMLButtonElement, delta: number) => {
    const rows = rowRefs.current;
    const at = rows.indexOf(from);
    if (at === -1) return;
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + delta))];
    next?.focus();
  }, []);

  const fieldRef = useRef<HTMLInputElement>(null);
  // Escape clears the query, or returns focus to the field if already empty.
  const onFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else fieldRef.current?.blur();
    }
  };

  // The settled phase for the polite live region: the count on results, the
  // offline notice on degradation, and the no-results message — so a screen
  // reader operator learns the outcome without polling.
  const showResults = hasQuery && !search.isPending && search.results.length > 0;
  const noResults =
    hasQuery &&
    !search.isPending &&
    !search.transportError &&
    search.results.length === 0;
  const liveMessage = search.transportError
    ? "search request failed"
    : search.semanticOffline
      ? "semantic search offline — showing title and text matches"
      : showResults
        ? `${search.results.length} result${search.results.length === 1 ? "" : "s"}`
        : noResults
          ? "no results"
          : "";

  return (
    <div className="space-y-vs-2 text-body" data-search-tab>
      {/* Query input — Lucide search adornment + a clear affordance once the
          field is non-empty; native search type, accessible label, accent focus
          ring from the 12-step role model. */}
      <div className="relative">
        <span
          className="pointer-events-none absolute inset-y-0 left-vs-2 flex items-center text-ink-faint"
          aria-hidden
        >
          <Search size={CHROME_PX} />
        </span>
        <input
          ref={fieldRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFieldKeyDown}
          placeholder="search vault and code…"
          aria-label="search query"
          className="w-full rounded-vs-sm border border-rule bg-paper-raised py-vs-1 pl-vs-6 pr-vs-6 text-ink placeholder:text-ink-faint focus-visible:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              fieldRef.current?.focus();
            }}
            aria-label="clear search"
            className="absolute inset-y-0 right-vs-1 flex items-center rounded-vs-sm px-vs-1 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <X size={CHROME_PX} />
          </button>
        )}
      </div>

      {/* Target selector — stays a radiogroup; an active chip is marked by the
          accent AND aria-checked, never colour alone (grayscale-safe). Keyboard-
          initiated, so the toggle is instant (no animation). */}
      <div className="flex gap-vs-1" role="radiogroup" aria-label="search target">
        {(["vault", "code"] as const).map((t) => {
          const on = target === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTarget(t)}
              className={`rounded-full border px-vs-2 py-vs-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
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

      {/* Polite live region — announces the settled outcome to assistive tech. */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      {/* Idle / empty: an approachable prompt, never a blank panel. */}
      {!hasQuery && (
        <p className="px-vs-1 py-vs-2 text-label text-ink-faint" data-search-idle>
          search semantically across the vault and code. select a result to focus it on
          the stage.
        </p>
      )}

      {/* Loading: the purposeful liveness cue tied to real pending work; goes
          static under prefers-reduced-motion (the app-wide reduced-motion floor
          neutralizes the pulse). */}
      {hasQuery && search.isPending && (
        <p
          className="animate-pulse-live px-vs-1 py-vs-0-5 text-label text-ink-faint"
          role="status"
          aria-live="polite"
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
          className="flex items-start gap-vs-1-5 rounded-vs-sm border border-state-stale/40 bg-paper-sunken px-vs-2 py-vs-1 text-label text-ink-muted"
          role="status"
          aria-live="polite"
          data-semantic-offline
        >
          <span className="mt-px shrink-0 text-state-stale" aria-hidden>
            <Search size={CHROME_PX} />
          </span>
          <span>
            semantic search offline — showing title and text matches
            {target === "code" ? " (vault only; no code fallback available)" : ""}
          </span>
        </p>
      )}

      {/* Error: a genuine transport failure that is NOT tier degradation —
          recoverable, plainly worded, with a retry affordance, kept distinct
          from the degraded state per the tiers contract. */}
      {search.transportError && (
        <div
          className="space-y-vs-1 rounded-vs-sm border border-state-broken/40 px-vs-2 py-vs-1"
          role="status"
          aria-live="polite"
          data-search-error
        >
          <p className="text-label text-state-broken">search request failed</p>
          <button
            type="button"
            onClick={search.retry}
            className="rounded-vs-sm text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            try again
          </button>
        </div>
      )}

      {/* No results: honest and non-alarming, distinct from idle and degraded. */}
      {noResults && !search.semanticOffline && (
        <p className="px-vs-1 py-vs-2 text-label text-ink-faint" data-search-empty>
          no matches for “{trimmed}”. try broadening the query or switching target.
        </p>
      )}

      {/* Results: the list, with a quiet result-count receipt. */}
      {showResults && (
        <>
          <p className="px-vs-1 text-2xs text-ink-faint" data-search-count data-tabular>
            {search.results.length} result{search.results.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-vs-1" role="list" aria-label="search results">
            {search.results.map((result, i) => (
              <ResultRow
                // Object constancy: key on stable node id where present so a
                // re-query / live re-rank does not thrash the list (search ADR).
                key={result.node_id ?? `${result.source}:${i}`}
                result={result}
                fallback={search.semanticOffline}
                tabbable={i === 0}
                registerRow={registerRow}
                onActivate={selectNode}
                onArrow={moveFocus}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
