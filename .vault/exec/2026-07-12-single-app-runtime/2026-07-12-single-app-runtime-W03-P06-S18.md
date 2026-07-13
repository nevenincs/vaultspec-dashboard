---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S18'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Author and serve the Content-Security-Policy header against the embedded SPA's actual inline needs, verified in the live-wire suite across embedded and disk-passthrough asset sources

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Serve the Content-Security-Policy on every response, authored against the embedded SPA's actual needs: same-origin everything, `style-src 'unsafe-inline'` (pre-hydration boot-shell island + React style attributes), `img/font data:`, `worker 'self' blob:`, `frame-ancestors 'none'`, no eval.
- Extend `every_response_carries_the_static_security_headers` to pin each directive and forbid `unsafe-eval`.

## Outcome

CSP lands router-wide; the deferred source-comment task is closed; 724 api tests green.

## Notes

First literal used backslash line-continuations that CRLF mangled into padded spaces — rewritten as `concat!` segments; the extended test caught it.
