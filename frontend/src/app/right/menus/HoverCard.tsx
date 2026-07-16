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
// kind glyph in the category accent and the ink/paper/rule tokens. Shape and copy
// carry meaning. The kind glyph is the shared domain-mark family so the card reads
// as one hand with the canvas silhouettes.

import { ExternalLink } from "lucide-react";

import { useLocalizedMessageResolver } from "../../../platform/localization/LocalizationProvider";
import type { CountMessageDescriptor } from "../../../platform/localization/message";
import { DocTypeMark } from "../../../scene/field/markComponents";
import type { HoverCardModel } from "../../../stores/view/hoverCard";

export type { HoverCardModel } from "../../../stores/view/hoverCard";

export interface HoverCardProps {
  readonly model: HoverCardModel;
  /** Fired by the open affordance (the external-link button). When omitted the
   *  affordance is not rendered and the card is purely inspect-only. */
  readonly onOpen?: (id: string) => void;
}

function categoryTokenVar(category: NonNullable<HoverCardModel["category"]>): string {
  return `--color-scene-category-${category}`;
}

type HoverCountKey =
  | "graph:hover.evidence.codeLocations"
  | "graph:hover.evidence.commits"
  | "graph:hover.evidence.documents";

function countMessage<Key extends HoverCountKey>(
  key: Key,
  count: number,
): CountMessageDescriptor<Key> {
  return { key, values: { count } };
}

export function HoverCard({ model, onOpen }: HoverCardProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const accentVar = model.category ? categoryTokenVar(model.category) : undefined;
  const typeWord = resolveMessage(model.typeLabel);
  if (typeWord.usedFallback) return null;
  const dialogLabel = resolveMessage({
    key: "graph:hover.accessibility.detailsFor",
    values: { title: model.title },
  }).message;
  const openLabel = resolveMessage({
    key: "graph:hover.accessibility.open",
    values: { title: model.title },
  }).message;
  const documentCount =
    model.evidence.documentCount > 0
      ? resolveMessage(
          countMessage("graph:hover.evidence.documents", model.evidence.documentCount),
        ).message
      : null;
  const codeLocationCount =
    model.evidence.codeLocationCount > 0
      ? resolveMessage(
          countMessage(
            "graph:hover.evidence.codeLocations",
            model.evidence.codeLocationCount,
          ),
        ).message
      : null;
  const commitCount =
    model.evidence.commitCount > 0
      ? resolveMessage(
          countMessage("graph:hover.evidence.commits", model.evidence.commitCount),
        ).message
      : null;

  return (
    <div
      role="dialog"
      aria-label={dialogLabel}
      data-hover-card
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
          <DocTypeMark kind={model.markKind} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            data-hover-doc-type
            className="text-caption font-medium tracking-[0.025rem] text-ink-muted"
          >
            {typeWord.message}
          </p>
          <h3 className="break-words text-body-strong font-medium text-ink line-clamp-2">
            {model.title}
          </h3>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(model.id)}
            aria-label={openLabel}
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

      {(documentCount || codeLocationCount || commitCount) && (
        <div className="space-y-fg-1 text-label text-ink-muted">
          {documentCount && <p data-hover-document-count>{documentCount}</p>}
          {codeLocationCount && <p data-hover-code-count>{codeLocationCount}</p>}
          {commitCount && <p data-hover-commit-count>{commitCount}</p>}
          {model.evidence.commitSubjects.length > 0 && (
            <ul className="space-y-fg-0-5">
              {model.evidence.commitSubjects.map((subject, index) => (
                <li key={index} className="truncate">
                  {subject}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
