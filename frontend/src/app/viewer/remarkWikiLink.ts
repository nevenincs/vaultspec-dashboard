// A remark plugin rewriting double-bracket wiki-links into in-app link nodes
// (review-rail-viewers ADR P04.S19).
//
// `.vault/` documents cross-reference each other with the `[[stem]]` and
// `[[stem|label]]` double-bracket forms, which are NOT CommonMark — react-markdown
// renders them as literal text. This plugin walks the mdast text nodes and rewrites
// each wiki-link occurrence into a `link` node whose URL is the sentinel
// `vaultspec:doc:<stem>` scheme. The MarkdownReader's anchor component intercepts
// that scheme and fires the SAME navigation intent the trees use (resolve the stem
// to `doc:<stem>`, select the node and open the reader) — reusing the `doc:<stem>`
// identity, never inventing one. A non-wiki link is left untouched.

import type { Link, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/** The sentinel URL scheme a rewritten wiki-link carries; the reader's anchor
 *  component matches this prefix and routes the click to in-app navigation. */
export const WIKI_LINK_SCHEME = "vaultspec:doc:";

// `[[stem]]` or `[[stem|label]]`. The stem is everything up to an optional
// `|label`; both are trimmed. The global flag drives the split-and-rebuild below.
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Build the in-app link node for one wiki-link match: the URL carries the stem
 *  under the sentinel scheme, the visible text is the label (or the stem). */
function wikiLinkNode(stem: string, label: string | undefined): Link {
  const trimmedStem = stem.trim();
  return {
    type: "link",
    url: `${WIKI_LINK_SCHEME}${trimmedStem}`,
    title: null,
    children: [{ type: "text", value: (label ?? trimmedStem).trim() }],
  };
}

/**
 * The remark transform: replace every text node containing wiki-link syntax with
 * a sequence of text + link nodes, so the double-bracket forms become real link
 * nodes the reader can route. Text outside the brackets is preserved verbatim.
 * Skips text already inside a link (a wiki-link nested in a real link is left as
 * the link's text). Returns a plugin factory for the remark pipeline.
 */
export function remarkWikiLink() {
  return (tree: Root): void => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (parent === undefined || index === undefined) return;
      // Do not rewrite inside an existing link (avoid a link within a link).
      if (parent.type === "link") return;
      const value = node.value;
      if (!value.includes("[[")) return;

      const replacements: (Text | Link)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      WIKI_LINK_RE.lastIndex = 0;
      while ((match = WIKI_LINK_RE.exec(value)) !== null) {
        if (match.index > lastIndex) {
          replacements.push({
            type: "text",
            value: value.slice(lastIndex, match.index),
          });
        }
        replacements.push(wikiLinkNode(match[1], match[2]));
        lastIndex = match.index + match[0].length;
      }
      if (replacements.length === 0) return;
      if (lastIndex < value.length) {
        replacements.push({ type: "text", value: value.slice(lastIndex) });
      }
      // Splice the rewritten sequence in place of the original text node.
      parent.children.splice(index, 1, ...replacements);
      // Skip past the nodes we just inserted.
      return index + replacements.length;
    });
  };
}

/** Recover the `doc:<stem>` node id a sentinel wiki-link URL targets, or null
 *  when the URL is not a wiki-link (a normal link the reader renders plainly). */
export function wikiLinkNodeId(url: string): string | null {
  if (!url.startsWith(WIKI_LINK_SCHEME)) return null;
  const stem = url.slice(WIKI_LINK_SCHEME.length);
  return stem.length > 0 ? `doc:${stem}` : null;
}
