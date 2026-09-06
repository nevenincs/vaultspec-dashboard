---
tags:
  - '#adr'
  - '#project-provisioning'
date: '2026-07-07'
modified: '2026-09-06'
body_hash: 'sha256:26876cad4350680b6dfd3ae4479a100d66dbf281ead933fa470729df4410778b'
related:
  - "[[2026-07-07-project-provisioning-research]]"
  - "[[2026-07-04-dashboard-packaging-adr]]"
  - "[[2026-06-14-dashboard-workspace-registry-adr]]"
  - "[[2026-06-26-rag-service-management-adr]]"
---

# `project-provisioning` adr: `operator-invoked framework acquisition and provisioning plane` | (**status:** `accepted`)

## Problem Statement

Selecting or registering an active project can land the operator in a genuinely empty, non-vaultspec-managed repository. The workspace registry validates only git-ness on register — a root must resolve a git common dir and enumerate one worktree; vault presence is deliberately NOT a registration requirement (`workspace-registry-is-config-not-content`, F1). `GET /map` marks each worktree `has_vault` off `.vault/` presence (`engine/crates/vaultspec-api/src/routes/query.rs`), `validate_scope` 400s an unknown or non-vault scope by design (`engine/crates/vaultspec-api/src/registry.rs`), and the startup probe prints the exact `uv tool install vaultspec-core` remediation and serves degraded (packaging ADR, amended 2026-07-07). The dashboard therefore detects the unmanaged state honestly across three seams but offers no action on any of them: the remediation knowledge exists only as prose the operator must copy to a terminal. This ADR decides the backend architecture the frontend builds on to close that gap — framework ACQUISITION (machine-level tools via `uv`) and PROJECT PROVISIONING (install / upgrade / force re-install / migrate the framework into a target project) as explicit operator-invoked actions. It authorizes no implementation.

## Considerations

