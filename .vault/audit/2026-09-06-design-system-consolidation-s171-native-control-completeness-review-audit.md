---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:f06c8360de1d849afa77cfe06295b43a42c07ffc91d168d976de93315e92aefe'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S171 native-control completeness test review`

## Scope

The S171 syntax-aware native-control completeness test was audited against the
accepted consolidation decision, the 125-site ledger, and live app/platform JSX.
Review covered baseline enumeration, stable source matching, false-positive
exclusion, schema enforcement, and canonical-owner validation.

## Findings

### source-identity-binding | high | Repeated sites were matched by independently derived ordinals

The initial test discarded each ledger identity's semantic slot and synthesized
occurrence ordinals independently for source and ledger arrays. Replacing one
control with another under the same path, owner, and element group could therefore
pass the missing/stale comparison.

Resolution: explicit `DUPLICATE_SITE_BINDINGS` now binds every repeated semantic
slot to its reviewed AST occurrence and asserts the live repeated-site cardinality.
The same Sol reviewer re-ran the focused test and full frontend lint and returned
PASS with no remaining finding.

### canonical-owner-resolution | medium | Existing owners were not proved to exist

The initial validation checked only canonical-owner vocabulary and string shape, so
a nonexistent existing path or misspelled owner name could pass.

Resolution: existing canonical-owner paths are now resolved on disk and their
declared function, class, type, variable, method, or registry-property names are
verified through the TypeScript AST. Planned owners remain explicitly exempt. The
same Sol reviewer re-ran the focused test and full frontend lint and returned PASS
with no remaining finding.

## Recommendations

- Keep repeated-site bindings explicit whenever a source owner contains multiple
  native controls of the same element type.
- Continue resolving every canonical owner marked `existing` to both a live file
  and a declared symbol; reserve the exemption for owners marked `planned`.
