// The ONE shared markdown fixture for the reader visual-parity campaign
// (editor-figma-parity). It is the EXACT content of the binding Figma reader
// instance `455:1117` (doc-reader · Reader / Mode=View, "Phase-lane arc timeline")
// so the live reader and the design render the identical document — a pixel diff
// then compares only treatment, not content. Copied verbatim from the Figma design
// context (the dek, lead, body, blockquote, list, table, and code block all match
// the instance's text).
//
// Raw `.md` INCLUDING the leading YAML frontmatter fence: the reader parses the
// frontmatter out of `content.text`, so the fixture carries it verbatim, mirroring
// a real `.vault/` document. `status: accepted` feeds the meta line's status; the
// dek is the first body line after the H1 and the lead is the paragraph after it.

export const READER_FIXTURE_PATH = ".vault/adr/2026-06-16-dashboard-timeline-adr.md";

export const READER_FIXTURE_MARKDOWN = `---
tags:
  - '#adr'
  - '#dashboard-timeline'
  - '#scene'
  - '#timeline'
date: '2026-06-16'
modified: '2026-06-16'
status: accepted
related:
  - '[[dashboard-timeline-adr]]'
  - '[[graph-scale-hardening]]'
  - '[[dashboard-foundation-reference]]'
---

# Phase-lane arc timeline

A relational timeline where every document sits in its pipeline lane.

A relational timeline where every dated document sits in the lane its kind belongs to — one bounded projection of the same graph model.

## Context

The phase-lane timeline places **every dated document in** a pipeline lane, so the corpus reads as a diachronic story rather **than a flat list**.

> A lane is a deterministic function of document kind: research and reference share one lane, then adr, plan, exec, audit → review, and rule → codify.

## Decision

### Bounded, lane-assigned arcs

- **Lanes** — one per pipeline phase, derived from a document's kind.
- **Arcs** — relations between dated documents, bounded by the node ceiling.
- **Reveal** — arc growth animates client-side; the engine stays read-only.

| Lane      | Contains                   |
| --------- | -------------------------- |
| Research  | Research & reference notes |
| Decision  | ADRs in the decision lane  |
| Execution | Plans, steps & summaries   |

### Reference implementation

\`\`\`typescript
export function laneOf(doc: DatedNode): Lane {
  const lane = PIPELINE_LANE[doc.kind]
  return clampToRange(lane, doc.date)
}
\`\`\`
`;

// A deliberately MESSY document (editor-figma-parity / document-reader hardening):
// the authentic vaultspec shape — HTML comment template blocks, an inline comment,
// a `{feature} {doctype}: {title} | (status: …)` H1, formatted section headings,
// and a code fence whose contents must survive verbatim. The reader must render
// this with a clean editorial title, plain section headings, and zero comments.
// Reachable from the harness with `?fixture=messy` for end-to-end visual proof.
export const READER_MESSY_FIXTURE_MARKDOWN = `---
tags:
  - '#adr'
  - '#document-reader'
date: '2026-06-21'
modified: '2026-06-21'
status: accepted
related:
  - '[[document-reader-hardening]]'
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (#adr) and one feature tag.
     modified: CLI-maintained; never hand-edit. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for the related: field above. -->

# \`document-reader\` adr: \`no-noise editorial reader rendering\` | (**status:** \`accepted\`)

The reader must render clean editorial titles and never leak markdown syntax or comments.

## Context and \`scope\` with **emphasis**

The body keeps its formatting, but **every heading** renders as plain text. <!-- TODO: this inline comment must vanish -->

> A heading is a deterministic function of its text — never of the markup around it.

### Sanitizing \`code:<path>\` placeholders

- **Comments** — \`<!-- ... -->\` blocks are stripped in read mode only.
- **Titles** — the \`{feature} {doctype}:\` prefix and \`| (status: ...)\` suffix are dropped.

\`\`\`typescript
// this fence is literal: the # and <!-- --> below must SURVIVE
export function laneOf(doc: DatedNode): Lane {
  return PIPELINE_LANE[doc.kind] // <!-- not a comment, real code -->
}
\`\`\`
`;
