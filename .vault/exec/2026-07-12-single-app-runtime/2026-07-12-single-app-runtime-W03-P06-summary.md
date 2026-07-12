---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W03.P06` summary

All four Steps (S18-S21) complete, committed across `97b69126aa`, `853fec9c8a`, `4524f1cb25`, `71d042ffc5`.

- Modified: `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`, `engine/crates/vaultspec-cli/src/main.rs`
- Created: `docs/application-runtime.md`, `engine/crates/vaultspec-api/src/boot.rs`, `engine/crates/vaultspec-api/src/discovery.rs` (module-size decomposition)

## Description

Hardening, update coordination, and closeout. CSP now rides every response, authored against the embedded SPA's actual inline needs and pinned by test. `vaultspec update` orders stop, the receipt-gated axoupdater sidecar, and relaunch, refusing package-manager installs with their manager's remediation. A seated default-port conflict falls back to an ephemeral bind so a double-click works beside a dev engine. Runtime docs cover launch, the seat rule, lifecycle verbs, the app home inventory, and uninstall. Gate: engine workspace clippy -D warnings clean, fmt clean, 727 api lib tests + all integration suites + the 3-test boot matrix green; frontend eslint/px/prettier/tsc/tokens/figma-names green and 2919/2920 vitest tests passing — the single failing test and the one module-size baseline breach both belong to a PARALLEL session's uncommitted work (`git-changes-summary` query family, `authoring.ts` +4 lines), outside this feature's lanes. Release dry-run: the embed-spa binary built and served the embedded SPA workspace-less with live CSP; update-refusal, seat status, attach/conflict, and graceful stop verified end to end on Windows.
