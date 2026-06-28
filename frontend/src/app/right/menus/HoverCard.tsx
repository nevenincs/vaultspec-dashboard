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
import { docTypeLabel } from "../../../stores/server/docTypeVocabulary";
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
  // The header glyph and the plain-language eyebrow both read the vault doc type
  // (the marks are keyed by doc type, not the bare `document` kind); a synthesized
  // feature node has no doc type, so it falls back to its species `kind`. The
  // eyebrow word comes from the ONE canonical doc-type vocabulary.
  const markKind = model.docType ?? model.kind;
  const typeWord = model.docType ? docTypeLabel(model.docType) : undefined;

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

      {/* Header: doc-type glyph in the category accent + a doc-type eyebrow over a
          MULTILINE title (the title wraps to at most two lines rather than
          truncating to one — the canvas label is the truncated form). */}
      <div className="flex items-start gap-fg-1-5">
        <span
          className="mt-fg-0-5 flex shrink-0 items-center"
          style={accentVar ? { color: `var(${accentVar})` } : undefined}
          aria-hidden
        >
          <DocTypeMark kind={markKind} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          {typeWord && (
            <p
              data-hover-doc-type
              className="text-caption font-medium uppercase tracking-[0.025rem] text-ink-faint"
            >
              {typeWord}
            </p>
          )}
          <h3 className="break-words text-body-strong font-medium text-ink line-clamp-2">
            {model.title}
          </h3>
        </div>
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
            className="pointer-events-auto mt-fg-0-5 flex shrink-0 items-center rounded-fg-xs p-fg-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink"
          >
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>

      {/* Headline summary: the document's first prose line (node-detail
          route-fill), wrapped to at most three lines. Present only for
          content-bearing doc nodes — a feature node has no body, so the line is
          simply omitted (honest absence). */}
      {model.summary && (
        <p
          data-hover-summary
          className="break-words text-caption text-ink-muted line-clamp-3"
        >
          {model.summary}
        </p>
      )}

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
