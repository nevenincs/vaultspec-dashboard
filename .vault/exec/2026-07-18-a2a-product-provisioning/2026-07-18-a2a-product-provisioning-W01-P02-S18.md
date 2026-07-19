---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S18'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Prove stop, repair, remove, data preservation, descendant cleanup, and bounded timeout outcomes against the real A2A desktop capsule and ## Scope

- `engine/crates/vaultspec-product/tests/lifecycle_ownership.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove stop, repair, remove, data preservation, descendant cleanup, and bounded timeout outcomes against the real A2A desktop capsule

## Scope

- `engine/crates/vaultspec-product/tests/lifecycle_ownership.rs`

## Description

- Add the `lifecycle_ownership` acceptance test that runs against a REAL built
  A2A desktop capsule, gated on capsule availability (`VAULTSPEC_PRODUCT_CAPSULE`
  or the conventional `dist/capsules/<target>.zip`) with an explicit
  skip-with-reason when absent — never a silent pass, never faked data.
- Verify the capsule: parse the embedded `component-manifest.json` and
  `parse_and_verify` it against the committed component lock, then re-derive every
  asset digest from the capsule bytes and confirm it matches the manifest.
- Add the real, in-ownership-scope file operations the proofs drive:
  `LifecycleController::remove(typed_data_removal)` (delete generations + receipt
  + credentials; preserve mutable data unless typed) and `repair_immutable`
  (replace an immutable generation file from pristine bytes, path-validated to
  stay under the generation), plus `ProductPaths::data_dir`.
- Prove the ownership outcomes: extract the capsule's OWN bundled CPython, launch
  a real gateway+worker process tree from it, and assert stop + descendant
  cleanup + bounded-timeout force-kill; assert mutable data preserved across the
  stop; assert remove preserves data unless typed; assert repair restores an
  immutable file without touching mutable data.

## Outcome

Against the real `x86_64-pc-windows-msvc` capsule the manifest verifies against
the component lock and every asset digest matches; a real gateway tree launched
from the capsule's bundled CPython 3.13.5 is stopped and its worker descendant
cleaned up within the graceful bound (force-killed, no orphan); mutable user data
survives stop and untyped removal and is cleared only on typed removal; repair
restores a corrupted immutable file from pristine capsule bytes without touching
data. All three proofs pass; with no capsule they skip-with-reason.

## Notes

The built capsule holds verbatim SOURCE archives (per the producer's build
script, environment setup is the install wave's responsibility), so the
manifest-declared `Scripts/vaultspec-a2a.exe` console script does not yet exist
without a full venv install (W03). The proof therefore launches the capsule's
REAL bundled interpreter through the production spawn/terminate code to exercise
the ownership outcomes S18 targets; the full console-script launch lands with the
install wave. Capsule<->lock verification PASSED with no drift on any lock-pinned
field (target, identity version 0.1.0, ACP/CPython/Node digests); the lock pins
no a2a-distribution wheel digest and the manifest carries no source commit, so a
HEAD-vs-locked-commit drift is not detectable from the manifest alone. Added
dev-only `zip`/`tar`/`flate2` for real capsule extraction; the shipped crate
gains no dependency.
