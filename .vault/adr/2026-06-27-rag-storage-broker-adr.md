---
tags:
  - '#adr'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
related:
  - "[[2026-06-27-rag-storage-broker-research]]"
---

# `rag-storage-broker` adr: `broker rag's destructive storage verbs through the bounded CLI runner` | (**status:** `accepted`)

## Problem Statement

The engine brokers rag's READ-only storage survey (the `storage-survey` HTTP verb and the
Rust-aggregated `ops-state` rollup), so the operations console can SEE orphaned and
oversized per-root namespaces in rag's single shared Qdrant store. It cannot ACT on them:
rag's destructive storage verbs - `server storage delete <prefix>`, `server storage prune`,
`server storage migrate <root> --to <backend>` - have no HTTP route (rag deliberately closed
the destructive storage HTTP routes; the CLI is their only surface), and the engine's CLI
whitelist is process-lifecycle-only. So the console can diagnose storage but offers no
brokered reclaim, leaving the operator to drop to the rag CLI by hand. This ADR decides how
the engine brokers those destructive verbs through its bounded CLI subprocess runner -
safely (validated arguments, dry-run-first, machine-scoped framing) and faithfully (rag's
exit-1-with-envelope previews forwarded as outcomes, not gateway faults).

## Considerations

- **rag's transport split is deliberate.** The survey READ is HTTP (a running service serves
  it); the destructive verbs are CLI-only by rag's design (the destructive HTTP routes were
  closed). So this is a CLI-subprocess broker, parallel to the lifecycle verbs - it does NOT
  touch `rag-client`'s HTTP control module.
- **Destructive verbs carry an argument surface, so an injection guard is mandatory.** The
  git proxy (`git_args_for` + `validate_*`) is the established model: a fixed verb base plus
  caller values that each pass a guard before the spawn, rejecting `-`-prefixed option
  injection and traversal. The `delete` prefix, the `migrate` backend enum, and the apply
  flag are validated; the `migrate` root is engine-controlled (the active scope cell), never
  caller-supplied.
- **These are MACHINE-scoped operations on the single shared store.** delete/prune span
  every project's namespaces (a prune reclaims all orphaned namespaces machine-wide);
  migrate is per-root. The console must frame delete/prune as machine-level reclaim, like
  `server stop`, not a per-project action.
- **rag emits its result envelope and THEN exits 1 on a non-applied preview.** The lifecycle
  runner flattens any non-zero exit to a 502 and discards stdout (the original audit's C1),
  which would turn a valid `would_remove` preview into an opaque error. The write runner
  inspects stdout on exit-1 but keys on a TOP-LEVEL `status` string; rag's storage envelope
  is `{ok, command, data:{status}}` (status nested under `data`), so the write runner's key
  does not match. A storage-aware inspection is required.

## Constraints

- **Parent stability.** Depends on the shipped engine ops proxy (`routes/ops.rs` bounded CLI
  runner, the git-proxy validation pattern, the `run_sibling_write_bounded` stdout
  inspection), the already-brokered survey read, and rag's shipped `server storage`
  CLI - all stable. No frontier risk: this is a new validated-arg CLI broker over an existing
  runner.
- **rag CLI is an external cross-repo contract.** The verb names, the `--yes`/`--dry-run`
  gating, and the `{ok, command, data}` `--json` envelope are rag's; the engine forwards the
  envelope verbatim and version-tolerates, never re-deriving rag's storage policy.
- **engine-read-and-infer / subprocess-calls-carry-cap-and-timeout / dry-run discipline.**
  The engine persists nothing and decides no storage policy; the bounded runner's 120s/8 MiB
  ceilings and kill-on-timeout apply; preview is the default and apply is explicit.
- **Security weight.** This adds a DESTRUCTIVE brokered surface on a shared machine resource;
  the argument validation and the dry-run-default are load-bearing, not cosmetic. `--allow-unknown`
  is out of scope (a foot-gun reserved for the rag CLI).

## Implementation

Five decisions.

**D1 — A destructive-storage CLI whitelist, brokered through the bounded subprocess runner.**
Add `storage-delete` / `storage-prune` / `storage-migrate` mapping to their fixed rag base
args (`["server","storage","delete"]`, etc.), in a dedicated `RAG_STORAGE_CLI_WHITELIST` (a
sibling of the lifecycle `RAG_CLI_WHITELIST`, kept separate because these take validated
arguments and a destructive-verb gate the lifecycle verbs do not). They run on the same
bounded subprocess runner, never over HTTP.

**D2 — Validated arguments, git-proxy style; a 400 before any subprocess.** A typed request
body carries the `delete` prefix, the `migrate` `to` backend, and the `apply` boolean. The
prefix is validated against rag's canonical `^r[0-9a-f]{12}_$`; `to` is a `server|local`
enum; `apply` is a bool. The `migrate` root is the engine's active-scope cell root, never a
caller-supplied path (closing traversal exactly as the engine-controlled reindex
`project_root` does). Any value that fails validation 400s before the spawn; `--allow-unknown`
is never assembled.

**D3 — Dry-run is the default; apply is explicit.** The route always passes `--dry-run`
unless the body sets `apply: true`, in which case it passes `--yes`. So the console previews
first (rag returns `would_remove` / the prune candidate set with reclaimable bytes), and only
a second, explicit confirm applies - the project dry-run discipline composed with rag's own
`--yes` gating.

**D4 — A storage-aware stdout-inspecting runner forwards the rag envelope on exit-1.** The
runner parses stdout and, when it is a JSON object carrying rag's envelope shape (a top-level
`ok` boolean and `command` string), forwards it VERBATIM regardless of the exit code - so a
`would_remove` preview (which exits 1) is a forwarded business outcome, not a 502. Only an
unparseable/empty stdout with a non-zero exit, a spawn failure, a timeout, or a capped
runaway is a 502. This closes the C1 exit-1→502 flattening for the storage previews; it is
the write runner's discipline keyed on the storage envelope shape rather than a top-level
`status`.

