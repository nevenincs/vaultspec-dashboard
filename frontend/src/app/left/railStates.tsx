// The left rail's DESIGNED transient/empty/degraded modes (binding `LeftRail`
// State collection: Typical / Loading / Empty / Degraded). Every rail surface — the
// Vault tree and the Files tree — renders these SAME designed states instead of a
// per-surface copy-toned sentence, so the rail honours the design's mode concept as
// one shared, complete feature (design-system-is-centralized).
//
// No wire access, no node identity: pure presentation over a state the stores
// selector already classified (dashboard-layer-ownership). Internal/engineering
// vocabulary never reaches these surfaces (ui-labels-are-user-facing).

import { Folder, type LucideIcon, TriangleAlert } from "lucide-react";

/**
 * LOADING mode: skeleton rows mimicking the rail's section-eyebrow + folder-row
 * rhythm, pulsing on the sunken-paper ground — the designed transient placeholder
 * (never a spinner, never a "reading…" sentence).
 */
export function RailSkeleton({ label = "Loading…" }: { label?: string }) {
  const rows = ["38%", "62%", "54%", "70%", "46%"];
  return (
    <div
      className="flex flex-col gap-fg-2 px-fg-1 py-fg-1"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-rail-state="loading"
    >
      <span className="sr-only">{label}</span>
      <div className="h-[0.625rem] w-1/4 animate-pulse rounded-fg-xs bg-paper-sunken" />
      {rows.map((w, i) => (
        <div key={i} className="flex items-center gap-fg-1-5">
          <span className="size-[0.875rem] shrink-0 animate-pulse rounded-fg-xs bg-paper-sunken" />
          <span
            className="h-[0.8125rem] animate-pulse rounded-fg-xs bg-paper-sunken"
            style={{ width: w }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * EMPTY / DEGRADED full-body mode: a centered glyph over ONE plain user-facing
 * sentence. `degraded` paints the AlertTriangle in the quiet stale tone; an empty
 * state shows a neutral glyph (or a caller-supplied one).
 */
export function RailMessage({
  tone,
  label,
  icon,
}: {
  tone: "empty" | "degraded";
  label: string;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? (tone === "degraded" ? TriangleAlert : Folder);
  const iconClass = tone === "degraded" ? "text-state-stale" : "text-ink-faint";
  return (
    <div
      className="flex flex-col items-center gap-fg-2 px-fg-3 py-fg-6 text-center"
      role={tone === "degraded" ? "status" : undefined}
      aria-live={tone === "degraded" ? "polite" : undefined}
      data-rail-state={tone}
    >
      <span className={`${iconClass} shrink-0`} aria-hidden>
        <Icon size={20} />
      </span>
      <p className="text-meta text-ink-muted">{label}</p>
    </div>
  );
}

/**
 * DEGRADED inline notice: when a surface has PARTIAL data plus a degraded tier, a
 * compact AlertTriangle row sits above the content (the honest "showing what
 * loaded" variant of the degraded mode). One plain sentence — never the raw tier
 * reason.
 */
export function RailDegradedNotice({ label }: { label: string }) {
  return (
    <div
      className="mb-fg-1 flex items-center gap-fg-1-5 rounded-fg-xs bg-paper-sunken px-fg-2 py-fg-1-5 text-meta text-ink-muted"
      role="status"
      aria-live="polite"
      data-rail-state="degraded-notice"
    >
      <TriangleAlert size={14} className="shrink-0 text-state-stale" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
