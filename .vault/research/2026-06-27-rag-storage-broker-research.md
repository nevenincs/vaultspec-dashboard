---
tags:
  - '#research'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace rag-storage-broker with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `rag-storage-broker` research: `broker rag destructive storage verbs through the bounded CLI runner`

The engine already brokers rag's READ-only storage survey (`GET /storage/survey` via
`control::storage_survey`, surfaced as the `storage-survey` read verb and the
Rust-aggregated `ops-state` rollup). What it cannot do is ACT on what the survey shows:
rag's destructive storage verbs - `server storage delete <prefix>`, `server storage prune`, `server storage migrate <root> --to <backend>` - have no HTTP route (rag closed
the destructive storage HTTP routes deliberately; the CLI is their only surface), so the
console can see orphaned/oversized namespaces but has no brokered way to reclaim them.
This research grounds adding those destructive verbs to the engine's brokered surface
through the bounded CLI subprocess runner, with the validated-argument injection guard the
git proxy already models, the dry-run discipline the project mandates, and the
exit-1-with-envelope handling the rag CLI requires - so the operations console can reclaim
storage against the single-machine multi-tenant store as safely as it reads it.

## Findings

### F1 — The read is brokered; the destructive surface is the gap

`routes/ops.rs` brokers rag storage in two shapes today: the HTTP READ
(`RAG_READ_VERBS` includes `storage-survey` → `control::storage_survey`, plus the
`ops-state` size/orphan rollup derived in Rust), and the CLI LIFECYCLE
(`RAG_CLI_WHITELIST` = `server start/stop/status/doctor/install`, bare-arg tuples run
through `run_sibling_bounded`). The destructive storage verbs are in neither: they are
not HTTP (rag exposes no route) and not in the CLI whitelist. The console's reclaim path
is missing.

### F2 — rag's destructive storage CLI surface, as shipped

- `server storage delete <prefix> [--yes|-y] [--dry-run] [--json] [--allow-unknown]` -
  deletes ONE namespace by its canonical `r{hash}_` prefix. Without `--yes` it previews
  (`would_remove`) and EXITS 1; `--allow-unknown` permits deleting an unattributable
  prefix (dangerous).
- `server storage prune [--yes|-y] [--dry-run] [--json]` - reclaims EVERY orphaned
  namespace (source root gone); never touches `unknown`/`live`. Without `--yes` it
  previews and exits 1 if it found targets.
- `server storage migrate <root> --to <server|local> [--yes|-y] [--dry-run] [--json]` -
  copies a root's namespaced collections between the local and server backends. Takes a
  ROOT path argument and a backend enum.

All three are MACHINE-scoped operations on the single shared store (delete/prune span
every project's namespaces; migrate is per-root), consistent with the single-seat model.

### F3 — The injection-guard precedent already exists

`routes/ops.rs`'s git proxy is the model for forwarding VALIDATED arguments to a bounded
subprocess: `git_args_for` assembles the argv from a fixed verb base plus
caller-supplied values that each pass a `validate_*` guard (`validate_diff_path`,
`validate_rev`) BEFORE the subprocess spawns, rejecting `-`-prefixed option injection, the
`--end-of-options` smuggling, and traversal. The destructive storage broker reuses this
exact discipline: the `delete` prefix is validated against rag's canonical
`^r[0-9a-f]{12}_$` regex; the `migrate` root is the engine's active-scope cell root (never
a caller-supplied path, closing the traversal vector the same way reindex's `project_root`
is engine-controlled); `--to` is a `server|local` enum; the dry-run/apply flags are typed
booleans. A value that fails validation 400s before any subprocess.

### F4 — Exit-1-with-envelope is the load-bearing handling detail

