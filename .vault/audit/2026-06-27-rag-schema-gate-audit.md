---
tags:
  - '#audit'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace rag-schema-gate with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `rag-schema-gate` audit: `code review verification`

## Scope

Verify-phase review of the `rag-schema-gate` feature: the `HealthInfo.schema_version`
field, the pinned engine constants, the `/readiness` descriptor extractor, the
`storage_schema_supported` gate, and the two-stage wiring in the embedding handler. The
review cross-checked the engine's extractor paths and constants against rag's shipped
contract (the `/health` `schema_version`, the `/readiness` `schema` descriptor, and
`assert_compatible`), traced additivity and fail-closed behavior, and ran the engine's
fmt/clippy/test gates. Verdict: ship.

## Findings

- **Contract fidelity: PASS (cross-repo verified).** The engine's `/health`
  `schema_version` field and the extractor paths (`schema.version`,
  `schema.vault.vectors.dense.{name,dim}`) byte-match rag's wire shape; the pinned
  `DENSE_VECTOR_NAME`/`EXPECTED_DENSE_DIM`/`KNOWN_STORAGE_SCHEMA_VERSION` equal rag's
  `store_schema` constants; the gate rules match `assert_compatible` (version strict
  `>`, name `== "dense"`, dim `== expected`).
- **Additivity: PASS.** A pre-contract rag (`schema_version: None`, no `schema` block)
  is not degraded - Stage 1 passes, Stage 2 is skipped (no `/readiness` round-trip), the
  scroll proceeds unchanged.
- **Panic-tolerance: PASS.** The extractor is all `.get(...).and_then(...)`; no nested
  access can panic on a missing/mistyped field.
- **Round-trip discipline: PASS.** The `/readiness` read happens only when
  `schema_version.is_some()` and the cheap version gate passes.
- **Medium (addressed): the Stage-2 gate could pass vacuously when a contract IS
  advertised but the descriptor omits its version.** The original
  `storage_schema_supported` re-derived "contract advertised" from the descriptor and
  treated a missing version as baseline-compatible, so a contract-advertising rag (per
  `/health`) whose descriptor lacked a parseable version would pass rather than fail
  closed - a divergence from rag's "no integer version → refuse" recipe (real-world
  reachability ~nil since one `store_schema` source serves both endpoints, impact
  benign, but a fail-closed-fidelity gap).
- **Low (acknowledged): per-request `/readiness` round-trip (no verdict cache); the
  fail-closed-on-readiness-flap asymmetry vs the freshness-epoch's tolerate-and-serve;
  and the composition test covering the gate path rather than the un-mockable async
  handler.** All consistent with the ADR.

## Recommendations

The Medium was fixed in the same feature branch before merge: `storage_schema_supported`
now takes an `advertised: bool` (threaded from the `/health` `schema_version`); when a
contract is known advertised, a descriptor missing its version (or name, or dim) is a
fail-closed degrade matching rag's recipe, while the additive pre-contract path
(`advertised = false` and an empty descriptor) is preserved. A unit test pins the new
fail-closed case, and the wiring passes `advertised = true` (it only runs inside
`schema_version.is_some()`).

The Lows are accepted as recorded in the ADR: a `/readiness` verdict cache keyed on rag
process identity is a possible follow-up if the round-trip shows in profiling; the
fail-closed asymmetry is intentional (schema is a correctness gate, the epoch a freshness
optimization) and is now noted in the wiring comments.

## Codification candidates

- **Source:** the ADR decision plus the M1 fail-closed finding.
  **Rule slug:** `direct-qdrant-reads-gate-on-the-advertised-schema`.
  **Rule:** Any engine read that reaches into rag's Qdrant store directly must gate on
  rag's advertised storage-schema contract (the `/health` `schema_version` and the
  `/readiness` descriptor's dense vector name and effective dimension) against the
  engine's pinned known-version and expected-dimension constants before reading, and
  degrade the semantic tier with the mismatch stated - failing closed when a contract is
  advertised but the descriptor is incomplete, and passing additively only when no
  contract is advertised at all.

Per the codify discipline, this holds one full execution cycle before promotion (first
encounter). The natural promotion occasion is the next direct-Qdrant read the engine adds
(e.g. the deferred code-chunk embeddings) reusing the same gate. Promote with
`vaultspec-core vault rule promote --from 2026-06-27-rag-schema-gate-audit --as direct-qdrant-reads-gate-on-the-advertised-schema`.

<!-- Findings that satisfy the three durability criteria
(cross-session, constraint-shaped, project-bound) and should be
promoted into project-shared rules under `.vaultspec/rules/rules/`
via `vaultspec-core vault rule promote --from <this-audit-stem>
--as <rule-name>`.

Each candidate names the finding it derives from, the proposed
rule slug (kebab-case, naming the constraint's subject not the
failure), and a one-sentence statement of the rule.

Most audits produce zero codification candidates. Some produce one.
Only the rare framework-wide-pattern audit produces several. If
none of the findings above meet the bar, state that explicitly and
move on -- an empty Codification candidates section is a positive
signal, not a failure. -->

<!-- Example:

- **Source:** finding S04 (destructive verbs lack preview).
  **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
