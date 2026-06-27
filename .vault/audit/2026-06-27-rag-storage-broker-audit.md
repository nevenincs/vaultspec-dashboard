---
tags:
  - '#audit'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
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

# `rag-storage-broker` audit: `code review verification`

## Scope

Verify-phase review of the `rag-storage-broker` feature: the destructive-storage CLI
whitelist, the `validate_namespace_prefix` injection guard, the `storage_args_for` argv
assembly and dry-run gating, the `is_rag_envelope`/`storage_outcome` exit-1 handling, the
`run_storage_sibling_bounded` runner, and the `ops_rag_storage` route. The review focused
on the SECURITY of a destructive brokered surface (argument injection, engine-controlled
paths, `--allow-unknown` exclusion, whitelist gating), the dry-run-default correctness
against rag's `--json ⇒ --yes` contract, and the exit-1-with-envelope forwarding. Verdict:
ship.

## Findings

- **Injection guard: PASS (airtight).** `validate_namespace_prefix` admits only the
  canonical 14-char `r{12-lowercase-hex}_`; a `-`-prefixed value, traversal, whitespace,
  and shell metacharacters are all non-hex and rejected (and argv is passed via
  `tokio::process::Command`, no shell). The `migrate` root is sourced only from the active
  cell, never a body field; `--allow-unknown` is in no assembly path; the caller `verb` is
  used only for the whitelist lookup, never pushed into argv; an unknown verb 403s before
  any spawn.
- **Dry-run default: PASS.** `--yes` is always passed (rag's `--json` requires it) and
  `--dry-run` is added unless `apply: Some(true)`; `None`/`Some(false)`/absent-body all
  preview. The default is genuinely preview.
- **Exit-1 envelope: PASS.** `is_rag_envelope` keys on top-level `ok`+`command` (rag nests
  `status` under `data`); `storage_outcome` forwards a parsed envelope on any exit (a
  `would_remove` preview exits 1 yet forwards) and 502s only an unparseable/empty stdout
  with a non-zero exit. A crash cannot forge success; a valid preview cannot become a 502.
- **Bounded runner: PASS.** Spawn-bounds-kill matches the sibling write runner
  (timeout→504, cap→502, wait-reap, no zombie, no unbounded read).
- **Route: PASS.** `/ops/rag/storage/{verb}` (4-seg) cannot collide with `/ops/rag/{verb}`
  (3-seg); delete/prune are machine-scoped; the route is bearer-gated (the
  every-contract-route-requires-a-bearer test now covers it).
- **Low (addressed): the 120s reindex timeout over a destructive apply-mode migrate/prune.**
  A `prune` of a large orphaned set or an apply `migrate` of a big store can exceed the
  reindex budget, and the 120s bound would kill it mid-flight.
- **Low (acknowledged, parity): stderr is piped but not drained** (shared with both sibling
  runners; degrades to a 504, never a hang); and `cell_root` via `to_string_lossy` for an
  exotic non-UTF-8 worktree path (engine-controlled, no security impact). Nits: the
  defense-in-depth `_ =>` arm in `storage_args_for` is unreachable via the route, and
  extraneous body fields are silently ignored.

## Recommendations

The Low timeout finding was fixed in the same feature branch before merge: a dedicated
`STORAGE_SIBLING_TIMEOUT` (300s) replaces the 120s reindex bound for the storage runner -
generous enough for a large prune/migrate, still bounded so a wedged op cannot pin a worker
(a breach kills the child and 504s). A killed apply `migrate` is recoverable (it is a COPY
to the other backend, never source loss), noted in the constant's doc.

The remaining Lows are accepted: the stderr-drain is a cross-cutting property of all three
sibling runners (a fix belongs in a separate change to keep them in parity, and it degrades
to a 504 rather than a hang); `to_string_lossy` and the unreachable arm are harmless. The
strict-body-rejection nit is a possible future hardening, not a defect.

## Codification candidates

- **Source:** the ADR decision plus the airtight-injection-guard and dry-run-default
  findings.
  **Rule slug:** `brokered-destructive-verbs-validate-args-and-default-to-preview`.
  **Rule:** Every destructive sibling verb the engine brokers must validate each
  caller-supplied argument against a fixed guard before the subprocess spawns (and source
  any path from the engine-controlled scope, never the caller), default to the sibling's
  dry-run/preview mode unless the request explicitly sets apply, and forward the sibling's
  result envelope verbatim on a non-zero preview exit rather than flattening it to a
  gateway fault.

Per the codify discipline, this holds one full execution cycle before promotion (first
encounter). The natural promotion occasion is the next destructive sibling verb the engine
brokers reusing this pattern. Promote with
`vaultspec-core vault rule promote --from 2026-06-27-rag-storage-broker-audit --as brokered-destructive-verbs-validate-args-and-default-to-preview`.

<!-- Findings that satisfy the three durability criteria
(cross-session, constraint-shaped, project-bound) and should be
promoted into project-shared rules under `.vaultspec/rules/rules/`
via `vaultspec-core vault rule promote --from <this-audit-stem>
--as <rule-name>`.

Each candidate names the finding it derives from, the proposed
rule slug (kebab-case, naming the constraint's subject not the
failure), and a one-sentence statement of the rule.

Most audits produce zero codification candidates. Some produce one.
Only the rare framework-wide-pattern audit produces several. If
none of the findings above meet the bar, state that explicitly and
move on -- an empty Codification candidates section is a positive
signal, not a failure. -->

<!-- Example:

- **Source:** finding S04 (destructive verbs lack preview).
  **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
