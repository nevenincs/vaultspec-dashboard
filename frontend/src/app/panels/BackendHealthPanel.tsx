// The Backend health control-panel body (activity-rail-realignment ADR D3, S09).
// The first surface for the served backend/tier health plane: per-tier
// availability with plain-language names, plus engine and framework-core
// reachability — all from the interpreted stores rollup ONLY.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): a DUMB
// app-chrome body. It reads ONE interpreted selector (`useStatusRollup`) and
// NEVER inspects the raw `tiers` block — the rollup already interpreted engine
// reachability, the served `degradations` list, and the core/rag views in the
// stores layer. It fetches nothing (the enclosing modal mount-gates the read).
//
// Honest gap (flagged to review): the rollup exposes the served DEGRADED backend
// list (`degradations`) but not a per-tier human REASON for the structural /
// declared / temporal tiers, so those rows render availability without a reason
// line; only the semantic (search) tier carries a served reason via the rag view.
// A richer per-tier reason would need a stores-layer projection over the tiers
// block — deliberately NOT added here (no new fetch, no raw-tiers read).

import { useStatusRollup, type StatusRollupView } from "../../stores/server/queries";
import type { FrameworkStatusTone } from "../../stores/server/queries";

/** A single backend/tier availability row. */
export interface BackendHealthRow {
  key: string;
  label: string;
  tone: FrameworkStatusTone;
  statusWord: string;
  /** The served human reason, when the rollup carries one (semantic tier only). */
  reason?: string;
}

/** The four provenance tiers, in the binding-frame order, mapped to their
 *  plain-language names (labels-are-user-facing — never the internal tier ids). */
const TIER_ROWS: readonly { tier: string; label: string }[] = [
  { tier: "structural", label: "Documents" },
  { tier: "declared", label: "Links" },
  { tier: "temporal", label: "History" },
  { tier: "semantic", label: "Semantic search" },
];

const TONE_DOT_CLASS: Record<FrameworkStatusTone, string> = {
  ok: "bg-state-active",
  attention: "bg-state-stale",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

function availabilityWord(tone: FrameworkStatusTone): string {
  return tone === "ok"
    ? "Available"
    : tone === "down"
      ? "Unavailable"
      : tone === "attention"
        ? "Degraded"
        : "Checking…";
}

/**
 * Project the backend-health rows from the interpreted status rollup. Pure — no
 * hook — so the mapping is unit-testable. Engine and framework-core reachability
 * lead; then one row per provenance tier, its tone read from the served
 * `degradations` list (a tier in the list is unavailable) and, for the semantic
 * tier, the interpreted rag view (the only tier the rollup carries a reason for).
 */
export function deriveBackendHealthRows(rollup: StatusRollupView): BackendHealthRow[] {
  const engineLoading = rollup.core.loading && !rollup.engineUnreachable;
  const rows: BackendHealthRow[] = [];

  // Engine reachability — the wire itself.
  const engineTone: FrameworkStatusTone = rollup.engineUnreachable
    ? "down"
    : engineLoading
      ? "unknown"
      : "ok";
  rows.push({
    key: "engine",
    label: "Engine",
    tone: engineTone,
    statusWord:
      engineTone === "down"
        ? "Unreachable"
        : engineTone === "unknown"
          ? "Checking…"
          : "Reachable",
  });

  // Framework core reachability.
  const core = rollup.core;
  const coreTone: FrameworkStatusTone = rollup.engineUnreachable
    ? "down"
    : core.errored
      ? "down"
      : core.loading
        ? "unknown"
        : core.reachable
          ? "ok"
          : "down";
  rows.push({
    key: "core",
    label: "Framework core",
    tone: coreTone,
    statusWord:
      coreTone === "down"
        ? "Unreachable"
        : coreTone === "unknown"
          ? "Checking…"
          : "Reachable",
  });

  // Per-tier availability from the served degradation list.
  for (const { tier, label } of TIER_ROWS) {
    if (rollup.engineUnreachable) {
      rows.push({ key: tier, label, tone: "down", statusWord: "Unavailable" });
      continue;
    }
    if (engineLoading) {
      rows.push({ key: tier, label, tone: "unknown", statusWord: "Checking…" });
      continue;
    }
    if (tier === "semantic") {
      // The semantic tier is the search service — the rollup's rag view is the
      // only tier that carries a served reason.
      const rag = rollup.rag;
      const tone: FrameworkStatusTone =
        rag.errored || rag.degraded ? "down" : rag.loading ? "unknown" : "ok";
      rows.push({
        key: tier,
        label,
        tone,
        statusWord: availabilityWord(tone),
        reason: tone === "down" ? rag.reason : undefined,
      });
      continue;
    }
    const degraded = rollup.degradations.includes(tier);
    rows.push({
      key: tier,
      label,
      tone: degraded ? "down" : "ok",
      statusWord: degraded ? "Unavailable" : "Available",
    });
  }
  return rows;
}

function HealthRow({ row }: { row: BackendHealthRow }) {
  return (
    <div className="flex items-center gap-fg-2" data-backend-row={row.key}>
      <span
        aria-hidden
        className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[row.tone]}`}
      />
      <span className="min-w-0 flex-1 truncate text-body text-ink">{row.label}</span>
      <span
        className={`shrink-0 text-meta ${
          row.tone === "down"
            ? "text-state-broken"
            : row.tone === "attention"
              ? "text-state-stale"
              : row.tone === "ok"
                ? "text-state-active"
                : "text-ink-faint"
        }`}
        data-backend-status
      >
        {row.statusWord}
      </span>
    </div>
  );
}

/** The Backend health panel body: engine/core reachability plus per-tier
 *  availability, read from the interpreted status rollup only. */
export function BackendHealthPanel() {
  const rollup = useStatusRollup();
  const rows = deriveBackendHealthRows(rollup);
  return (
    <div className="flex flex-col gap-fg-3 px-fg-4 py-fg-3" data-backend-health-panel>
      <div className="flex flex-col gap-fg-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-fg-0-5">
            <HealthRow row={row} />
            {row.reason && (
              <p className="pl-fg-4 text-meta text-ink-faint" data-backend-reason>
                {row.reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
