// The search tab (W03.P11.S44, ADR §2.3 pillar 3): query input with the
// rag filter vocabulary as typed chips, results listed with score and
// source, each result clickable into the graph — the engine's node-id
// annotation (contract §8) is what makes results click through to the
// stage.

import { useState } from "react";

import { selectNode } from "../../stores/view/selection";
import { useActiveScope } from "../stage/Stage";
import { useSearchWithFallback } from "./searchFallback";

export function SearchTab() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<"vault" | "code">("vault");
  const scope = useActiveScope();
  const search = useSearchWithFallback(query, target, scope);

  return (
    <div className="space-y-vs-2 text-body" data-search-tab>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="semantic search…"
        aria-label="search query"
        className="w-full rounded-vs-sm border border-rule bg-paper-raised px-vs-2 py-vs-1 text-ink placeholder:text-ink-faint focus:border-rule-strong focus:outline-none"
      />
      <div className="flex gap-vs-1" role="radiogroup" aria-label="search target">
        {(["vault", "code"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={target === t}
            onClick={() => setTarget(t)}
            className={`rounded-full border px-vs-2 py-vs-0-5 transition-colors duration-ui-fast ease-settle ${
              target === t
                ? "border-rule-strong bg-paper-sunken text-ink"
                : "border-rule text-ink-muted hover:border-rule-strong hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {query && search.isPending && <p className="text-ink-faint">searching…</p>}
      {search.semanticOffline && (
        <p
          className="rounded-vs-sm border border-state-stale/30 bg-paper-raised px-vs-2 py-vs-1 text-state-stale"
          data-semantic-offline
        >
          semantic search offline — showing title/text matches
          {target === "code" ? " (vault only; no code fallback)" : ""}
        </p>
      )}
      <ul className="space-y-vs-1">
        {search.results.map((result) => (
          <li key={`${result.source}:${result.score}`}>
            <button
              type="button"
              disabled={result.node_id === null}
              onClick={() => result.node_id && selectNode(result.node_id)}
              className="w-full rounded-vs-sm border border-rule px-vs-2 py-vs-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken disabled:cursor-default"
              title={result.node_id ?? "no graph node for this result"}
            >
              <span className="flex items-center justify-between gap-vs-1">
                <span className="truncate font-medium text-ink">{result.source}</span>
                <span className="flex shrink-0 items-center gap-vs-1 text-ink-faint">
                  {search.semanticOffline && (
                    <span className="rounded-vs-sm bg-paper-sunken px-vs-1 text-2xs text-ink-muted">
                      text match
                    </span>
                  )}
                  {Math.round(result.score * 100)}%
                </span>
              </span>
              {result.excerpt && (
                <span className="block truncate text-ink-muted">{result.excerpt}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
