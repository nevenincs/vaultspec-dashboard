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
