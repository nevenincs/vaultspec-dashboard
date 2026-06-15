---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S13'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Amend the contract reference section five with the chosen lineage wire shape

## Scope

- `.vault/reference/2026-06-12-dashboard-foundation-reference.md`

## Description

- Amend contract reference section five with the chosen lineage wire shape: the `GET /graph/lineage?scope&from&to&filter=` endpoint, the `{nodes[], arcs[], truncated?}` response, the dated-node and arc field sets, the derivation graceful-fallback note, the document-node-ceiling bound, the self-consistency invariant, and the present-only-semantic tiers behavior on success and error.
- Keep the section five style and voice (the existing bullet/sub-bullet amendment idiom); leave every other section untouched.

## Outcome

Section five now names the lineage endpoint, params, response, bounded/self-consistent semantics, and the tiers-on-both-envelopes contract, consistent with the W01.P02 implementation.

## Notes

Body-prose edit of a reference document (permitted). The amendment is marked with the dashboard-timeline ADR / W01.P02 provenance the way the prior section-five amendments are dated and attributed.
