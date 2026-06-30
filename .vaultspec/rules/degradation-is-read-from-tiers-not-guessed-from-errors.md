---
name: degradation-is-read-from-tiers-not-guessed-from-errors
---

# Degradation is read from the tiers block, not guessed from errors

## Rule

A stores-layer reader's degraded or offline state must be derived from the per-tier
`tiers` availability block the wire carries — from the success envelope, or from the error
envelope's tiers, with the FRESH error tiers winning over a stale held-success block —
never inferred from a bare transport error or timeout; any fallback must be gated on that
tiers truth.

## Why

The rag-search ADR (`2026-06-14-dashboard-rag-search-adr`) names this as the consumer-side
honesty law: a reader that guesses "offline" from a bare fetch failure or timeout lies
about availability, because a transport error is not the same fact as a backend tier being
down, and a stale held-success `tiers` block must not outrank a fresher error that reports
the tier gone. This is the consumer-side corollary of
`every-wire-response-carries-the-tiers-block`: that rule binds the engine to EMIT the
block on every envelope (success and error); this rule binds the stores reader to READ it
and gate any fallback on it, so the two together close the loop from producer to consumer.
It held across the full adoption cycle — the search controller's semantic-offline gate
read tiers rather than transport state, and it generalizes to every rag-dependent reader
(discovery and future semantic features) without re-deriving the law per surface.

## How

- Good: the search controller marks itself semantic-offline only when the `tiers` block
  reports the search tier unavailable, reading tiers from the error envelope when the
  request fails and letting that fresh error truth override a previously held success.
- Good: a new rag-dependent reader gates its degraded fallback on the same `tiers` truth,
  inheriting the honesty law rather than re-deriving it from its own transport state.
- Bad: a reader catching a fetch rejection or timeout and rendering "offline" directly —
  it cannot tell "your request was malformed" from "the backend tier is down", and it can
  flap offline on a transient transport blip while the tier is actually healthy.

## Source

Rag-search ADR `2026-06-14-dashboard-rag-search-adr` (codification candidate; the ADR
flags the choice between a new rule and a consumer-side corollary of the sibling rule).
Held across the `2026-06-14-dashboard-design-adoption` cycle. Sibling rule
`every-wire-response-carries-the-tiers-block` (the producer-side obligation this
completes); `dashboard-layer-ownership` (the stores layer is the sole wire client that
reads `tiers`).
