---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:1d484b76fd6bea1c7bc6448735499091d5b8d0b7b9d96e3de6af92fb204b2b21'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# `design-system-consolidation` audit: `s08 scanner test review`

## Scope

Independent review of `scan-design-system.test.ts` against `W01.P02.S08`, the
accepted design-system consolidation ADR and ledger, and the scanner/fixture
contracts delivered by S06-S07. The review covers exact fixture finding codes,
mutation sensitivity, deterministic report ordering and JSON shape, the clean
production baseline, fail-closed malformed inputs, repeated native-site
bindings, relative-value parsing exceptions, ownership rules, facade forms,
campaign invariants, and the frozen scene fingerprint. Production and scene
sources are outside the change scope.

## Findings

### s08-scene-freeze | high | The production test is red because the fingerprint depends on moving HEAD

The independent focused run failed 1/5 tests. `reports the accepted production baseline` expected a clean report and fingerprint `30817224d9b653c7858a39d9a7458252dbca682f`, but the scanner returned `scene-freeze-drift" and the empty-diff hash `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`. Current scene source has no worktree diff after unrelated scene work entered HEAD, demonstrating that hashing `git diff` does not prove byte identity to the immutable S179 worktree preimages. The test detects the failure but cannot be accepted red. The scene guard must compare current bounded scene bytes and path union to the captured worktree preimages (including originally untracked files), with the compact historical diff fingerprint retained only as provenance.

Resolution: `verifySceneFingerprint` now validates the S179 baseline schema and
bounded source scope, compares the exact current path union, byte lengths,
SHA-256 hashes, and base64 byte preimages against every captured worktree
preimage, and reports missing, unexpected, or changed scene sources. The
historical Git diff hash remains report provenance only, so a moving HEAD no
longer changes the freeze contract. A controlled altered-preimage mutation now
proves `scene-freeze-drift` can go red without modifying scene source.

### s08-failure-mode-coverage | medium | Several scanner failure codes have no negative fixture

The suite strongly covers 19 fixture cases, exact unique code sets, deterministic results/JSON shape, malformed source and naming shape, repeated native binding loss, compound cqw/calc and exclusions, both layer directions, deep-import growth, four facade forms, and invariant mutations. However, S08 claims all ledger and ownership failure modes while no fixture or direct mutation asserts `ledger-schema`, `ledger-stale`, `native-baseline`, `relative-exception-stale`, or `relative-value-stale`. Scene fingerprint drift also lacks a controlled mutation test; it surfaced only accidentally through the moving-HEAD defect above. Add isolated mutations for these codes and assert exact unique finding sets and deterministic ordering.

Resolution: the formal suite now applies isolated production-ledger and scanner
policy mutations for `ledger-schema`, `ledger-stale`, `native-baseline`,
`relative-exception-stale`, and the paired `relative-value-missing` /
`relative-value-stale` comparison. Each mutation asserts its exact unique code
set; the scene baseline mutation completes the negative freeze coverage.

## Recommendations

- Replace the moving-HEAD scene comparison with the S179 byte-preimage contract, then make the production scanner and focused test green without regenerating the baseline.
- Add the missing ledger/baseline/staleness mutations before calling S08 complete; keep each fixture minimal enough that its expected code set names only the intended failure family.

Both recommendations were implemented. Post-correction evidence: the direct
production scanner is clean; the fixture harness remains 19/19; focused Vitest
passes 6/6; TypeScript, ESLint, Prettier, and the full frontend lint recipe pass.
Independent re-review is pending.

Independent evidence: the fixture harness passed 19/19, `git diff --check` passed, and TypeScript declarations match the exercised public API. The focused Vitest suite failed 1/5 and the direct production scanner currently exits nonzero on scene-freeze-drift, so full green cannot be reported.

Status: REQUEST CHANGES.

Independent re-review confirmed both resolutions against the current worktree. The production scanner now remains clean after the unrelated scene changes entered HEAD because it compares the current bounded `.ts`/`.tsx` path union and each file's byte length, SHA-256, and base64 bytes to S179 worktree preimages. A supplied baseline with one altered SHA produces exactly `scene-freeze-drift`; missing, unexpected, malformed, and changed entries are all fail-closed in the same verifier. The historical `30817224d9b653c7858a39d9a7458252dbca682f` value remains provenance rather than mutable-state enforcement.

The added isolated mutations produce the exact requested code sets for `ledger-schema`, `ledger-stale`, `native-baseline`, `relative-exception-stale`, and paired `relative-value-missing`/`relative-value-stale`. Existing assertions continue to cover deterministic order and JSON shape, malformed input, repeated native bindings, compound cqw/calc parsing, unitless/comment/raw-defect exclusions, import ratchets, layer direction, facade forms, and invariant fences.

Independent post-fix evidence: direct production scan PASS; fixture harness 19/19 PASS; focused Vitest 6/6 PASS in 57.68 seconds; `git diff --check` PASS; and full `just lint frontend` PASS through ESLint, localization, px, domain, module size, Prettier, TypeScript, token drift, and Figma names. No package wiring or production/scene source edit belongs to S08.

Re-review status: PASS.
