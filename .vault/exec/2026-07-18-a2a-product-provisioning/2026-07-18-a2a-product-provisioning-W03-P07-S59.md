---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S59'
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
     The S59 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Parse the one-time owner-restricted descriptor outside the active release, acquire the installation lock before any drain or mutation, execute or recover the ordered transaction without delegating lock ownership to the gateway, redact secrets, and return bounded diagnostics and ## Scope

- `engine/crates/vaultspec-updater/src/main.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Parse the one-time owner-restricted descriptor outside the active release, acquire the installation lock before any drain or mutation, execute or recover the ordered transaction without delegating lock ownership to the gateway, redact secrets, and return bounded diagnostics

## Scope

- `engine/crates/vaultspec-updater/src/main.rs`

## Description

- Implement the copied external updater executable entrypoint in `main.rs`: parse exactly one operand — the owner-restricted descriptor path — and refuse any missing or extra operand (no free-form executable or path operands).
- Delegate to the S58 runner (`run`), which acquires the installation lock BEFORE any drain or mutation, never delegates lock ownership to the gateway, and executes or recovers the ordered transaction.
- Classify the outcome into a stable, closed exit-code set (0 ok, 2 usage, 3 busy, 4 descriptor, 5 failed) and emit a bounded, secret-free diagnostic (the `UpdaterError` Display is bounded and never contains descriptor text or credentials).
- Add unit tests for the executable dispatch: missing-operand and extra-operand usage errors, absent-descriptor descriptor error, and the closed exit-code classifier.

## Outcome

Delivered `src/main.rs`. `cargo test -p vaultspec-updater` (4 main + 5 runner), `clippy --all-targets -D warnings`, `fmt --check` all exit 0. Unsafe-free.

## Notes

The fresh-update EXECUTE swap and the prior-seat relaunch SPAWN are deliberately not invoked here: the swap is the materializer's activation seam, and the relaunch spawn is the S60 relaunch-orchestration piece (the descriptor carries the validated `RelaunchSpec`, but spawning the seat couples to how S60 sets up copy-out/seat-exit and, for a post-swap launch, to which generation the launcher resolves). This executable is the parse/run/classify shell; S62 exercises it as a real binary. No faked swap, no scaffolds.