rag's destructive verbs emit their JSON result envelope and THEN exit 1 on a non-applied
preview (`would_remove`) or a refusal - the same pattern the original cross-project audit
named as the lifecycle runner's exit-1→502 flattening (finding C1). `run_sibling_bounded`
(the lifecycle runner) treats ANY non-zero exit as a 502 gateway fault and DISCARDS
stdout, so it would turn a perfectly valid "would_remove" preview into an opaque gateway
error. The engine already has the right runner: `run_sibling_write_bounded` inspects
stdout on exit-1 and, when it parses to a JSON object carrying a `status` field, forwards
it VERBATIM as a business outcome rather than an error. The storage broker must route
through a stdout-inspecting runner (that write runner with no stdin body, or a sibling of
it), so a preview/refusal is a forwarded envelope and only a genuine spawn/timeout/crash is
a 502. The rag `--json` storage envelope's top-level shape (whether it carries a top-level
`status` the runner keys on, or nests it under `data`) must be confirmed in the plan and
the runner's inspection adapted if needed.

### F5 — Dry-run discipline maps cleanly onto rag's own gating

The project's dry-run rule (preview destructive verbs before applying) and rag's own
`--yes`-gating compose: the brokered route DEFAULTS to preview (`--dry-run`) and requires
an explicit `apply: true` in the request body to pass `--yes`. So a console "reclaim"
button previews first (rag returns `would_remove`/the prune candidate list with reclaimable
bytes), and only a second, explicit confirm applies. `--allow-unknown` is NOT exposed -
deleting an unattributable namespace is a foot-gun an operator must take to the rag CLI
directly; the brokered surface stays on the safe (`live`/`orphaned`-attributed) path.

### F6 — Transport split and machine-scoping

This is purely CLI-subprocess (rag's deliberate design), so it does NOT touch
`rag-client`'s HTTP control module - the destructive verbs are a new entry in the CLI
whitelist plus a validated-arg route, parallel to the lifecycle verbs. delete/prune are
machine-scoped (the route does not derive them from the active `project_root`; the console
must frame them as machine-level reclaim, like `server stop`); migrate is per-root and
sources its root from the active scope cell. The bounded runner's 120s/8 MiB ceilings and
kill-on-timeout already fit a storage op (a prune of a large orphaned set is the slow
case, well under 120s).

### F7 — Engine conventions and placement

- A new `RAG_STORAGE_CLI_WHITELIST` (or an extension of the lifecycle whitelist) maps
  `storage-delete`/`storage-prune`/`storage-migrate` to their fixed base args; a typed
  request body carries the validated `prefix` (delete), `to` backend (migrate), and the
  `apply` boolean; the route validates, assembles argv (git-proxy style), and runs the
  stdout-inspecting bounded runner. Forbidden verbs 403 before any subprocess.
- `engine-read-and-infer`: the engine forwards a validated request to the sibling that
  OWNS the destructive op (rag's CLI); it persists nothing, decides no storage policy, and
  forwards rag's envelope verbatim. `subprocess-calls-carry-cap-and-timeout` is inherited
  from the bounded runner. Tests use the existing `FakeTransport`/short-bound injection and
  argv-assembly assertions; no mocks of rag itself.

### F8 — Scope boundaries

- **In scope:** the destructive `storage-delete`/`storage-prune`/`storage-migrate` CLI
  broker, the prefix/backend/apply argument validation, the dry-run-default + explicit-apply
  gating, the stdout-inspecting runner wiring so exit-1 previews forward as envelopes, and
  tests (argv assembly, prefix rejection, dry-run default, exit-1 envelope forwarding).
- **Out of scope:** the READ survey (already brokered); `--allow-unknown` (deliberately
  not exposed); any rag change (the CLI surface is shipped); the frontend console UI (the
  mandate is the engine broker; the console consumes it next); HTTP brokering of these
  verbs (rag has no route by design).
- **Open question for the ADR:** whether delete/prune live under the existing POST
  `/ops/rag/{verb}` namespace (a fall-through after the HTTP-control verbs, like the
  lifecycle verbs) or a dedicated `/ops/rag/storage/{verb}` route; and the exact rag
  `--json` top-level envelope shape the stdout-inspecting runner keys on.
