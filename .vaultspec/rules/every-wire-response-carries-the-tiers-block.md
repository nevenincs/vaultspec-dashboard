---
name: every-wire-response-carries-the-tiers-block
---

# Every wire response carries the tiers block, through the shared envelope helper

## Rule

Every response the engine emits on any front door — success and error, CLI `--json`
and HTTP — must carry the per-tier degradation block, and must be constructed through
the API layer's shared envelope helper; hand-built response bodies are forbidden.

## Why

The tiers block is the contract's truthfulness mechanism
(`2026-06-12-dashboard-foundation-reference` §2): clients render absent tiers as
designed degraded states, never as errors, so a response without the block makes the
GUI lie about availability. During the engine build the same omission shipped
independently on *both* wire surfaces — the CLI envelopes (P10 review, tiers-less
error envelopes in the 9-item fix set) and the HTTP routes (P11 review) — which is
the strongest evidence the constraint must bind future agents structurally rather
than rely on per-route vigilance. The shared-helper requirement is what turns the
rule from a checklist item into a compiler-shaped guarantee.

## How

- **Good:** a new HTTP route returns `envelope(data, state)` and gets the tiers
  block, host validation context, and error shaping for free; a new CLI verb wraps
  its payload with the same helper behind the shared query core (D6.1).
- **Good:** an error response (unknown scope, validation failure) still carries the
  tiers block — the client can distinguish "your request was wrong" from "a backend
  is down" without guessing.
- **Bad:** `Json(json!({"ok": false, "error": ...}))` built inline in a route
  handler — it compiles, it ships, and the GUI renders a healthy-looking error with
  no degradation truth attached. Both 2026-06-12 cycle instances were exactly this
  shape.

## Status

Active. The shared helper exists in `vaultspec-api`; reviews enforce that no route
or verb bypasses it.

## Source

Engine cycle audit `2026-06-12-vaultspec-engine-audit` (P10 fix set, P11 fix set,
codification candidate 2). Contract reference
`2026-06-12-dashboard-foundation-reference` §2 (tiers degradation block on every
response).
