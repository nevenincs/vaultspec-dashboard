---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:224b8b6ddd44fe09f97c387b77ea96297cf39ab494a374d20f3cfa404c9422ca'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S05 campaign invariants review`

## Scope

Reviewed exact Step `W01.P01.S05`: the invariant evidence schema, six campaign invariants in `consolidation-ledger.ts`, and their focused tests in `consolidation-ledger.test.ts` against the accepted consolidation ADR, research, shipped blueprint, plan, and the architecture, wire-contract, design-system, and production/dev rules. Production and scene implementation remained read-only; unrelated graph and scene work stayed outside scope.

The ledger has exactly the required ID/boundary pairs in the declared boundary order: `scene-source-byte-freeze`/`scene-source`, `graph-semantics-freeze`/`graph-semantics`, `store-policy-preservation`/`store-policy`, `wire-contract-preservation`/`wire-contract`, `responsive-mode-preservation`/`responsive-mode`, and `no-figma-campaign-evidence`/`figma-exclusion`. Each statement is limited to the accepted presentation-consolidation campaign and remains independently enforceable: scene files bind to saved worktree bytes; graph meaning and scene behavior remain frozen; stores retain policy while presentation mappings may move; wire vocabulary and sole-client ownership remain fixed; responsive behavior stays on the two existing classes and 40rem threshold; and Figma is excluded from this campaign's evidence without weakening its separate long-term authority.

The evidence-path union admits only normalized repository-relative `frontend/`, `.codex/`, and `.vault/` paths. Runtime validation rejects wrong roots, backslashes, empty/current/parent path segments, and empty owner or slot values before producing a collision-safe JSON tuple key. All 18 current evidence identities are unique and resolve to live files. Every TS/TSX evidence owner is a real declaration: `SceneController`, `SceneCommand`, `DashboardState`, `settingsControlValue`, `deriveFilterSidebarMenuSections`, `EngineClient`, `EngineNode`, `ViewportClass`, and `AppShell`. Document evidence points to the accepted decisions or governing rules rather than restating external evidence.

The scene invariant is concretely linked to `scene-freeze-baseline.json`, its `SceneController` record, and the current Git-diff fingerprint. Independent verification reproduced fingerprint `30817224d9b653c7858a39d9a7458252dbca682f`; current `sceneController.ts` SHA-256 is `f6f40105f1f05718ab3a1a6ee34b4c127fad4aa2236bd49a490c34223b27bc9f`, equal to the stored worktree hash. The no-Figma test requires all three parts of the accepted fence: no capture/inspection evidence, no parity claim, and no supersession of design authority.

Independent verification passed: the focused `consolidation-ledger.test.ts` suite passed 13/13, including exact-set, uniqueness, live-path, declaration, baseline-linkage, fingerprint, and no-Figma assertions. `git diff --check` passed. Full `just lint frontend` exited 0 across ESLint, localization, px, domain, module-size, Prettier, TypeScript, token-drift, and Figma-name gates. S05 changes are confined to development ledger/test evidence; the pre-existing scene dirt remains unchanged by fingerprint.

## Findings

### s05-campaign-invariants | low | The frozen boundaries are precise and evidence-linked

No corrective finding surfaced. The statements preserve the accepted contracts without claiming that presentation consolidation proves design parity or forbidding the explicitly authorized relocation of visual mappings out of stores. Evidence identities are stable semantic locators rather than line numbers, and the test suite pins the exact boundary set while checking live repository grounding. The scene test supplies immediate baseline linkage and drift detection; the plan's later S192 byte comparison remains the terminal whole-tree non-interference proof.

## Recommendations

- Keep the six invariant IDs and meanings stable when S06 turns the ledger into a ratcheting guard; any widening of a frozen contract should remain a separately reviewed contract event.
- Preserve S192 as the final full-union byte comparison against stored worktree preimages, including added, removed, modified, and pre-existing untracked scene sources; the compact diff fingerprint is linkage evidence, not a substitute for that final proof.

Status: PASS.
