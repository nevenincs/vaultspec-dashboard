---
tags:
  - '#adr'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
related:
  - "[[2026-06-27-rag-affordance-adoption-research]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `rag-affordance-adoption` adr: `adopt rag's machine-global pointer and version-tolerant JSON start` | (**status:** `accepted`)

## Problem Statement

rag shipped two broker-facing affordances (the `rag-broker-affordances` change): a
STATUS_DIR-independent machine-global discovery pointer beside the machine lock, and an
idempotent `server start --json`. The engine should adopt both so its discovery is robust to a
non-default rag STATUS_DIR and its start surfaces rag's authoritative failure reason. The
engine's `rag-service-management` work already recorded the first as a planned follow-up ("if
per-scope isolation is ever required, switch to a STATUS_DIR-independent machine pointer ...
coordinated with rag first"); rag has now shipped the pointer, so the coordination is done. The
second carries a hazard: the engine's spawn path runs `server start`, and a rag that predates
the affordance REJECTS `--json` on that verb, so a naive adoption would break the engine
against any currently-released rag. This ADR decides how to adopt both safely - the pointer as
an additive discovery candidate, and the `--json` start version-tolerantly so it never breaks
against an older rag.

## Considerations

- The discovery candidate is **purely additive and tolerant**: `discover_at` tries each
  candidate and skips a missing one, so adding the storage-parent pointer is a no-op against a
  rag that does not write it, and a robustness win against one that does (or one using a
  non-default STATUS_DIR).
- The engine **already attaches idempotently via probe-first**: `start_rag_service` returns
  `already_running` from the machine probe WITHOUT calling `server start` when a service is up.
  So the `--json` start changes only the spawn path (genuinely absent -> start our own), and
  only its FAILURE branch (a non-zero exit) - the happy path is untouched.
- The `--json` start would otherwise impose a **hard cross-repo release ordering** (deploy
  only after the rag affordance ships). A version-tolerant fallback removes that ordering: try
  `--json`, and if an older rag rejects the unknown option, retry the start without it. The PR
  then merges safely against any rag version.

## Constraints

- **Parent stability.** Depends on the shipped engine `start_rag_service`/`run_rag_lifecycle_capture`,
  `rag_start_args`, `service_json_candidates`/`discover_at`, and the rag-side affordances (the
  pointer is shipped; `--json` start is shipped on the rag side but not yet in a release - the
  version-tolerant fallback makes that irrelevant). No frontier risk: a candidate-list addition
  and a try-then-fallback spawn.
- **rag CLI is an external cross-repo contract.** The engine version-tolerates: it never
  assumes `--json` is accepted, and it parses rag's `{ok, command, error, data}` envelope only
  when present, degrading to the existing re-probe inference otherwise.
- **engine-read-and-infer / discovery tolerance.** The engine adds no lifecycle semantics; a
  missing/garbled candidate or a non-envelope start output is truthful absence, never an error.
  `cargo fmt` + `clippy -D warnings`; unit tests with the existing fixtures; no mocks.

## Implementation

Three decisions.

**D1 — Add the storage-parent pointer as the first discovery candidate.** Prepend
`~/.vaultspec-rag/qdrant-server/service.json` (the rag machine-global pointer, anchored to the
machine-global Qdrant storage and thus STATUS_DIR-independent) to `service_json_candidates`,
ahead of the existing `~/.vaultspec-rag/service.json` (STATUS_DIR default) and the per-scope
fallback. The precedence comment is updated to record that the previously-deferred
STATUS_DIR-independent pointer is now adopted. `ServiceInfo`/heartbeat logic is unchanged - the
pointer carries the same discovery payload.

**D2 — Version-tolerant `--json` start.** Append `--json` in `rag_start_args`. On the spawn
path, if the start exits non-zero AND the captured output is a typer unknown-option rejection
of `--json` (an older rag), retry the start once WITHOUT `--json` and continue with today's
logic. This makes the adoption safe against any rag version - no release ordering.

**D3 — Surface rag's authoritative failure reason when present.** On a genuine non-zero exit
(not the unknown-option fallback), parse the captured stdout as rag's `{ok:false, error, data}`
envelope and lift the stated reason (`machine_owned` with the holder pid, `port_in_use`,
`qdrant_missing`) into the engine's degraded start envelope. A non-envelope/garbled output
falls back to the existing bounded re-probe inference, so the change only ever ADDS precision,
never removes the current behavior.

## Rationale

The decisions follow the research (F1-F5) and the engine's existing seams. The pointer adoption
(D1) is the follow-up the engine's own discovery comment recorded, now unblocked by the shipped
rag pointer, and it is additive/tolerant so it cannot regress. The version-tolerant fallback
(D2) is the key move: it converts a hard cross-repo release ordering into a runtime
try-then-fallback, so the PR merges safely against any rag and the engine self-heals across the
rag rollout. Lifting rag's stated failure reason (D3) is a modest precision gain confined to the
spawn-then-fail branch (the engine already attaches idempotently via probe-first), and it
degrades to today's inference, so the risk is bounded.

## Consequences

- **Gains.** Discovery is robust to a non-default rag STATUS_DIR (the machine-global pointer is
  consulted first). The engine surfaces rag's authoritative start-failure reason instead of
  inferring it. Both land in one PR that is safe to merge against any rag version, with no
  release-ordering coupling.
- **Honest difficulties.** The unknown-option detection (D2) is a heuristic over rag's typer
  error text; a false negative simply leaves `--json` on (a real failure already), and a false
  positive triggers a no-`--json` retry that reaches the same failure - both converge to
  today's outcome, so the blast radius is nil. The `--json` start's added value is modest
  because probe-first already attaches; the discovery candidate (D1) is the higher-value half.
- **Pathways opened.** Once the engine reads rag's structured start envelope, the console can
  render the precise reason (machine owned by pid N, port in use); once the machine pointer is a
  candidate, the engine could later prefer it and treat the STATUS_DIR file as the per-config
  detail.
- **Pitfalls to avoid.** Passing `--json` WITHOUT the fallback (breaks older rag); preferring
  the per-scope file over the machine-global pointer (discovery must stay machine-first);
  treating a non-envelope start output as a hard error instead of degrading to the re-probe.

## Codification candidates

- **Rule slug:** `cross-repo-cli-adoption-is-version-tolerant`.
  **Rule:** When the engine adopts a new flag or output shape on a sibling CLI it shells out
  to, it must version-tolerate - try the new flag and fall back to the prior invocation if the
  sibling rejects it, and parse the new structured output only when present, degrading to the
  prior behavior otherwise - so the engine never breaks against a sibling version that predates
  the feature and needs no cross-repo release ordering.

(Holds one full execution cycle before promotion, per the codify discipline. Complements
`engine-read-and-infer` and the rag-side `broker-facing-cli-outcomes-are-structured-and-idempotent`.)

<!-- Example:

- **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
