// The ONE shared markdown fixture for the reader visual-parity campaign
// (editor-figma-parity). It is the EXACT content of the binding Figma reader frame
// `263:871` (Reader / Mode=View, "Graph layout catalog") so the live reader and the
// design render the identical document — a pixel diff then compares only treatment,
// not content. Copied verbatim from the Figma design context (the dek, lead, body,
// blockquote, list, table, and code block all match the frame's text).
//
// Raw `.md` INCLUDING the leading YAML frontmatter fence: the reader parses the
// frontmatter out of `content.text`, so the fixture carries it verbatim, mirroring
// a real `.vault/` document. `status: accepted` feeds the meta line's status; the
// dek is the first body line after the H1 and the lead is the paragraph after it.

export const READER_FIXTURE_PATH = ".vault/adr/2026-06-16-graph-layout-catalog-adr.md";

export const READER_FIXTURE_MARKDOWN = `---
tags:
  - '#adr'
  - '#graph-layout-catalog'
  - '#scene'
  - '#layouts'
date: '2026-06-16'
modified: '2026-06-16'
status: accepted
related:
  - '[[representation-layout]]'
  - '[[graph-scale-hardening]]'
  - '[[salience-lens]]'
---

# Graph layout catalog

Hierarchical, radial, and community layouts as framework-free, deterministic-seed modes.

A single source of truth for how the graph arranges itself — every layout is a pure projection of the same model, selected by name and seeded for repeatable structure.

## Context

The catalog defines layouts as **deterministic-seed modes** so a given graph renders identically across sessions. Each mode is **framework-free** — no force simulation owns the result — and composes the shared spine described in [[representation-layout]]. The reference driver is \`radialLayout()\`.

> A layout is a deterministic function of the model and a seed — never of the session, the viewport, or the order nodes arrived.

## Decision

### Seeded, framework-free modes

- **Hierarchical** — a tidy-tree spine for parent/child derivations.
- **Radial** — concentric shells ranked by depth from the focus node.
- **Community** — force-free grouping by shared feature membership.

| Mode         | Spine                          |
| ------------ | ------------------------------ |
| Hierarchical | Parent / child tidy-tree       |
| Radial       | Depth-ranked concentric shells |
| Community    | Shared-feature clusters        |

### Reference implementation

\`\`\`typescript
export function radialLayout(nodes: Node[], opts: LayoutOpts) {
  const ring = depth * spacing   // concentric shells
  const seed = "deterministic"
  return nodes.map((n, i) => place(n, ring, i))
}
\`\`\`
`;
