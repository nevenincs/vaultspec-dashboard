---
tags:
  - '#audit'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-status-overview-adr]]"
---



# `status-overview` audit: `Status-overview right rail — engine /history + dumb Status tab`

## Scope

Holistic code review of the `status-overview` feature on branch `feat/review-rail-viewers` (commits for engine P01 and frontend P02-P03), against the accepted ADR as the contract. Audited the one engine addition (the bounded read-only `/history` route plus the `subject` field on the git-log walk), the stores layer (history query + adapter + location-anchor selector + degradation derivation), the mock fidelity, the dumb Status tab, and the refined rail tab IA. Verified against the project rules: engine-read-and-infer, every-wire-response-carries-the-tiers-block, bounded-by-default-for-every-accumulator, graph-queries-are-bounded-by-default, dashboard-layer-ownership, degradation-is-read-from-tiers-not-guessed-from-errors, mock-mirrors-live-wire-shape, themes-are-oklch / warmth-lives-in-tokens, icons-from-two-families, and views-are-projections-of-one-model. The review was performed by the executor adopting the code-reviewer discipline (the Task dispatch tool was unavailable in this session).

## Findings

### Safety (No-Crash)

No CRITICAL or HIGH safety findings.

- The `/history` route is panic-free on untrusted input: `Workspace::discover` and `log::walk` failures are matched and routed to a tiered 400 (`history_degraded`), never `unwrap`/`expect` on the result. The only `expect` calls are in the shared `tiers_block` serialization (an infallible serialize of a static block, the established pattern across every route).
- The limit is clamped at creation (`requested.min(MAX_HISTORY_LIMIT)`), so a hostile `limit=usize::MAX` cannot trigger an unbounded walk. `usize` deserialization rejects negatives.
- The commit subject sourcing tolerates an empty/whitespace message (`unwrap_or_default`) — no panic on a subjectless commit.
- The stores `useNodeHistory` query is `enabled`-gated on a resolved scope; the adapter is fully tolerant (absent body → empty list + empty tiers; malformed row dropped), so no thrown adapter reaches the dumb tab.

### Intent & Correctness

- **PASS — plan-derived model, not connections.** Open work is read from the `/pipeline` `in_flight` projection's plan artifacts and the `/plan-interior` step tree, exactly as the ADR pins; no graph-density or edge-recency signal is used. The "connections" section is correctly absent (the ADR non-goal).
- **PASS — the one engine gap closed as the recommended new route.** `GET /history?scope=&limit=N` returns `{commits:[{hash, short_hash, subject, ts, node_ids}], truncated?}` newest-first, the ADR's recommended shape (the optional `author` is omitted, which the ADR marks optional). The `subject` datum — previously the self-flagged gap — is now on the wire, sourced from gix's message summary.
- **PASS — reuse over reinvention.** The location anchor composes `/status` + `/map`; open work reuses `/pipeline` + `/plan-interior`; the step-tree dropdown and progress ring are the existing Work-pillar components, now exported and reused rather than duplicated. Plan rows open the plan in the existing markdown reader via the existing `openInViewer` intent.
- **PASS — rail IA refined per the ADR.** Tabs are Status (primary) | Inspect | Search | Changes; the Work pillar's in-flight plans fold into Status; the four-tab law is honored (no fifth tab), Changes/Search retained. Default tab is Status.

### Architecture & rules

- **PASS — engine-read-and-infer.** `/history` reads commit metadata over the git object DB only; no write, no ref mutation, not a general `git log` surface (bounded last-N with subjects). It is registered as a GET behind the same router middleware as the rest.
- **PASS — every-wire-response-carries-the-tiers-block.** The success body uses the shared `envelope(...)`; the degrade path builds tiers through `degraded_tiers_for(cell, "structural", reason)`; the unknown-scope path 400s through `validate_scope` → `api_error` (tiers attached). No hand-built tiers-less body. The route test asserts the tiers block on both the success and the bad-scope error.
- **PASS — bounded-by-default.** The route carries a hard `MAX_HISTORY_LIMIT` ceiling with an honest `truncated` clamp block; the stores query is bounded with an explicit `gcTime` and a single-entry-per-(scope,limit) shape.
- **PASS — dashboard-layer-ownership + degradation-from-tiers.** The stores layer is the sole client of `/history`; `deriveHistoryView` reads the `structural` tier (fresh error tiers winning over a stale block) and the StatusTab consumes only stores selectors — it fetches nothing and reads no raw `tiers`. The location anchor is likewise a stores selector, so the dumb tab never iterates `map.data.repositories`.
- **PASS — mock-mirrors-live-wire-shape.** The mock `/history` serves the live field shape (newest-first, subject, correlated node_ids, the same default + ceiling clamp), and the fidelity test feeds it through the same `adaptHistory` client path the app uses. A separate live-shape tolerance test exercises `adaptHistory` on a captured-shape body (sparse `short_hash`, malformed row dropped).
- **PASS — themes / warmth / icons.** Every StatusTab color is a `--color-*` token class (no raw hex; the theme-parity test asserts no inline hex across light/dark/HC and identical structural DOM). Icons are Lucide (structural: FolderGit2, GitBranch, chevrons, Activity) and Phosphor (domain: GitCommit, ListChecks) — the two sanctioned families only.
- **PASS — views-are-projections-of-one-model.** Status is a projection over existing model reads plus the one new bounded history query; no new node model, no per-view fetch.

### MEDIUM / LOW

- **LOW-1 (consistency):** `history_degraded` and the `walk` error path echo the gix/discover error string verbatim into the response `error` field. The shared `revision_error` helper deliberately sanitizes gix error strings because they can leak the build machine's cargo-registry path. The `/history` error string is the human `error` field (not the client-rendered tiers reason) and mirrors `content.rs`'s `Unreadable` branch (same verbatim echo), so this is consistent with the established pattern — but both content and history would benefit from the same sanitization `revision_error` applies. Not blocking; a follow-up could route substrate-read errors through a shared sanitizer.
- **LOW-2 (dead-but-exported):** `WorkTab` is no longer mounted as a tab; it remains in the tree solely as the home of the reused `PlanStepTree`/`ProgressRing` exports (and retains its own passing render test). This is intentional (avoids a larger extract-to-shared-module refactor mid-feature) and harmless, but a future tidy could move the two shared components into a neutral module and retire the unused `WorkTab` shell.

## Recommendations

- Ship as-is: no CRITICAL/HIGH findings; both LOW items are optional follow-ups, not merge blockers.
- Consider a future shared substrate-error sanitizer covering `content.rs` and `history.rs` (LOW-1).
- Consider extracting `PlanStepTree`/`ProgressRing` into a neutral shared module and retiring the `WorkTab` shell when the rail surfaces are next touched (LOW-2).

## Status

PASS — no Critical/High issues; safe to merge. Both findings are LOW (optional follow-ups).

## Codification candidates

- **Source:** the plan-derived open-work model honored across the engine projection, the stores query, and the dumb tab. **Rule slug:** `open-work-is-read-from-plan-steps-not-graph-density` (the ADR's own candidate). **Rule:** any surface reporting "what is being worked on" / open or in-flight work derives it from plan-document step state (the engine's `in_flight`/`progress` and `plan-interior` checkbox projection), never from graph connectivity, edge recency, or transport state. Per the codify discipline this is a candidate only — promote after the boundary has held across at least one full cycle (this is its first encounter, not yet a rule).


