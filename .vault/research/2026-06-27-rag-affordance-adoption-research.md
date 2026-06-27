---
tags:
  - '#research'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
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

# `rag-affordance-adoption` research: `adopt rag's machine-global discovery pointer and idempotent JSON start`

rag shipped two broker-facing affordances (the `rag-broker-affordances` change): an
idempotent `server start --json` that exits 0 with a structured `already_running` envelope,
and a STATUS_DIR-independent machine-global discovery pointer beside the machine lock. The
engine's `rag-service-management` work already anticipated both: it attaches to a running
service via the machine-global probe (so it never restarts what it does not own), and its
discovery comment explicitly recorded "if per-scope isolation is ever required, switch to a
STATUS_DIR-independent machine pointer ... coordinated with rag first." This research grounds
adopting the two affordances - adding the machine-global pointer as a discovery candidate,
and reading rag's authoritative start outcome - while respecting a hard cross-repo ordering
constraint the `--json` start introduces.

## Findings

### F1 — The discovery candidate adoption is safe and was pre-recorded

`rag_client::client::service_json_candidates` lists, in precedence order, the machine-global
`~/.vaultspec-rag/service.json` (the STATUS_DIR default) then the per-scope
`vault_root/data/search-data/service.json` fallback. The new rag pointer lives at the
storage parent (`~/.vaultspec-rag/qdrant-server/service.json`), which is truly
STATUS_DIR-INDEPENDENT (anchored to the machine-global Qdrant storage, like the lock), unlike
the existing `~/.vaultspec-rag/service.json` which is only machine-global when rag uses the
default STATUS_DIR. Adding the storage-parent pointer as the FIRST candidate makes discovery
robust to a non-default STATUS_DIR - the exact case the discovery comment flagged as needing
"a STATUS_DIR-independent machine pointer, coordinated with rag first" (now coordinated, the
pointer shipped). It is purely additive: `discover_at` already tries each candidate and skips
a missing one, so adding a candidate that is absent on a rag that predates the pointer is a
no-op, never a break.

### F2 — The engine already attaches idempotently via probe-first

`start_rag_service` probes `probe_machine_state` BEFORE running anything: a `Running` service
returns `already_running` + `attached: true` with pid/port WITHOUT calling `server start` at
all. So the audit's C1 (a start against a running service flattening to a fault) is already
solved engine-side - the engine never even issues the start when a service is up. rag's new
idempotent exit-0 is belt-and-suspenders for the case where the probe misses but the service
is actually up; it does not change the engine's happy path.

### F3 — The idempotent-`--json`-start adoption carries a HARD cross-repo ordering constraint

The engine's spawn path (genuinely absent -> start our own) runs `server start` through
`run_rag_lifecycle_capture`, which does NOT append `--json` (the lifecycle verbs were
`--json`-free precisely because rag REJECTED `--json` on `server start` through 0.2.25). rag's
new `--json` support lands only in the unreleased `rag-broker-affordances` change. So passing
`--json` to `server start` BREAKS against any currently-released rag (it exits non-zero on the
unknown option), which the engine would read as a failed start. This is a hard ordering
constraint: the `--json`-start adoption must not deploy until that rag change ships in a
release. The adoption is therefore gated - built and documented, but explicitly merge-ordered
after the rag affordance reaches a release.

### F4 — What `--json` start actually buys the engine

On the spawn path, the engine currently trusts exit 0 (started/already_running) and, on a
non-zero exit, re-probes with a bounded settle to distinguish a lost race (another owner) from
a genuine failure. With `--json`, a non-zero exit additionally carries rag's STATED reason -
`machine_owned` (with the holder pid), `port_in_use`, `qdrant_missing` - so the engine can
surface the authoritative cause in its degraded start envelope instead of inferring it from a
re-probe. The happy path (exit 0) is unchanged. This is a modest precision gain on the failure
path, gated on F3.

### F5 — Placement and shape

- Discovery candidate (safe, ship-now): add the storage-parent pointer to
  `service_json_candidates` as the first candidate, with the precedence comment updated to
  record that the previously-deferred STATUS_DIR-independent pointer is now adopted. The
  `ServiceInfo` parse and heartbeat-staleness logic are unchanged (the pointer carries the
  same discovery payload), so only the candidate list grows.
- `--json` start (gated on rag release): append `--json` in `rag_start_args`, and on the
  non-zero-exit branch of `start_rag_service` parse the captured stdout as rag's
  `{ok, command, error, data}` envelope to lift the stated reason into the degraded envelope.
  Tolerant: a non-JSON/garbled output falls back to the existing re-probe inference, so the
  change degrades to today's behavior rather than failing.

### F6 — Conventions

`engine-read-and-infer` (the engine forwards rag's outcome verbatim, adds no lifecycle
semantics); discovery tolerance (a missing/garbled candidate or envelope is truthful absence,
never an error); `cargo fmt` + `clippy -D warnings`; unit tests with the existing fixture
patterns (candidate-order assertions; the start-envelope parse over a JSON fixture). No mocks.

### F7 — Scope boundaries

- **In scope:** the machine-global discovery candidate (ship-now), and the `--json`-start
  authoritative-failure-reason adoption (gated on the rag affordance reaching a release).
- **Out of scope:** changing the engine's probe-first attach (already correct); any rag
  change (both affordances are shipped on the rag side); a frontend change (the console
  already renders the start/discovery envelopes).
- **Open question for the ADR:** whether to split the two into separate PRs (the discovery
  candidate ships immediately; the `--json` start waits on the rag release) or one PR with the
  ordering documented; and whether the `--json`-start parse degrades silently to the re-probe
  on a non-envelope output (lean yes - tolerant) or logs the anomaly.
