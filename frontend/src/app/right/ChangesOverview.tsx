// Changes overview (task-7 right-rail): recent events for the active scope —
// changed files/docs, commits, and step completions surfaced from the engine's
// /events endpoint through the stores layer. The stores layer is the sole wire
// client; this component reads only through hooks (layer-ownership rule).

import type { EngineEvent } from "../../stores/server/engine";
import { useEngineEvents } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";

// --- pure helpers (unit-testable) --------------------------------------------------

const KIND_GLYPH: Record<string, string> = {
  commit: "⑂",
  "doc-created": "✎",
  "doc-modified": "✏",
  "step-checked": "☑",
};

export function eventGlyph(kind: string): string {
  return KIND_GLYPH[kind] ?? "◦";
}

/** Human-readable event label from the ref or the primary node id. */
export function eventLabel(ev: EngineEvent): string {
  if (ev.ref) {
    // Commits: shorten to 8 chars. Refs that are paths: basename only.
    if (/^[0-9a-f]{40}$/.test(ev.ref)) return ev.ref.slice(0, 8);
    return ev.ref.split(/[/\\]/).pop() ?? ev.ref;
  }
  return ev.node_ids[0] ?? ev.kind;
}

/** Compact relative timestamp (minutes → hours → days). */
export function relativeTs(ts: string, now: number): string {
  const at = Date.parse(ts);
  if (!Number.isFinite(at)) return "";
  const ageMs = now - at;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
}

// --- component ---------------------------------------------------------------------

/** Maximum events shown (contract §5: node_ids capped at 20). */
const MAX_SHOWN = 25;

export function ChangesOverview() {
  const scope = useActiveScope();
  const events = useEngineEvents(scope);
  const selectEntity = useViewStore((s) => s.selectEntity);

  if (!scope) {
    return (
      <p className="text-xs text-stone-400">no scope — pick a worktree first</p>
    );
  }
  if (events.isPending) {
    return <p className="text-xs text-stone-400">loading changes…</p>;
  }
  if (events.isError) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-amber-700">changes unavailable</p>
        <button
          type="button"
          onClick={() => void events.refetch()}
          className="text-xs text-stone-400 underline"
        >
          retry
        </button>
      </div>
    );
  }

  const evList = events.data?.events ?? [];
  if (evList.length === 0) {
    return <p className="text-xs text-stone-400">no recent changes</p>;
  }

  const shown = evList.slice(0, MAX_SHOWN);
  const now = Date.now();

  return (
    <ul className="space-y-0.5 text-xs" data-changes-overview>
      {shown.map((ev) => (
        <li key={ev.id}>
          <button
            type="button"
            onClick={() =>
              selectEntity({
                kind: "event",
                id: ev.id,
                nodeIds: ev.node_ids,
                truncatedNodeIds: ev.truncated_node_ids,
              })
            }
            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-stone-50"
            title={`${ev.kind} · ${ev.node_ids.length} node${ev.node_ids.length !== 1 ? "s" : ""}${ev.truncated_node_ids ? ` (+${ev.truncated_node_ids} truncated)` : ""}`}
          >
            <span className="shrink-0 text-stone-400">{eventGlyph(ev.kind)}</span>
            <span className="min-w-0 flex-1 truncate text-stone-700">
              {eventLabel(ev)}
            </span>
            {ev.node_ids.length > 1 && (
              <span className="shrink-0 text-stone-300">
                {ev.node_ids.length}
                {ev.truncated_node_ids ? "+" : ""}
              </span>
            )}
            <span className="shrink-0 text-stone-400">
              {relativeTs(ev.ts, now)}
            </span>
          </button>
        </li>
      ))}
      {evList.length > MAX_SHOWN && (
        <li className="px-1 text-stone-400">{evList.length - MAX_SHOWN} more…</li>
      )}
    </ul>
  );
}
