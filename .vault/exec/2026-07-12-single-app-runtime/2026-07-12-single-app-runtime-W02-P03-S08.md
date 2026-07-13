---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Add the browser-launch helper over the open crate (pinned, maintenance-verified) with the standard subprocess posture and a typed fallback that prints the tokenized URL when no browser opens

## Scope

- `engine/crates/vaultspec-cli/src/cmd/launch.rs`

## Description

- Add the `open` crate (5.4.0) and the `open_browser` helper in `engine/crates/vaultspec-cli/src/cmd/launch.rs`: `open::that_detached`, with the typed fallback printing the URL to stderr so a browserless host is never dead-ended.

## Outcome

Browser launch helper landed inside the launcher module; failures degrade to a printed URL.

## Notes

The URL carries no token (the SPA authenticates via the served meta injection), so printing it is safe.
