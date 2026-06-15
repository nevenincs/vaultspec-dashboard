// Status-stamp visual harness (node-visual-richness prototype) — a STANDALONE,
// DEV-ONLY gallery for visual inspection of the stamp treatments and the hover
// bloom. It is NOT imported by the app (a second Vite entry mounts it), so it
// never ships in the production bundle.
//
// Two panels:
//   (a) the STAMP MATRIX — every doc-type silhouette × every status class,
//       each cell rendering the computed StampDescriptor as a small DOM/SVG mock
//       (ring weight, ghost opacity, slash, severity gauge, tier notch) driven
//       by `stampFor`. The Pixi sprite integration is deferred (post-merge), so
//       the treatments are mocked here in DOM/SVG to make them inspectable now.
//   (b) the HOVER-BLOOM demo — a few sample nodes that bloom a HoverCard on
//       hover (an accepted ADR, a deprecated ADR, an L2 plan at 7/12, a critical
//       audit, a superseded rule).
//
// The `--color-status-*` tokens (provisional / graded / tiered) the stamp tint
// names refer to are defined HERE, prototype-locally, to stay collision-free
// with the in-flight token work in `styles.css`; a post-merge integration can
// promote them into the shared semantic tier.

import { useState } from "react";

import { DocTypeMark } from "../scene/field/markComponents";
import {
  type NodeStatus,
  type StampDescriptor,
  stampFor,
  stampToken,
} from "../scene/field/statusStamp";
import { HoverCard, type StatusCardModel } from "../app/islands/HoverCard";

// --- the matrix axes ----------------------------------------------------------

const DOC_TYPES = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
  "index",
  "code",
  "feature",
] as const;

// One representative status per class, so every column exercises a distinct
// treatment. The ordinals pick a mid/high grade so the gauge/notch is visible.
const STATUS_COLUMNS: ReadonlyArray<{ label: string; status: NodeStatus }> = [
  { label: "affirmed", status: { value: "accepted", class: "affirmed" } },
  { label: "provisional", status: { value: "proposed", class: "provisional" } },
  { label: "negated", status: { value: "rejected", class: "negated" } },
  { label: "retired", status: { value: "deprecated", class: "retired" } },
  { label: "superseded", status: { value: "superseded", class: "retired" } },
  { label: "graded·4", status: { value: "critical", class: "graded", ordinal: 4 } },
  { label: "tiered·2", status: { value: "L2", class: "tiered", ordinal: 2 } },
];

// --- the stamp mock (DOM/SVG) -------------------------------------------------

/**
 * Render a node's silhouette with its computed stamp treatment overlaid, as a
 * pure DOM/SVG mock. This is the visual stand-in for the deferred Pixi sprite
 * anatomy: the ring weight, ghost opacity, slash, severity gauge, and tier notch
 * are drawn here so the treatment table is inspectable today. The tint comes
 * from the status class token (`stampToken`) — reinforcing, never load-bearing.
 */
