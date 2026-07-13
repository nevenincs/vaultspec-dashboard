// A remark plugin attaching stable heading-path block identity to every rendered
// heading (authoring-surface ADR D2, W02.P05.S14).
//
// The reader's comment affordances (S15) and the section thread panel (S16) anchor
// on a heading SECTION. This plugin walks the mdast headings in document order,
// maintains the ancestor-heading stack the section selector uses, and stamps each
// heading with two `hProperties` data attributes:
//
//   - `data-comment-path`: the JSON-encoded ancestor-inclusive heading path (the
//     same shape the engine's `SectionSelector.heading_path` carries), so the
//     reader can look the clicked heading up in the raw-body anchor index without
//     re-deriving ancestry from a flat DOM node.
//   - `id` / `data-block-id`: a deterministic, collision-safe slug (a stable
//     fragment anchor a copy-link verb can later target, D3).
//
// The plugin is PURE and bounded: O(depth) stack work per heading, no fetch, no
// document read. It runs on the reader's editorial body (already heading-sanitized
// upstream), so the heading text it sees is the plain user-facing text.

import type { Heading, Root, RootContent } from "mdast";
import { visit } from "unist-util-visit";

/** Flatten a heading node's inline children to their plain text (mirrors the
 *  reader's `flattenText`). The editorial body is heading-sanitized upstream, so a
 *  heading is normally a single text node; this stays total for any inline shape. */
function flattenHeadingText(node: Heading): string {
  const parts: string[] = [];
  const walk = (children: RootContent[] | Heading["children"]): void => {
    for (const child of children) {
      if (child.type === "text" || child.type === "inlineCode") {
        parts.push(child.value);
      } else if ("children" in child && Array.isArray(child.children)) {
        walk(child.children as RootContent[]);
      }
    }
  };
  walk(node.children);
  return parts.join("").trim();
}

/** Slugify a heading path into a stable URL fragment: lowercase, non-alphanumeric
 *  runs collapsed to a single hyphen, edges trimmed. Empty input degrades to a
 *  stable `"section"` sentinel rather than an empty id. Unicode letters/numbers are
 *  preserved so a non-ASCII heading still slugs to meaningful text. */
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "section";
}

/**
 * The remark transform: stamp every heading with its ancestor-inclusive heading
 * path and a collision-safe slug id via `hProperties`. Repeated heading paths are
 * disambiguated by an occurrence index appended to the slug (`-2`, `-3`, …), so two
 * identically-titled sections never collide on the same fragment id. Returns a
 * plugin factory for the remark pipeline.
 */
export function remarkBlockId() {
  return (tree: Root): void => {
    // The ancestor stack of (depth, text) pairs — the same shallower-pops-deeper
    // discipline the engine's `parse_heading_sections` uses to build a path.
    const stack: { depth: number; text: string }[] = [];
    // Occurrence counts per base slug so a repeated heading path disambiguates.
    const slugCounts = new Map<string, number>();

    visit(tree, "heading", (node: Heading) => {
      const text = flattenHeadingText(node);
      while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
        stack.pop();
      }
      const path = [...stack.map((entry) => entry.text), text];
      stack.push({ depth: node.depth, text });

      const base = slugifyHeading(path.join(" "));
      const seen = slugCounts.get(base) ?? 0;
      slugCounts.set(base, seen + 1);
      const slug = seen === 0 ? base : `${base}-${seen + 1}`;

      const data = (node.data ??= {});
      const hProperties = (data.hProperties ??= {});
      hProperties.id = slug;
      hProperties["data-block-id"] = slug;
      hProperties["data-comment-path"] = JSON.stringify(path);
    });
  };
}