- **The empty-project state is detected, not actionable.** Three honest seams (`has_vault`, `validate_scope` 400, the startup remediation string) describe the gap; none can fix it. The remediation is a command the operator runs by hand.
- **The CLI verbs to broker already exist with a machine-readable contract.** `vaultspec-core install [PROVIDER] -t DIR` deploys the framework (`--upgrade`, `--force`, `--dry-run`, `--skip`, `--json`); `migrations status` / `migrations run` cover schema migration of an already-managed project; `spec doctor` and `vault check all` verify health. Sync-shaped results share the `vaultspec.sync.v1` vocabulary (`created`, `updated`, `unchanged`, `removed`, `restored`, `skipped`, `failed`) with an aggregate top-level `status` — a served, renderable contract the frontend consumes without inventing semantics (F3).
- **Machine-level acquisition is a third sibling class the engine has never spawned.** `uv tool install vaultspec-core` / `uv tool install vaultspec-rag` (and `--upgrade`) is not `vaultspec-core` and not `vaultspec-rag`; it is `uv`. Packaging's detect-and-instruct chose to probe-and-instruct for the Python companions and DEFERRED bundled-uv to v2; uv itself is never installed by us and offline/missing-uv remains an honest dead-end by decision (F2).
- **Engine boundary doctrine: broker the owning sibling, never write.** `engine-read-and-infer` forwards only whitelisted sibling verbs verbatim through `/ops/*` (`engine/crates/vaultspec-api/src/routes/ops.rs`): `CORE_WHITELIST` (read), `CORE_WRITE_WHITELIST` (the editor save verbs — precedent that FORWARDING a write to the sibling that OWNS it is inside the fence), and `RAG_STORAGE_CLI_WHITELIST` (destructive verbs with a validated argument, a dry-run/apply gate, and a generous-but-bounded 300s `STORAGE_SIBLING_TIMEOUT`). The authoring core adapter (`engine/crates/vaultspec-api/src/authoring/core_adapter.rs`) is the strongest precedent for engine-invoked MUTATING core verbs: a typed capability enum with deliberately NO wire-string→capability path (no `Deserialize`, no `FromStr`), project-pinned resolution via `CoreRunner::detect` (prefers the uv-managed core), every spawn carrying BOTH an output cap and a wall-clock timeout, Unix process-group kill, Windows outcome-indeterminate breach semantics, and wire-redacted errors (F4).
- **Registration must stay read-only.** The workspace-registry ADR explicitly fenced registration as config-not-content and named the standing risk: "register a project" must never grow into "clone / init / create a worktree". Provisioning therefore CANNOT ride the registration path (F1, F4).
- **rag enrollment is already solved; only tool acquisition is missing.** rag is a machine singleton the dashboard attaches to and never owns (rag-service-management D1–D3); per-project enrollment (register, reindex, watcher) and the `needs_install` → `server qdrant install` chain are the existing HTTP/CLI control plane. What is new for rag is only `uv tool install vaultspec-rag` and its floor re-probe (F5).
- **Long operations and probe staleness.** `uv tool install vaultspec-rag` downloads torch — multi-minute, multi-GB; a blocking HTTP verb under a fixed timeout is the wrong shape (rag's reindex is already job-based). Handshake probes are memoized per process lifetime (`OnceLock`, `engine/crates/vaultspec-api/src/handshake.rs`), so a post-acquisition upgrade is invisible to the running handshake without a refresh path (F2, F6).
- **Standing rules constrain the shape.** `every-wire-response-carries-the-tiers-block` and displayed/filterable-state-is-backend-served (the "is this managed / installable / migratable" projection is served, not client-inferred over `/map`); `bounded-by-default-for-every-accumulator` and `subprocess-calls-carry-cap-and-timeout` (a job registry is capped + TTL'd, every spawn cap+timed); `dashboard-layer-ownership` (stores is the sole wire client); `unified-action-plane` (provisioning verbs are `ActionDescriptor`s); `published-wheel-purity` (the session caveat below).
- **A load-bearing session caveat.** rag's own installer has re-added a runtime torch dependency to a host project's `pyproject.toml` before. That is direct evidence for keeping v1 acquisition at the `uv tool` (machine) level and NOT running project-venv `uv add` dependency flows (F6).

## Considered options

- **A dedicated fenced provisioning plane (`/provision/*`), authoring-adapter-style — CHOSEN.** A sibling module + route family holding a typed capability set, a served status projection, and a job registry. Costs a new plane to maintain; matches that provisioning targets non-servable scopes, is long-running, and is a coherent state machine.
- **Grow the existing `/ops/*` whitelists instead — rejected.** Reuses a proven broker, but `/ops/*` presumes a servable scope (a non-vault scope 400s there by design), presumes synchronous bounded verbs (uv+torch is multi-minute), and has no job shape; provisioning is a different animal wearing the same coat.
- **Auto-provision on select / register — rejected.** Zero-click fix, but it breaches the `workspace-registry-is-config-not-content` fence and the packaging ADR's no-speculative-action doctrine, and writes to a repository the operator only pointed at.
- **Synchronous blocking verbs under a fixed HTTP timeout — rejected.** Simpler wire, but a torch download blows any honest request budget; the correct shape is a tracked job with a polled status route, as rag's reindex already is.
- **Project-venv `uv add` dependency management in v1 — rejected.** Would let the dashboard manage a project's Python deps, but rag's installer has polluted a host `pyproject.toml` with runtime torch before (F6); v1 stays at machine-level `uv tool` acquisition where wheel-purity cannot regress.
- **Engine hand-writes the framework scaffold directly — rejected.** Fastest path, but a direct `engine-read-and-infer` fence breach; the engine must broker the sibling that OWNS the write, never write `.vault/`/`.vaultspec/` itself.
- **Bundle `uv` / the tool binaries — rejected here.** The packaging ADR already DEFERRED bundled-uv to v2; detect-and-instruct for uv stands, so acquisition is gated on a uv presence probe and instructs when absent rather than installing uv.
- **Include `uninstall` in v1 — rejected.** `vaultspec-core uninstall` is destructive (`--force`, optional `--remove-vault`); deferred out of v1 as the highest-blast-radius verb, revisited behind the same typed-confirm gate once install/upgrade have held.

## Constraints

- **No sibling code change is a precondition.** The plane brokers `vaultspec-core install`/`migrations`, `uv tool install`, and the existing rag control plane exactly as they ship today; any coordination ask (e.g. a richer install machine-pointer) is filed, never blocking.
- **uv is assumed external and never installed by us.** Acquisition is gated on a uv presence probe; a missing uv is an honest dead-end that instructs, mirroring the packaging ADR's offline/missing-uv posture. Bundled-uv stays a deferred packaging-ADR v2 item, not a dependency of this decision.
- **Windows kill-tree is outcome-indeterminate.** A Job Object is a dependency the project avoids (core_adapter precedent), so a timed-out/over-cap `uv`/`vaultspec-core` grandchild under the `uv run` launcher can survive on Windows; a breach is therefore outcome-indeterminate and MUST be followed by a status re-probe, never reported as a clean failure.
- **Torch-scale downloads dictate a generous-but-bounded budget.** The acquisition spawn ceiling is materially larger than the 120s core/editor budget and the 300s `STORAGE_SIBLING_TIMEOUT` (a first-run torch pull is minutes on a cold cache); it stays bounded so a wedged job cannot pin a worker forever, and pairs with an output cap.
- **Probe memoization is per-process and must gain a refresh path.** The `OnceLock` handshake floors do not reflect a just-completed upgrade; without an invalidation seam the UI reports stale floors after a successful acquisition. Adding that refresh path is in-scope for this feature.
- **Target paths are never free-form from the wire.** A provisioning target resolves only through the workspace registry / `/map` enumeration; the plane never accepts an operator-supplied absolute path off the wire, and never composes a path into argv from a wire string.
- **Parent-feature stability.** The plane composes with the already-accepted workspace registry (settled), rag-service-management (settled), and the packaging startup probe/handshake (settled, recently amended to warn-and-serve-degraded). Its one frontier edge is the `uv`-spawn class the engine has never exercised and the probe-refresh seam; both are additive, neither is a research-grade unknown.

## Implementation

High-level layering only; no plan.

- **D1 — A dedicated fenced provisioning plane, sibling to `/ops/*`, not whitelist growth.** A new provisioning module and `/provision/*` route family in `vaultspec-api`, following the authoring core-adapter discipline: a typed capability enum (install / upgrade / force-install / migrate / acquire-tool) chosen in Rust from a typed operation kind, deliberately NO wire-string→capability path and no free-form args ever. It sits beside the ops whitelists precisely because provisioning targets a directory that may NOT be a servable scope, is long-running/job-shaped, and forms a coherent state machine the flat `/ops/*` broker does not model.
- **D2 — Backend-served provisioning state, never client-derived.** `GET /provision/status` (per registered workspace / worktree target) serves one projection: git-ness, uv presence, uv-managed-project-ness (pyproject / uv.lock), tool-acquisition state (`vaultspec-core` / `vaultspec-rag` resolved version vs floor), framework install state (`.vaultspec/` present, provider set), vault presence, pending migrations (brokered `migrations status --json`), and rag enrollment (the existing control-plane `/projects`). It rides the `tiers` envelope like every response, so "is this project managed / installable / migratable / enrollable" is served truth the frontend reads, never inference over `/map`.
- **D3 — Every mutation brokers the OWNING installer verbatim; the engine writes nothing.** Project-level provisioning forwards `vaultspec-core install [PROVIDER] -t <target> --json` (+ `--upgrade`, `--force`, `--dry-run`) and `vaultspec-core migrations run`, with post-provision verification through existing `vault check` / `spec doctor` reads. Machine-level acquisition spawns `uv tool install [--upgrade] vaultspec-core|vaultspec-rag` — the new third sibling class (uv), gated on a uv presence probe; uv is never installed by us. rag PROJECT enrollment reuses the existing rag control plane unchanged; only tool acquisition is new. `uninstall` is out of v1. The engine forwards a body to the sibling that OWNS each write and persists nothing itself, exactly as `CORE_WRITE_WHITELIST` forwards editor saves.
- **D4 — Job-shaped execution.** Acquisition and install/upgrade run as tracked jobs: single-flight per target (and machine-wide for uv acquisitions, since one machine has one tool install), a bounded job registry (size cap + TTL, `bounded-by-default`), each spawn carrying BOTH an output byte cap AND a generous-but-bounded wall-clock (materially above `STORAGE_SIBLING_TIMEOUT`; uv+torch is multi-minute), captured bounded output, and a polled `/provision/jobs` status route — mirroring rag's reindex trigger/poll shape rather than a blocking verb. A breach kills the child and returns typed `Timeout`/`OutputTooLarge`; on Windows the outcome is indeterminate, so a breach forces a `GET /provision/status` re-probe before any result is reported, mirroring `core_adapter`.
- **D5 — Operator-invoked only; registration stays read-only.** Provisioning never fires on select or register — the `workspace-registry-is-config-not-content` fence and the no-speculative-action doctrine both stand. Force / overwrite verbs (`--force`, and later `uninstall`) require an explicit typed confirm gate, mirroring the rag storage dry-run/apply gate; a force with no confirm token is refused before any spawn. Targets resolve only through the workspace registry / `/map` enumeration — never a free-form wire path.
- **D6 — Post-provision reconciliation.** After a successful install / upgrade / acquisition the plane invalidates the memoized handshake probes (the `OnceLock` floors in `handshake.rs` gain a refresh path so the reported floor reflects the just-installed version), revalidates the target scope (a formerly non-vault scope becomes servable once `.vault/` exists), and bumps the served provisioning state; the frontend re-reads through stores. Without this seam the UI reports stale floors and a still-empty scope after a successful upgrade.
- **D7 — Frontend contract (build-on surface, specified here, not built here).** stores is the sole wire client for `/provision/*`; provisioning verbs are `ActionDescriptor`s on the unified action plane, not bespoke handlers; the empty-project state renders an honest "not a vaultspec-managed project" panel carrying the provision affordance; outcomes render from the served `vaultspec.sync.v1` vocabulary (`created` / `updated` / `unchanged` / `removed` / `restored` / `skipped` / `failed`, aggregate `status`) — no client-invented semantics. The panel degrades read from `tiers`, never guessed.

## Rationale

The research established that the unmanaged state is already detected honestly at three seams (F1) but dead-ends, and that the verbs to fix it already exist with a renderable machine contract (F3) owned by siblings the engine must broker rather than replace (F4). A dedicated `/provision/*` plane (D1) is chosen over whitelist growth because provisioning violates all three of `/ops/*`'s premises at once — it targets non-servable scopes, it is long-running, and it is a state machine — and because the authoring core adapter already proves the safe pattern for engine-invoked mutating core verbs: a typed, non-wire-addressable capability set with cap+timeout and redacted errors. Serving the provisioning projection (D2) rather than inferring it client-side follows displayed-state-is-backend-served directly and keeps the "installable / migratable" decision in the engine where the probe truth lives. Brokering the owning installer (D3) keeps the `engine-read-and-infer` fence intact — the same reasoning that lets `CORE_WRITE_WHITELIST` forward editor saves lets provisioning forward `vaultspec-core install` — while the new uv class is bounded to machine-level tool acquisition, deliberately excluding project-venv `uv add` because rag's installer has polluted a host `pyproject.toml` with runtime torch before (F6) and wheel-purity must not regress. Job-shaping (D4) is forced by torch-scale downloads (F6): rag already proved the trigger/poll shape, and resource-bounds requires the cap+timeout+registry-bound regardless. Operator-invoked-only (D5) preserves both the registry fence (F1) and the packaging ADR's no-speculative-action posture. The reconciliation seam (D6) closes the concrete staleness the research flagged in the memoized `OnceLock` handshake (F2). This AMENDS IN PART the packaging ADR's detect-and-instruct row — the instruction becomes actionable through an operator-invoked broker — while the startup posture (warn-and-serve-degraded, never auto-provision at startup) STANDS; it composes with, and supersedes nothing in, the workspace-registry and rag-service-management ADRs.

## Consequences

- **Gains.** The empty-project dead-end becomes a one-click, honestly-reported fix path: the operator acquires the tools and provisions the framework into a registered target without leaving the dashboard, and the formerly-degraded scope becomes servable in the same session. rag enrollment lights up on top of the already-solved control plane. The `vaultspec.sync.v1` vocabulary means outcomes render as served truth, not invented labels.
- **Costs and difficulties.** A whole new fenced plane, a typed capability set, a bounded job registry, and a probe-refresh seam are real surface to build and guard. The uv-spawn class is new to the engine and adds a machine-level side effect the engine has never had. Windows outcome-indeterminate breaches mean the plane must always be able to answer "did it actually take?" by re-probe rather than by exit code. Force and (deferred) uninstall carry blast radius that the typed confirm gate must hold across every path.
- **Risks.** The standing temptation is the same one the registry ADR named — provisioning growing toward clone/init/worktree-create, or toward project-venv dependency management that re-introduces the torch-pollution footgun; the codification candidate and the machine-level-only v1 fence guard against both. A target path that ever leaks in from the wire would be a fence breach; targets must stay registry-resolved. A missing-uv or offline machine remains an honest dead-end until bundled-uv (packaging v2), which the panel must state rather than hide.
- **Pathways opened.** Once the plane exists, `uninstall` (behind the confirm gate), a bundled-uv first-run bootstrap (packaging v2), and richer post-provision verification (surfacing `spec doctor` findings inline) layer on with no re-architecture. A served provisioning projection is also the natural home for a future "project health" rollup across the workspace registry.

## Codification candidates

- **Rule slug:** `provisioning-brokers-the-owning-installer-never-writes`.
  **Rule:** Framework provisioning and tool acquisition forward to the sibling that OWNS the mutation — `uv` for machine-level tool install, `vaultspec-core` for project install / upgrade / migrate, `vaultspec-rag` for enrollment — through a typed, non-wire-addressable capability set (no `Deserialize`/`FromStr` from the wire, no free-form args), job-shaped with an output cap AND a bounded wall-clock and a bounded/TTL'd job registry, operator-invoked and never speculative, with targets resolved ONLY through the workspace registry / `/map` enumeration. The engine writes no `.vault/` or `.vaultspec/` content and mutates no git itself; it brokers the owning installer, exactly as the ops write broker forwards editor saves. *(Candidate; promote only after the fence has held across one full execution cycle, paired with `engine-read-and-infer` and `workspace-registry-is-config-not-content`.)*
- **Rule slug:** `uv-tool-acquisition-is-machine-level-only`.
  **Rule:** Dashboard-driven tool acquisition installs/upgrades only machine-level `uv tool` entries (`vaultspec-core`, `vaultspec-rag`), gated on a uv presence probe; it NEVER installs uv itself and NEVER runs project-venv `uv add` dependency flows, so no acquisition can add a runtime dependency (e.g. torch) to a host project's `pyproject.toml` — preserving `published-wheel-purity`. A missing uv is an honest, instructed dead-end until bundled-uv lands. *(Candidate; pairs with the packaging ADR's detect-and-instruct posture.)*

## Amendment - Dashboard owns current-provider setup aggregation (2026-09-06, owner auto-approved decision)

**D8 - `setup` is one Dashboard-owned semantic operation.** The HTTP action
`setup` has no provider operand, and the CLI command is exactly
`vaultspec provision setup` with no provider argument. A request that combines
`setup` with a provider value is refused as an invalid shape. Dashboard alone
expands the operation, in the fixed deterministic order `core`, `claude`,
`antigravity`, `codex`. That list is the complete current project-setup set
for this Dashboard release; changing membership or order is a reviewed contract
change.

The expansion invokes four fixed provider-specific
`vaultspec-core install <provider>` operations. It never forwards, translates
to, or revives `vaultspec-core install all`, because Core's aggregate
membership is outside Dashboard's release contract. It never invokes or reports
Gemini. The retired Gemini provider has no setup alias, compatibility branch,
fallback, dormant receipt, or future activation obligation.

**D9 - the expansion is one bounded single-flight aggregate with preserved
child identity.** One target may have at most one setup aggregate in flight,
covering both recommended and force setup. An identical duplicate attaches to
the existing aggregate. A request with a different force posture receives a
typed conflict naming the active aggregate; it does not start a second writer
and does not attach as if the operations were equivalent. Force setup retains
the existing typed confirmation gate and applies `--force` to each of the four
provider-specific operations.

The aggregate owns one wall-clock deadline and one output budget across the
ordered sequence, in addition to bounded child-process execution and the
bounded, TTL-pruned job registry. It retains a receipt for each provider with
the provider identity, ordinal operation identity, attempted/not-attempted
state, owning Core receipt or bounded failure, and reconciliation result.
Definitive failure of one provider does not erase receipts for the others.

The aggregate terminal vocabulary is closed to:

- `complete`: all four authoritative provider receipts prove success.
- `partial`: at least one provider has a definitive failure and no provider
  remains ambiguous; successful and failed receipts stay individually visible.
- `timeout_cancelled`: the aggregate deadline expired, the active child was
  cancelled and reaped with a definitive cancellation result, and every
  unattempted provider is identified as such.
- `indeterminate`: termination, output, read/wait, or post-operation evidence
  cannot prove whether one or more provider mutations completed.

A timeout or ambiguous child result is never blindly replayed. The broker
reconciles each affected provider from its authoritative Core receipt and the
fresh served project/provisioning status. It reports the reconciled aggregate
when those facts decide the result and otherwise remains `indeterminate` with
the unresolved provider identities. A later operator retry begins only after
that reconciliation and normal single-flight settlement.

**D10 - every project-wide setup affordance uses D8/D9.** The backend-served
recommended setup action and the explicit force setup action both dispatch the
provider-less `setup` operation. Neither substitutes a core-only install,
constructs four unrelated frontend requests, accepts `all`, or selects a
provider client-side. Stores remain the sole wire client and render the served
aggregate and per-provider receipts without inventing completion semantics.

## Amendment - bind setup to the current Core install contract (2026-09-06, owner auto-approved correction)

This amendment corrects D3, D7, D8, and D9 where they described install
receipts using the generic `vaultspec.sync.v1` vocabulary or left the additive
multi-provider command shape implicit. The project-locked Core producer and
live disposable-target captures establish the current contract below.

**D8a - exact supported producer sequence.** Dashboard expands `setup` in the
fixed D8 order into these current Core operations:

1. `vaultspec-core install core -t <target> [--force] --json`
2. `vaultspec-core install claude -t <target> [--force] --json --skip core`
3. `vaultspec-core install antigravity -t <target> [--force] --json --skip core`
4. `vaultspec-core install codex -t <target> [--force] --json --skip core`

`--skip core` is Core's supported additive provider-install path after the
first operation has established the framework. A live clean-target proof
completed this sequence in both safe and force posture. It produced no
`install all` command and did not consume or expose unrelated provider metadata.
Changing these operations requires another reviewed contract change.

**D9a - exact receipt acceptance.** A child is successful only when all of the
following agree: it exits zero; stdout is exactly one JSON object with schema
`vaultspec.install.v1`, top-level status `created`, `data.action` `install`,
`data.path` equal to the registry-resolved target, no non-empty `data.errors`,
and `data.providers` equal to `[]` for the core ordinal or the exact singleton
provider for the other ordinals. `data.items` must be a non-empty array of
exact two-string tuples. Each first tuple value must be a safe target-relative
path and each producer-declared path must exist under the resolved target after
the command. Any malformed output, extra/trailing output, wrong schema,
status, action, target, provider set, tuple shape, unsafe path, missing declared
item, or receipt/status disagreement is not success.

Dashboard binds provider, target, and ordinal from its fixed command context;
it never accepts those identities from an untrusted child field. The Dashboard
creates and labels its own local receipt identifier. It retains the exact Core
stdout and a SHA-256 digest as producer evidence; neither is described as a
Core receipt identifier.

**D9b - fresh authoritative reconciliation.** After each child, Dashboard runs
the supported read-only `vaultspec-core spec doctor -t <target> --json` surface
inside the same aggregate deadline and output budget. It requires schema
`vaultspec.spec.doctor.v1`, successful process completion, top-level status
`unchanged`, and `data.framework` `present`. For claude, antigravity, and codex,
the matching provider entry must report `manifest_entry` `coherent`, a present
provider directory state, `config` `ok`, and no non-clean managed-content
signal. The selected provider must also be present in the strict, parseable `.vaultspec/providers.json` installed set. Dashboard validates
only `core`, `claude`,
`antigravity`, and `codex` evidence. It neither interprets nor exposes any
unrelated provider entry; additional producer fields remain open-world metadata.
For the core ordinal, the strict
manifest must exist with its current `2.0` shape and a positive serial, and all
producer-declared item paths must exist. The provider manifest and doctor
projection are Core-owned postconditions; Dashboard reads them and writes no
framework state.

Directory presence alone can never promote an ambiguous, malformed, timed-out,
over-cap, or failed child to success. A receipt reaches `succeeded` only when
both D9a producer evidence and D9b fresh postconditions agree. A disagreement
remains `indeterminate`; a definitive child failure with authoritative absent
postconditions remains `failed`. Aggregate `complete` still requires four
validated, reconciled receipts. The D9 timeout-cancelled and indeterminate
rules, no-blind-replay rule, one aggregate-wide deadline/output budget, and
atomic single-flight posture contract continue unchanged.

## Amendment - idempotent current-state preflight and closed manifest set (2026-09-06, owner auto-approved correction)

This correction responds to
`2026-09-06-project-provisioning-setup-receipt-amendment-review-audit`, which
is the evidence home for the live clean-target, force-target, repeated-target,
and dry-run captures.

**D8b - healthy repeated setup converges through supported read-only Core
operations.** Before any mutating child, Dashboard performs one setup-wide
preflight within the same deadline and output budget. It reads the strict Core
manifest, runs `vaultspec-core spec doctor -t <target> --json`, and runs the
four provider-specific install previews in D8 order: Core first, followed by
claude, antigravity, and codex. Each uses `install <provider> -t <target>
--dry-run --json`; the last three also carry `--skip core`. Every command carries the same resolved target.

The live repeated-target proof established that a healthy target's four
previews return schema `vaultspec.install.v1`, status `unchanged`, action
`dry_run`, the exact target, non-empty two-string item tuples, and zero missing
producer-declared paths. The doctor result meets D9b. By contrast, replaying a
plain safe `install core` exits 1 with Core's already-installed error.
Dashboard therefore never replays that blocked mutation and never accepts the
error as success.

When all preflight facts agree, Dashboard returns `complete` with four ordered
Dashboard-local `reconciled_existing` receipts. Each receipt retains the exact
preview and doctor evidence plus SHA-256 digests and identifies the validated
provider and ordinal from the fixed command context. This is authoritative
idempotent convergence, not an install receipt invented on Core's behalf. If
preflight does not prove the entire current state, setup follows D8a and D9a/b;
it does not promote the target based on directory presence and does not blindly
replay an ambiguous prior child.

**D9c - the provider manifest is closed-world.** The strict manifest's
`installed` membership must equal exactly `{claude, antigravity, codex}` before
a healthy preflight may return complete and after a mutating sequence may
return complete. Missing, extra, unknown, or unsupported membership fails
closed. Dashboard does not translate, remove, provision, report, or otherwise
support an extra entry; it returns an indeterminate contract disagreement for
operator reconciliation outside this setup operation.

Doctor response objects remain open-world only at the JSON field level needed
for forward-compatible decoding. Dashboard selects and validates evidence for
exactly core, claude, antigravity, and codex and discards every unrelated field
without naming, interpreting, storing, or returning it. Open-world decoding
does not weaken the closed manifest membership rule.
## Amendment - per-ordinal partial-state convergence (2026-09-06, owner auto-approved correction)

This correction resolves the two high findings in the re-review recorded by
`2026-09-06-project-provisioning-setup-receipt-amendment-review-audit`. It
supersedes D8b's all-or-nothing fallback while retaining D8a, D9a-c, and the
force posture contract where they do not conflict below.

**D8c - unsupported membership terminates before any child spawn.** Setup first
reads the strict Core manifest in process. If its `installed` set contains any
name outside the exact current set `{claude, antigravity, codex}`, setup returns
a typed terminal `manifest_membership_disagreement` before spawning doctor,
preview, install, or any other child. The result may state that unsupported
membership exists but must not name, translate, remove, provision, or expose the
unsupported entry. Missing current membership is a supported partial state and
continues to the per-ordinal preflight.

**D8d - safe setup converges per ordinal.** In fixed D8 order, safe setup
validates each current component using the D8b Core doctor, provider-specific
install preview, strict manifest, and producer-declared path checks. An ordinal
that already satisfies its exact D9 evidence emits a Dashboard-local
`reconciled_existing` receipt and spawns no mutating install for that ordinal.
An ordinal whose authoritative evidence proves the current component missing
runs only that ordinal's D8a install operation, then validates the D9a install
receipt and a fresh D9b postcondition before advancing. The first ordinal is
`core`; the other ordinals remain `claude`, `antigravity`, and `codex` with
`--skip core`. Force setup remains an explicit overwrite request and runs the
full D8a force sequence after the same unsupported-membership refusal.

A mismatch or malformed read that cannot distinguish missing from inconsistent
state is `indeterminate`; it is never permission to mutate. A timeout or output
breach keeps the D9 terminal classification and stops later mutation. A
non-zero already-installed response is never success because an already-valid
ordinal was reconciled before mutation and was not spawned. Each receipt keeps
its ordinal and current-provider identity, Dashboard-local receipt identity,
and bounded raw/digest evidence. Aggregate `complete` requires four successful
or `reconciled_existing` receipts plus a final strict manifest whose membership
equals the exact current set and a fresh doctor projection satisfying D9b.

The supported sequence was exercised against live disposable targets in the
four shapes required by the re-review: core-only executed the three missing
provider ordinals; one-missing executed only that provider; multiple-missing
executed only those providers in D8 order; and healthy repeated setup executed
no mutating child. Every case finished with exact manifest membership and a
current doctor projection. A separate unsupported-membership fixture returned
`manifest_membership_disagreement` with zero child spawns and an unchanged
manifest. These observations extend the live evidence set whose lifecycle home
is the cited review audit; this ADR records only the resulting contract.
