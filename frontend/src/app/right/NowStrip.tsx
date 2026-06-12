// The now strip (W03.P10.S40, ADR G2): "what is happening / what just
// changed" — git status for the current worktree, vaultspec-core's
// in-flight status, and the rag service rollup, from the /status recovery
// snapshot refreshed by the backends and git SSE channels. Each backend's
// degraded state renders honestly: stopped, crashed, absent — designed
// states, not errors.

import { useEffect } from "react";

import type { EngineStatus } from "../../stores/server/engine";
import { useEngineStatus } from "../../stores/server/engine";
import { engineKeys, useEngineStream } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";

// --- pure rollups (unit-tested) ---------------------------------------------------

export interface CardState {
  label: string;
  tone: "ok" | "warn" | "down";
  detail: string;
}

export function gitCard(status: EngineStatus | undefined): CardState {
  if (!status?.git) {
    return { label: "git", tone: "down", detail: "no repository state" };
  }
  const { branch, ahead, behind, dirty } = status.git;
  const drift = [
    ahead > 0 ? `↑${ahead}` : "",
    behind > 0 ? `↓${behind}` : "",
    dirty.length > 0 ? `${dirty.length} dirty` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    label: "git",
    tone: dirty.length > 0 ? "warn" : "ok",
    detail: `${branch}${drift ? ` · ${drift}` : " · clean"}`,
  };
}

export function coreCard(status: EngineStatus | undefined): CardState {
  if (!status?.core?.reachable) {
    return { label: "core", tone: "down", detail: "unreachable" };
  }
  return {
    label: "core",
    tone: status.core.vault_health === "green" ? "ok" : "warn",
    detail: `vault ${status.core.vault_health ?? "unknown"}`,
  };
}

export function ragCard(status: EngineStatus | undefined): CardState {
  const rag = status?.rag;
  if (!rag || rag.service !== "running") {
    return {
      label: "rag",
      tone: "down",
      detail: rag?.service ?? "absent",
    };
  }
  return {
    label: "rag",
    tone: "ok",
    detail: `${rag.watcher ?? "?"} · index ${rag.index ?? "?"} · ${rag.jobs ?? 0} jobs`,
  };
}

const TONE_CLASSES: Record<CardState["tone"], string> = {
  ok: "border-emerald-200 text-emerald-900",
  warn: "border-amber-200 text-amber-900",
  down: "border-stone-300 text-stone-500",
};

// --- the strip ----------------------------------------------------------------------

export function NowStrip() {
  const status = useEngineStatus();
  // Backend/git transitions refresh the snapshot (stream is delta,
  // /status is recovery — contract §7).
  const stream = useEngineStream(["backends", "git"]);
  useEffect(() => {
    if ((stream.data?.length ?? 0) > 0) {
      void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
    }
  }, [stream.data?.length]);

  if (status.isError) {
    return (
      <p className="text-xs text-amber-700">
        engine unreachable — start it with <code>vaultspec serve</code>
      </p>
    );
  }
  const cards = [gitCard(status.data), coreCard(status.data), ragCard(status.data)];
  return (
    <div className="space-y-1 text-xs" data-now-strip>
      {cards.map((card) => (
        <div
          key={card.label}
          className={`flex items-center justify-between rounded border px-2 py-1 ${TONE_CLASSES[card.tone]}`}
        >
          <span className="font-medium">{card.label}</span>
          <span className="truncate" title={card.detail}>
            {card.detail}
          </span>
        </div>
      ))}
      {status.data && status.data.degradations.length > 0 && (
        <p className="text-amber-700">
          degraded: {status.data.degradations.join(", ")}
        </p>
      )}
    </div>
  );
}