function StampedNode({
  kind,
  status,
}: {
  kind: string;
  status: NodeStatus | undefined;
}) {
  const stamp: StampDescriptor = stampFor(status);
  const tintVar = stampToken(status?.class);
  const tint = `var(${tintVar})`;
  const ghostOpacity = stamp.ghost ? 0.42 : 1;

  return (
    <div
      className="relative flex h-12 w-12 items-center justify-center"
      data-stamped-node
      title={status?.value ?? "no status"}
    >
      {/* The ring treatment, drawn as an SVG circle behind the glyph. */}
      {stamp.ring && stamp.ring !== "none" && (
        <svg
          className="absolute inset-0"
          viewBox="0 0 48 48"
          width={48}
          height={48}
          aria-hidden
        >
          <circle
            cx={24}
            cy={24}
            r={21}
            fill="none"
            stroke={tint}
            strokeWidth={stamp.ring === "solid" ? 2.5 : 2}
            strokeDasharray={stamp.ring === "dashed" ? "4 3" : undefined}
          />
        </svg>
      )}

      {/* The node silhouette (shared domain mark), ghosted when retired. */}
      <span
        className="flex items-center text-ink"
        style={{ opacity: ghostOpacity }}
        aria-hidden
      >
        <DocTypeMark kind={kind} size={26} />
      </span>

      {/* The slash treatment (negated / superseded), drawn over the glyph. */}
      {stamp.slash && (
        <svg
          className="absolute inset-0"
          viewBox="0 0 48 48"
          width={48}
          height={48}
          aria-hidden
        >
          <line
            x1={9}
            y1={39}
            x2={39}
            y2={9}
            stroke={tint}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* The severity gauge dot (graded), bottom-right corner. */}
      {stamp.severityDot ? (
        <span
          className="absolute -bottom-1 -right-1 flex items-center"
          style={{ color: tint }}
          aria-hidden
        >
          <SeverityGauge level={stamp.severityDot} />
        </span>
      ) : null}

      {/* The tier notch (tiered), bottom-right corner. */}
      {stamp.tierNotch ? (
        <span
          className="absolute -bottom-1 -right-1 flex items-center"
          style={{ color: tint }}
          aria-hidden
        >
          <TierNotch level={stamp.tierNotch} />
        </span>
      ) : null}
    </div>
  );
}

/** A small severity gauge (arc fill 1..4) mock, matching the mark family. */
function SeverityGauge({ level }: { level: 1 | 2 | 3 | 4 }) {
  const fraction = level / 4;
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" width={14} height={14}>
      <circle
        cx={8}
        cy={8}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.2}
      />
      <circle
        cx={8}
        cy={8}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${(c * fraction).toFixed(2)} ${c.toFixed(2)}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

/** A small tier staircase (1..4 steps) mock, matching the mark family. */
function TierNotch({ level }: { level: 1 | 2 | 3 | 4 }) {
  const heights = [4, 7, 10, 13];
  return (
    <svg viewBox="0 0 16 16" width={14} height={14}>
      {heights.slice(0, level).map((h, i) => (
        <rect
          key={i}
          x={1 + i * 3.6}
          y={14 - h}
          width={2.8}
          height={h}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

// --- the sample nodes for the hover demo --------------------------------------

const SAMPLES: ReadonlyArray<StatusCardModel> = [
  {
    id: "doc:2026-06-14-accepted-decision-adr",
    kind: "adr",
    title: "Accepted decision",
    status: { value: "accepted", class: "affirmed" },
    authorityClass: "accepted decision",
  },
  {
    id: "doc:2026-06-14-deprecated-decision-adr",
    kind: "adr",
    title: "Deprecated decision",
    status: { value: "deprecated", class: "retired" },
    authorityClass: "deprecated decision",
  },
  {
    id: "doc:2026-06-14-feature-plan",
    kind: "plan",
    title: "Feature plan",
    status: { value: "L2", class: "tiered", ordinal: 2 },
    authorityClass: "L2 plan",
    progress: { done: 7, total: 12 },
  },
  {
    id: "doc:2026-06-14-corpus-audit",
    kind: "audit",
    title: "Corpus audit",
    status: { value: "critical", class: "graded", ordinal: 4 },
    authorityClass: "critical finding",
  },
  {
    id: "rule:superseded-discipline",
    kind: "reference",
    title: "Superseded rule",
    status: { value: "superseded", class: "retired" },
    authorityClass: "superseded rule",
  },
];

// --- the gallery --------------------------------------------------------------

export function StatusGallery() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  return (
    <div className="prototype-tokens min-h-screen bg-paper p-vs-8 text-ink">
      <header className="mb-vs-8">
        <h1 className="text-heading font-medium">node-visual-richness prototype</h1>
        <p className="mt-vs-1 text-body text-ink-muted">
          status stamps (shape-carries, tint-reinforces) and the hover-bloom card,
          mocked in DOM/SVG. The Pixi sprite integration is deferred to post-merge.
        </p>
      </header>

      {/* (a) the stamp matrix --------------------------------------------- */}
      <section className="mb-vs-8" aria-labelledby="matrix-heading">
        <h2 id="matrix-heading" className="mb-vs-3 text-title font-medium">
          stamp matrix · doc-type × status class
        </h2>
        <div className="overflow-x-auto rounded-vs-md border border-rule bg-paper-raised p-vs-3 shadow-card">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="px-vs-3 py-vs-1 text-left text-2xs font-medium text-ink-muted">
                  doc-type
                </th>
                {STATUS_COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    className="px-vs-2 py-vs-1 text-center text-2xs font-medium text-ink-muted"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-vs-2 py-vs-1 text-center text-2xs font-medium text-ink-muted">
                  none
                </th>
              </tr>
            </thead>
            <tbody>
              {DOC_TYPES.map((kind) => (
                <tr key={kind} className="border-t border-rule">
                  <td className="px-vs-3 py-vs-1 text-2xs text-ink">{kind}</td>
                  {STATUS_COLUMNS.map((col) => (
                    <td key={col.label} className="px-vs-2 py-vs-1 text-center">
                      <div className="flex justify-center">
                        <StampedNode kind={kind} status={col.status} />
                      </div>
                    </td>
                  ))}
                  <td className="px-vs-2 py-vs-1 text-center">
                    <div className="flex justify-center">
                      <StampedNode kind={kind} status={undefined} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* (b) the hover-bloom demo ----------------------------------------- */}
      <section aria-labelledby="hover-heading">
        <div className="mb-vs-3 flex items-center justify-between">
          <h2 id="hover-heading" className="text-title font-medium">
            hover-bloom · sample nodes
          </h2>
          <label className="flex items-center gap-vs-1 text-2xs text-ink-muted">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
            force reduced motion
          </label>
        </div>
        <p className="mb-vs-3 text-2xs text-ink-faint">
          hover a node to bloom its card. Toggle reduced motion to swap the grow for an
          instant crossfade.
        </p>
        <div className="flex flex-wrap gap-vs-8">
          {SAMPLES.map((sample) => (
            <div
              key={sample.id}
              className="relative"
              onMouseEnter={() => setHovered(sample.id)}
              onMouseLeave={() => setHovered((h) => (h === sample.id ? null : h))}
            >
              <button
                type="button"
                className="flex flex-col items-center gap-vs-1 rounded-vs-md border border-rule bg-paper-raised p-vs-3 text-2xs text-ink-muted shadow-card transition-colors duration-ui-fast ease-settle hover:border-rule-strong"
                onFocus={() => setHovered(sample.id)}
                onBlur={() => setHovered((h) => (h === sample.id ? null : h))}
              >
                <StampedNode kind={sample.kind} status={sample.status} />
                <span className="max-w-24 truncate">{sample.title}</span>
              </button>
              {hovered === sample.id && (
                <div className="absolute left-full top-0 z-10 ml-vs-2">
                  <HoverCard
                    key={`${sample.id}-${reducedMotion}`}
                    model={sample}
                    reducedMotion={reducedMotion}
                    onOpen={(id) => window.alert(`open ${id}`)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
