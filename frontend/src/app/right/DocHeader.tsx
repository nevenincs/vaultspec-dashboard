// DocHeader (figma-frontend-rewrite W02.P06.S09 — binding Figma DocHeader board
// 283:1170). The header that crowns an opened document in the reader/viewer
// surface: a path Breadcrumb trail, the document title in the binding serif
// Reader/Title role, the doc-type Chip and tier Badge, an optional key/value
// metadata block, and a close affordance.
//
// Composed ENTIRELY from the centralized kit (design-system-is-centralized):
// Breadcrumb, Chip, Badge, PropertyRow, and IconButton are the one shared
// definitions; the only bespoke element is the serif title, which binds the
// Reader/Title typeface role (Fraunces via `font-serif`) the design system pins
// for document headings.
//
// Pure, prop-driven chrome (dashboard-layer-ownership / view-rewrite-preserves-
// the-state-and-scene-contract): it holds no wire state, issues no fetch, mints
// no node shape, and reads no raw `tiers` block. The host (the viewer surface)
// derives these props from the preserved stores content/frontmatter model and
// passes navigation + close intent down.

import { X } from "lucide-react";
import type { ReactNode } from "react";

import {
  Badge,
  Breadcrumb,
  type BreadcrumbItem,
  type Category,
  Chip,
  IconButton,
  PropertyRow,
} from "../kit";

export interface DocHeaderMeta {
  /** The property label (e.g. "created", "modified", "worktree"). */
  label: ReactNode;
  /** The property value. */
  value: ReactNode;
}

export interface DocHeaderProps {
  /** The document title — rendered in the binding serif Reader/Title role. */
  title: string;
  /** The path trail leading to the document (kit Breadcrumb). */
  trail?: BreadcrumbItem[];
  /** The doc-type category that tints the leading Chip dot (binding palette). */
  category?: Category;
  /** The chip label; falls back to the category token when omitted. */
  categoryLabel?: ReactNode;
  /** The plan tier (L1–L4) rendered as a neutral kit Badge. */
  tier?: string;
  /** Optional key/value metadata block (kit PropertyRows). */
  meta?: DocHeaderMeta[];
  /** When supplied, a trailing close affordance (kit IconButton) renders. */
  onClose?: () => void;
}

export function DocHeader({
  title,
  trail,
  category,
  categoryLabel,
  tier,
  meta,
  onClose,
}: DocHeaderProps) {
  const hasTags = Boolean(category) || Boolean(tier);
  return (
    <header
      data-doc-header
      className="space-y-fg-2 border-b border-rule bg-paper-raised px-fg-3 py-fg-2"
    >
      <div className="flex items-start gap-fg-2">
        <div className="min-w-0 flex-1 space-y-fg-1">
          {trail && trail.length > 0 && <Breadcrumb items={trail} />}
          {/* The binding serif Reader/Title role — the one place the document's
              own headline typeface lives (Fraunces via `font-serif`). */}
          <h1
            data-doc-title
            title={title}
            className="truncate font-serif text-display text-ink"
          >
            {title}
          </h1>
          {hasTags && (
            <div className="flex flex-wrap items-center gap-fg-1">
              {category && <Chip category={category}>{categoryLabel ?? category}</Chip>}
              {tier && <Badge>{tier}</Badge>}
            </div>
          )}
        </div>
        {onClose && (
          <IconButton label="Close document" onClick={onClose}>
            <X size={15} aria-hidden />
          </IconButton>
        )}
      </div>
      {meta && meta.length > 0 && (
        <dl data-doc-meta className="space-y-fg-0-5">
          {meta.map((m, i) => (
            <PropertyRow key={i} label={m.label} value={m.value} />
          ))}
        </dl>
      )}
    </header>
  );
}
