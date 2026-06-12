// The search tab (W03.P11.S44, ADR §2.3 pillar 3): query input with the
// rag filter vocabulary as typed chips, results listed with score and
// source, each result clickable into the graph — the engine's node-id
// annotation (contract §8) is what makes results click through to the
// stage.

import { useState } from "react";

import { useEngineSearch } from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";

export function SearchTab() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<"vault" | "code">("vault");
  const search = useEngineSearch(query, target);

  return (
    <div className="space-y-2 text-xs" data-search-tab>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="semantic search…"
        aria-label="search query"
        className="w-full rounded border border-stone-200 px-2 py-1"
      />
      <div className="flex gap-1" role="radiogroup" aria-label="search target">
        {(["vault", "code"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={target === t}
            onClick={() => setTarget(t)}
            className={`rounded-full border px-2 py-0.5 ${
              target === t
                ? "border-stone-500 bg-stone-100 text-stone-900"
                : "border-stone-200 text-stone-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {query && search.isPending && <p className="text-stone-400">searching…</p>}
      {search.isError && (
        <p className="text-amber-700">search failed — see the rag card</p>
      )}
      <ul className="space-y-1">
        {search.data?.results.map((result) => (
          <li key={`${result.source}:${result.score}`}>
            <button
              type="button"
              disabled={result.node_id === null}
              onClick={() => result.node_id && selectNode(result.node_id)}
              className="w-full rounded border border-stone-100 px-2 py-1 text-left hover:border-stone-300 disabled:cursor-default"
              title={result.node_id ?? "no graph node for this result"}
            >
              <span className="flex items-center justify-between">
                <span className="truncate font-medium text-stone-700">
                  {result.source}
                </span>
                <span className="text-stone-400">
                  {Math.round(result.score * 100)}%
                </span>
              </span>
              {result.excerpt && (
                <span className="block truncate text-stone-500">{result.excerpt}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
