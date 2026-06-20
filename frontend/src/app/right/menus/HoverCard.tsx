// Hover-card (binding graph/HoverCard frame 84:2; figma-parity-reconciliation
// W03.P08.S50). The TRANSIENT card that blooms over a hovered canvas node and
// shows its identity plus its ENRICHED evidence (documents / code / commits).
//
// DUMB PROJECTION (dashboard-layer-ownership, views-are-projections-of-one-model):
// the card takes a typed model a stores selector supplies and renders it. It does
// NOT fetch, does NOT read the raw `tiers` block, and mints no wire shape. The
// evidence is already folded into the stores-owned `HoverCardModel` before this
// component sees it.
//
// INSTRUMENT REGISTER (warmth-lives-in-tokens-not-decoration): no gradients, no
// textures, no second accent. Colour comes only from the semantic token tier — the
// kind glyph in the category accent, the ink/paper/rule tokens, and the single
// resolution-state tint on a code line. Shape and copy carry meaning. The kind
// glyph is the shared domain-mark family so the card reads as one hand with the
// canvas silhouettes.

import { ExternalLink } from "lucide-react";

import { DocTypeMark } from "../../../scene/field/markComponents";
import type { HoverCardModel } from "../../../stores/view/hoverCard";
import { categoryTokenVar } from "../../../stores/view/hoverCardContent";

export type { HoverCardModel } from "../../../stores/view/hoverCard";

export interface HoverCardProps {
  readonly model: HoverCardModel;
  /** Fired by the open affordance (the external-link button). When omitted the
   *  affordance is not rendered and the card is purely inspect-only. */
  readonly onOpen?: (id: string) => void;
}

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

export function HoverCard({ model, onOpen }: HoverCardProps) {
  const accentVar = model.category ? categoryTokenVar(model.category) : undefined;

  return (
    <div
      role="dialog"
      aria-label={`${model.kind} ${model.title}`}
      data-hover-card
      data-category={model.category}
      className="relative flex w-64 flex-col gap-fg-1-5 overflow-hidden rounded-fg-md border border-rule bg-paper-raised p-fg-2 pl-fg-3 text-ink shadow-fg-overlay"
    >
      {/* Category-accent strip: a single-token vertical rule naming the node's
          category by hue. Warmth lives in this one token, never decoration. */}
      {accentVar && (
        <span
          data-category-strip
          aria-hidden
          className="absolute inset-y-0 left-0 w-fg-0-5"
          style={{ backgroundColor: `var(${accentVar})` }}
        />
      )}

      {/* Header: kind glyph in the category accent + title. */}
      <div className="flex items-center gap-fg-1-5">
        <span
          className="flex shrink-0 items-center"
          style={accentVar ? { color: `var(${accentVar})` } : undefined}
          aria-hidden
        >
          <DocTypeMark kind={model.kind} size={16} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-body-strong font-medium text-ink">
          {model.title}
        </h3>
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(model.id)}
            aria-label={`open ${model.title}`}
            data-hover-open
            // The card may be hosted inside an inspect-only (pointer-events:none)
            // wrapper so the transient hover card never steals the pointer; the
            // open affordance is the one interactive escape, so it re-enables
            // pointer events on itself (the bloom → open intent).
            className="pointer-events-auto flex shrink-0 items-center rounded-fg-xs p-fg-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink"
          >
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>

      {/* Evidence groups: documents / code / commits, each bounded, headed, and
          tail-counted. Empty groups are not rendered (the fold omits them). */}
      {model.evidence.map((group) => (
        <section
          key={group.heading}
          className="text-label"
          data-evidence-group={group.heading}
        >
          <div className="mb-fg-0-5 font-medium text-ink-muted">{group.heading}</div>
          <ul className="space-y-fg-0-5 text-ink-muted">
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
      <p className="break-all font-mono text-caption text-ink-faint" data-card-id>
        {model.id}
      </p>
    </div>
  );
}
