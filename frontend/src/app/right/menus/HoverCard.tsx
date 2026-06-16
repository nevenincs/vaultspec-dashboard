// Hover-card (binding graph/HoverCard frame 84:2; figma-parity-reconciliation
// W03.P08.S50). The TRANSIENT card that blooms over a hovered canvas node and
// shows its identity plus its ENRICHED evidence (documents / code / commits).
//
// DUMB PROJECTION (dashboard-layer-ownership, views-are-projections-of-one-model):
// the card takes a typed model a stores selector supplies and renders it. It does
// NOT fetch, does NOT read the raw `tiers` block, and mints no wire shape — the
// evidence arrives through the `useNodeEvidence` stores hook (the sole wire client)
// and is folded to render-ready groups by the pure `hoverCardEvidence` seam.
//
// INSTRUMENT REGISTER (warmth-lives-in-tokens-not-decoration): no gradients, no
// textures, no second accent. Colour comes only from the semantic token tier — the
// kind glyph in the category accent, the ink/paper/rule tokens, and the single
// resolution-state tint on a code line (resolved/stale/broken). Shape and copy
// carry meaning. The kind glyph is the shared domain-mark family so the card reads
// as one hand with the canvas silhouettes.

import { type NodeCategory } from "../../../scene/field/categoryColor";
import { DocTypeMark } from "../../../scene/field/markComponents";
import { categoryTokenVar } from "../../islands/hoverCardContent";
import type { EvidenceGroup } from "./hoverCardEvidence";

/** The card's view model — the projection a stores selector supplies. */
export interface HoverCardModel {
  /** Stable node id (identity-bearing; rendered monospace). */
  readonly id: string;
  /** GLYPH_KINDS species (adr / plan / audit / rule / feature / …). */
  readonly kind: string;
  readonly title: string;
  /** The scene category the node belongs to — drives the accent strip + header
   *  glyph hue (themes-are-oklch-generated-from-a-token-tier; a per-theme `var()`
   *  on :root). */
  readonly category?: NodeCategory;
  /** The bounded, grouped evidence lines folded from the enriched node-evidence
   *  query by the pure `deriveEvidenceGroups` seam. Empty when the node carries
   *  no evidence (the card shows identity only). */
  readonly evidence: EvidenceGroup[];
}

export interface HoverCardProps {
  readonly model: HoverCardModel;
}

/** Tailwind text-tint class for a code-mention resolution state — the one
 *  surviving per-line tint, all from the semantic state tokens. */
function stateTintClass(state: string | undefined): string {
  switch (state) {
    case "resolved":
      return "text-state-active";
    case "stale":
      return "text-state-stale";
    case "broken":
      return "text-state-broken";
    default:
      return "text-ink-faint";
  }
}

export function HoverCard({ model }: HoverCardProps) {
  const accentVar = model.category ? categoryTokenVar(model.category) : undefined;

  return (
    <div
      role="dialog"
      aria-label={`${model.kind} ${model.title}`}
      data-hover-card
      data-category={model.category}
      className="relative flex w-64 flex-col gap-vs-1-5 overflow-hidden rounded-vs-md border border-rule bg-paper-raised p-vs-2 pl-vs-3 text-ink shadow-float"
    >
      {/* Category-accent strip: a single-token vertical rule naming the node's
          category by hue. Warmth lives in this one token, never decoration. */}
      {accentVar && (
        <span
          data-category-strip
          aria-hidden
          className="absolute inset-y-0 left-0 w-vs-0-5"
          style={{ backgroundColor: `var(${accentVar})` }}
        />
      )}

      {/* Header: kind glyph in the category accent + title. */}
      <div className="flex items-center gap-vs-1-5">
        <span
          className="flex shrink-0 items-center"
          style={accentVar ? { color: `var(${accentVar})` } : undefined}
          aria-hidden
        >
          <DocTypeMark kind={model.kind} size={16} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-title font-medium text-ink">
          {model.title}
        </h3>
      </div>

      {/* Evidence groups: documents / code / commits, each bounded, headed, and
          tail-counted. Empty groups are not rendered (the fold omits them). */}
      {model.evidence.map((group) => (
        <section
          key={group.heading}
          className="text-label"
          data-evidence-group={group.heading}
        >
          <div className="mb-vs-0-5 font-medium text-ink-muted">{group.heading}</div>
          <ul className="space-y-vs-0-5 text-ink-muted">
            {group.lines.map((line) => (
              <li key={line.key} className="truncate" title={line.label}>
                <span>{line.label}</span>
                {line.detail !== undefined && (
                  <span className="text-ink-faint"> {line.detail}</span>
                )}
                {line.state !== undefined && (
                  <span className={stateTintClass(line.state)}> ({line.state})</span>
                )}
              </li>
            ))}
            {group.overflow > 0 && (
              <li className="text-ink-faint" data-evidence-overflow>
                +{group.overflow} more
              </li>
            )}
          </ul>
        </section>
      ))}

      {/* Identity tail: the node id is true identity → monospace. */}
      <p className="break-all font-mono text-2xs text-ink-faint" data-card-id>
        {model.id}
      </p>
    </div>
  );
}