**D5 — Machine-scoped framing for delete/prune.** The route does not derive delete/prune from
the active `project_root` (they are machine-global on the shared store); migrate sources its
root from the active cell. The brokered envelope and the console treat delete/prune as
machine-level reclaim. The engine adds no per-project storage semantics.

## Rationale

The decisions follow rag's deliberate transport split and the engine's existing patterns
(research F1-F7). The destructive verbs are CLI-only by rag's design, so a CLI-subprocess
broker (D1) is the only faithful shape, and it reuses the bounded runner the lifecycle verbs
already use. The argument surface forces the git-proxy injection guard (D2) - a destructive
verb with an unvalidated prefix or a caller-supplied migrate path is a real security hole,
which is why the prefix regex and the engine-controlled root are load-bearing. Dry-run-default
(D3) is the project's destructive-verb rule composed with rag's `--yes` gating, so the
brokered surface is preview-first by construction. The storage-aware runner (D4) is forced by
rag's emit-then-exit-1 contract and the write runner's mismatched `status` key; without it the
common case (a preview) would read as a gateway error - exactly the C1 flattening the original
audit named. Machine-scoping (D5) keeps the broker honest about the single-seat store.

## Consequences

- **Gains.** The console can act on what the survey shows - preview and reclaim orphaned
  namespaces, and migrate a root between backends - through one validated, dry-run-first,
  tiers-honest broker, closing the see-but-cannot-act gap. The exit-1 preview forwards as an
  envelope, so the operator sees `would_remove` with reclaimable bytes, not a 502.
- **Honest difficulties.** This is a destructive surface on a SHARED machine resource: a
  brokered `prune --yes` reclaims every orphaned namespace machine-wide, so the apply path
  must be explicit and the console framing unambiguous (a mis-framed per-project button over a
  machine-global prune is the pitfall). rag's `{ok, command, data}` envelope is an external
  contract; the runner forwards it verbatim and must not parse rag's storage internals. The
  exit-1-envelope handling is subtle and must be tested directly (a preview MUST forward, a
  real crash MUST 502).
- **Pathways opened.** Once the destructive broker and its dry-run-default exist, the console
  gains a full storage-management surface (survey → preview → reclaim), and any future rag
  storage verb slots into the same validated-arg/dry-run/envelope pattern.
- **Pitfalls to avoid.** Routing the destructive verbs through the lifecycle runner (the
  preview becomes a 502); exposing `--allow-unknown`; deriving delete/prune from the active
  project (they are machine-global); forwarding an unvalidated prefix or a caller-supplied
  migrate path (injection); or defaulting to apply instead of preview.

## Codification candidates

- **Rule slug:** `brokered-destructive-verbs-validate-args-and-default-to-preview`.
  **Rule:** Every destructive sibling verb the engine brokers must validate each
  caller-supplied argument against a fixed guard before the subprocess spawns (and source any
  path from the engine-controlled scope, never the caller), default to the sibling's
  dry-run/preview mode unless the request explicitly sets apply, and forward the sibling's
  result envelope verbatim on a non-zero preview exit rather than flattening it to a gateway
  fault.

(Holds one full execution cycle before promotion, per the codify discipline. Complements the
git-proxy read-only validation pattern and `engine-read-and-infer`.)
