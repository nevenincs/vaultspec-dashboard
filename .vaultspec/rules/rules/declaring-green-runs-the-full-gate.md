---
name: declaring-green-runs-the-full-gate
---

# Declaring green means running the full lint gate, not a partial subset

## Rule

Before reporting a change "green", committing it, or routing it to review, run
the FULL lint gate for the touched language — `just dev lint frontend` (eslint +
prettier + tsc) or `just dev lint all` — and confirm exit 0. A partial run
(`npm run lint`/eslint only, or `cargo clippy` without `cargo fmt --check`) is
not a green gate, and "my partial checks passed" is never "closed".

## Why

Across the dashboard-gui build and the engine-hardening drive, prettier-dirty
commits passed executor "green" claims at least three times (fe-chrome's task #6
control components, the engine-hardening conformance test) because the executor
ran `npm run lint` (ESLint only) and skipped `format:check`. The lead's own
"439 green" verification once missed it the same way. Each slip cost a
withhold + re-check round-trip. The `just dev lint` recipes bundle
eslint+prettier+tsc (and Rust fmt+clippy) precisely so a partial invocation
cannot produce a false green; the discipline only works if the full recipe is
the thing actually run.

## How

- **Good:** run `just dev lint frontend` (or `just dev lint all`), see exit 0
  including the prettier `format:check` and Rust `cargo fmt --check` steps, then
  commit / declare green / ping the reviewer.
- **Good (reviewer):** the review gate runs the full recipe independently; a
  prettier-dirty or rustfmt-dirty file is a withhold regardless of how clean the
  logic is — the format step is part of the gate, not a nicety.
- **Bad:** `npm run lint` → "eslint clean, green" → commit. ESLint passing while
  `format:check` fails is the exact false-green that keeps recurring.

## Status

Active. Promoted after the pattern recurred a third time (engine-hardening
conformance test committed prettier-dirty, 2026-06-13). The `just dev lint`
recipes already bundle the steps; this rule binds running the bundle.

## Source

Dashboard GUI + engine-hardening cycle: task #6 prettier withhold, the lead's
missed format:check on the "439 green" check, and the engine-hardening
conformance-test prettier-dirty commit (the third recurrence). Sibling rule
`review-revision-precedence`.
