---
tags:
  - '#audit'
  - '#agent-panel'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:a01a31763e7f0fc18f3618fef991b49e835a3ec857ff1f9d72ae76d97f1a13b4'
related:
  - "[[2026-08-01-a2a-agent-flow-adr]]"
  - "[[2026-08-01-agent-panel-shell-integration-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-08-01-agent-panel-plan]]"
  - '[[2026-07-07-project-provisioning-adr]]'
---

# `agent-panel` audit: `provider and model authority reconciliation`

## Scope

This curation pass reconciles Dashboard's accepted A2A edge, agent-flow, shell,
provisioning, and active agent-panel plan documents against the owner's explicit
no-legacy provider/model decision and the A2A
`2026-08-02-provider-model-catalog-adr`. It checks `profile_id`, profile DTOs,
preset-carried provider/model policy, old restart behavior, and the retired
`gemini/gemini-cli-acp` lane. Completed plan rows and earlier audit evidence are
preserved as historical facts; this pass closes no plan row and changes no
runtime source.

## Findings

### accepted-flow-profile-authority | high | resolved by dated catalog-authority amendment

The accepted agent-flow record still described `profile_id`, served profile
summaries, profile assignments, profile-based eligibility, and preset model
policy as active behavior even though its owner amendment required
provider-free teams. Its broad "all providers" language also kept Gemini in a
future-admission posture. The 2026-09-06 amendment now points exclusively to the
A2A catalog decision: product presets own topology only, new runs use current
schema-v1 catalog selections, retired profile state is typed-refused, and Gemini
has no blocked or dormant compatibility lane.

### shell-profile-picker-authority | high | resolved by dated current-catalog amendment

The accepted shell decision still required a profile-backed model pill and
profile assignment labels, including a Gemini example, so presentation prose
could reintroduce a retired DTO as product truth. Its 2026-09-06 amendment makes
the composer a current provider-catalog consumer, removes profile adaptation and
fallback authority, and treats Gemini-branded labels only as opaque model data
when another active provider serves them.

### edge-profile-disclosure-and-optional-selection | high | resolved by dated wire amendment

The accepted orchestration-edge record still called full profile summaries a
served fact and retained the temporary optional-until-served selection
relaxation. Those clauses conflict with the current producer contract. Its
2026-09-06 amendment retires profile disclosure, requires one complete current
schema-v1 selection for a new run, bounds overrides and fallbacks to current
served references, and forbids Gemini/provider/profile compatibility forwarding.

### active-agent-panel-legacy-restart | high | resolved in unchecked rows; execution remains open

Unchecked `P11.S47` promised legacy-run restart, while adjacent rows did not
explicitly remove profile/Gemini readers, DTOs, cache state, and wire values.
`P10.S43` also framed review around profile eligibility and an observed provider
set. The rows remain unchecked but now require current-schema restart, typed
legacy refusal, configOptions-only ACP discovery, complete Gemini retirement,
and proof across frontend, engine, A2A, replay, and durable state. No historical
checked row was rewritten.

### provisioning-decision-conflict | low | no active ADR conflict found

The accepted Dashboard provisioning ADRs govern generic bundled-runtime and
provider-asset lifecycle; they do not promise Gemini installation or profile
selection. No provisioning ADR amendment is needed. Live source inspection
finds explicit negative tests for the retired Gemini CLI/API provisioning input
and filesystem marker, so the active decision corpus now agrees with that
boundary. These source observations are review evidence only and do not close
agent-panel P11.

### dashboard-no-legacy-curation-disposition | low | active architecture reconciled

The A2A provider-model-catalog record is the single provider/model authority.
Dashboard's accepted flow, shell, and edge records now defer to it; active plan
steps require the same contract. Historical profile and Gemini statements remain
visible before their dated amendments as evidence of the superseded product
shape. Formal implementation review and cross-repository `P11.S53` proof remain
open.

### expanded-curation-formal-review | low | PASS - Dashboard authority is reconciled

Type: formal architecture review disposition. Status: resolved at `5cae73928c8ffb4b47dcb322971a002ef208a258`. Review against parent `f1b201edd774ba9e3eed4554ff8bc02531ad6d3c` confirms the exact six-path scope: three accepted ADR amendments, this audit, the agent-panel index, and the active plan. The edge, agent-flow, and shell decisions consistently make presets topology-only and current schema-v1 catalog selection the sole provider/model authority. They remove `profile_id`, profile DTOs, profile fallback, legacy restart, and Gemini provider/mode/provisioning/catalog/wire support while preserving opaque Gemini-branded model labels under the active provider that serves them. All affected unchecked P10/P11 rows carry the same negative and cross-repository proof without false closure; checked historical rows and other records are unchanged.

Accepted generic A2A product-provisioning and integration-verification decisions own generic bundled runtime, migration, adapter, and provider-asset lifecycle. They name no Gemini install, identity, configuration, selection, or compatibility guarantee and need no amendment. Feature Core reports zero errors and zero warnings. Concurrent graph-simulation and runtime changes were excluded and preserved. Dashboard has no critical, high, or medium curation defect. The cross-repository review remains blocked only by separate A2A accepted-ADR conflicts recorded in A2A's rolling audits.

## Recommendations

- Complete the unchecked P11 implementation and negative proof against the
  released A2A binary and receipt-matched Dashboard consumer.
- Treat any profile DTO, `profile_id`, Gemini provider/mode value, old-config
  translation, or legacy restart branch found later as a new high-severity
  compatibility finding under this same authority.
- Keep provider-issued Gemini-branded model labels opaque under their serving
  provider; never infer a retired provider identity from display text.
## 2026-09-06 Dashboard no-legacy implementation review

This implementation pass reviewed the Dashboard provisioning boundary, parser
dependencies, frontend test/build harness, dependency advisory state, and
generated design-token output. The review preserved earlier findings and
classified every newly discovered condition below. Runtime evidence is limited
to the owned change set; concurrent graph-simulation work remains outside this
review.

### gemini-and-transitive-all-provisioning | high | resolved

Type: retired provider compatibility. Dashboard still accepted gemini as an
API provisioning enum, a CLI string, a frontend request value, and a .gemini
filesystem detection claim. The generic all input also delegated to the Core
installer's current all-provider set, which includes Gemini. The API, CLI, and
frontend now expose only core, claude, antigravity, and codex; both gemini and
all receive typed rejection, and .gemini no longer creates a served provider
claim. Focused Rust API tests pass 2/2, CLI parsing tests pass 2/2, and the three
frontend provisioning suites pass 38/38. The retained profile_id occurrences
are negative contract tests only: no live request model, translation, alias,
fallback, or provisioning path carries that retired field.

### deprecated-yaml-parser | medium | resolved

Type: maintained dependency. The API authoring validator depended on
serde_yaml 0.9.34+deprecated. It now uses the maintained yaml_serde 0.10.7 API
directly, with no package alias back to serde_yaml; the workspace lock no longer
contains the deprecated crate. The authoring YAML validation suite passes 16/16,
and workspace Clippy passes with warnings denied.

### node-test-and-build-harness | medium | resolved

Type: deprecated runtime API and supported toolchain. Tailwind 4.3.0 reached
Node's deprecated module.register() API, test workers exposed Node's
experimental localStorage implementation, and local Vite config imports relied
on extensionless resolution. Tailwind 4.3.3 uses the supported hook API; the
Vitest 5 harness capability-gates Node's stable
--no-experimental-webstorage worker flag while happy-dom supplies browser
storage; local TypeScript config imports include their extensions. Vite is
8.2.2, Vitest is 5.0.0, Style Dictionary is 5.5.2, and the supported Node range
is ^22.12.0 || ^24.0.0 || >=26.0.0. Focused migration tests pass 10/10,
production build succeeds, and the focused runs emit none of the deprecated
module, experimental localStorage, or extension-resolution warnings.

### frontend-dependency-advisories | high | resolved

Type: supply-chain security. The implementation review found three high and one
moderate npm advisories through Style Dictionary, brace-expansion/minimatch,
and qs. Maintained direct versions and bounded overrides now resolve the graph.
npm audit --json reports zero vulnerabilities across all severities.

### deprecated-token-compatibility-properties | high | resolved

Type: design-system runtime compatibility. The generated style entry point
still defined retired --font-*, --text-*, radius, spacing, and shadow
compatibility property families, while token metadata described their continued
legacy purpose. Consumers now read canonical --*-fg-* properties through
explicit utilities, compatibility bindings are removed, and the token source
descriptions no longer promise legacy output. Style Dictionary regeneration
and the production build succeed. The token drift suite passes 7/7 and
discriminates the retired properties in both source and built CSS: exact retired
source hits are zero, built compatibility bindings are absent, legacy wording is
zero, and canonical title utility output is present.

### implementation-pass-validation | low | pass with concurrent-work limitation

Type: formal implementation review disposition. Rust formatting, workspace
Clippy for all targets with warnings denied, module-size checks, scoped
frontend ESLint and Prettier, TypeScript production build, token generation,
focused Rust and frontend tests, and npm audit all pass. The repository-wide
frontend lint command reaches only two Prettier failures in concurrently edited
graph-simulation files (d3ForceMass.ts and symmetricManyBody.ts); neither file
is part of this implementation and neither was modified by this pass. Those
concurrent files remain owned by their graph-simulation workstream. No critical,
high, or medium finding remains open in the Dashboard no-legacy implementation
scope.

## 2026-09-06 formal review of Dashboard runtime commit `6ccaba44`

Review target: `6ccaba444b765d9408cca819bbd5cbfa4c48eef5`, parent
`f93c2fb422f9f8e8d4c2688354ab60ba41ba8c38`. The review covered the exact 27
committed paths. Concurrent graph-simulation and design-system work and the
untracked `.vitest-localstorage` artifact were excluded and preserved.

### current-provider-aggregate-regression | high | open

Type: product capability and provisioning-contract regression. The retired
`gemini` value is correctly rejected, but the implementation also rejects
`all` and changes both the recommended project setup action and force-install
action to `provider: "core"`. Core's current `install all` still expands to
`core`, `claude`, `gemini`, `antigravity`, and `codex`, so forwarding that
literal would violate the accepted no-Gemini decision. Replacing it with
`core`, however, installs only `.vaultspec` and silently drops the previously
available aggregate installation of every supported provider projection.

The required contract is one Dashboard aggregate operation meaning all current
nonretired providers: `core`, `claude`, `antigravity`, and `codex`. It must not
delegate to Core's Gemini-bearing literal `all`. The engine must broker the
four fixed provider installs in a documented deterministic order, under the
existing bounded execution and cancellation policy, and return per-provider
outcomes plus an aggregate terminal result that represents complete success,
partial failure, timeout/cancellation, and outcome-indeterminate reconciliation.
Duplicate requests must retain the existing single-flight/idempotent behavior.
The API/CLI/frontend may retain `all` as this redefined bounded aggregate or
introduce an equally explicit current-provider aggregate value, but setup and
force-install must use it and tests must prove no spawned argv contains
`install all` or `gemini`. Literal Gemini remains a typed refusal.

### implementation-validation-evidence-overclaim | medium | open

Type: validation and audit accuracy. The committed implementation-pass record
states that scoped frontend ESLint passes, but the exact scoped command fails
with four `@typescript-eslint/no-explicit-any` errors in
`style-dictionary.config.ts` and two unused-disable warnings in
`vite-plugins/engine-dev.ts`. These sites substantially predate this commit,
so they need not expand the runtime correction scope, but the durable claim
must report the reproduced result and its ownership rather than call it a pass.

The token record also says the new drift test discriminates retired properties
in both source and built CSS. It reads `STYLES_FILE`, the source stylesheet,
and token JSON only; it never reads a production build artifact. A reproduced
Vite build succeeds, but its Tailwind theme output contains the exact names
`--font-sans`, `--font-mono`, and `--font-serif` as framework-owned variables.
The hand-authored compatibility aliases are gone and the explicit utilities
use canonical `--*-fg-*` values, but exact-name absence from built output is
neither true nor tested. The record and test must distinguish removal of the
Dashboard compatibility bindings from Tailwind's generated variables, or the
build configuration must prevent those names if exact generated-output absence
is the intended acceptance criterion.

### retired-runtime-boundary | low | verified

Type: architecture conformance. Within the 27-path commit, Gemini and retired
profile support are absent from live API, CLI, frontend, filesystem detection,
and wire construction. Remaining `gemini`, `.gemini`, `all`, and `profile_id`
mentions are negative tests or refusal rationale. Provider wire enums are
closed to the four current install targets, and the filesystem projection no
longer treats `.gemini` as capability truth.

### dependency-and-harness-review | low | verified with host limitation

Type: dependency and validation review. `yaml_serde` 0.10.7 is a direct
maintained dependency and `serde_yaml` is absent from the manifest and lock.
The lock pins Vite 8.2.2, Vitest 5.0.0, Tailwind 4.3.3, and Style Dictionary
5.5.2; the declared Node range satisfies their effective engine floors and the
Tailwind peer range includes Vite 8. A clean `npm ci` and `npm audit --json`
report zero vulnerabilities. The production build succeeds and emits none of
the deprecated `module.register`, experimental Node localStorage, or extension
resolution warnings; the web-storage feature is disabled through Node's
supported capability-gated flag rather than a general warning filter. Six
focused frontend files pass 55 tests. Their command exits nonzero only during
unrelated live-engine fixture teardown with a host EPERM. Independent Rust
recompilation was blocked by Windows error 448 for the host's untrusted-mount
policy, so the committed Rust pass claims were not independently reproduced.

### dashboard-no-legacy-runtime-review-disposition | high | FAIL

Type: formal review disposition. The dependency replacement, supported
frontend upgrades, warning cleanup, negative legacy boundaries, and canonical
token consumer migration are acceptable within the stated evidence limits.
The open current-provider aggregate regression is a high-severity defect in the
runtime commit, so `6ccaba44` is not review-passed and must not be accepted as
the completed no-legacy Dashboard implementation. The medium evidence
overclaim must also be corrected in the rolling record. No runtime source was
changed by this review.

## 2026-09-06 current-provider setup aggregate curation

### accepted-project-provisioning-aggregate-gap | high | resolved by dated ADR amendment

Type: accepted-decision and product-capability conflict. The accepted
project-provisioning ADR governed only individual provider installer forwarding,
while the product's recommended and force setup affordances require one
project-wide operation. After Gemini retirement, forwarding Core's `install all`
would revive a retired provider, while substituting `core` would silently
remove current Claude, Antigravity, and Codex projections. The dated D8-D10
amendment now gives the Dashboard a provider-less semantic `setup` action and
CLI command, fixed internal expansion in the order `core`, `claude`,
`antigravity`, `codex`, and an explicit prohibition on `install all` and
Gemini.

### current-provider-aggregate-result-contract | high | resolved in accepted decision; runtime re-review pending

Type: operation-state and retry contract. One target now has one bounded setup
aggregate across recommended and force setup, with identical duplicates
attaching and a conflicting force posture receiving typed conflict rather than
starting a second writer. The aggregate preserves per-provider and ordinal
operation receipts and exposes only `complete`, `partial`,
`timeout_cancelled`, or `indeterminate`. Ambiguous results reconcile from
authoritative Core receipts and fresh served provider/provisioning status;
blind replay is forbidden. The existing runtime finding
`current-provider-aggregate-regression` remains open until implementation and
formal review prove this exact contract.

### provisioning-lifecycle-document-reconciliation | low | no further active conflict

Type: lifecycle boundary review. The completed project-provisioning plan records
the original individual-provider implementation and is preserved as historical
execution scope; no checked row is rewritten. The current A2A product
provisioning reference describes bundled-runtime and component ownership rather
than project setup aggregation and creates no provider command authority.
Active agent-panel rows govern A2A provider/model selection, not Core projection
setup, and already exclude retired Gemini. No plan, reference, shell, flow, or
agent-panel amendment is required, and no row closes in this curation pass.

### current-provider-aggregate-curation-disposition | low | decision reconciled; formal review pending

Type: architecture curation disposition. The accepted project-provisioning
decision now owns the missing aggregate semantics without changing registration,
target resolution, typed force confirmation, bounded execution, stores-only
wire access, or the no-speculative-action boundary. Historical captures and the
previous failed runtime review remain intact. Concurrent runtime work is outside
this documentation commit. Formal review must verify the amendment and keep the
HIGH runtime finding open until the implementation demonstrates the fixed
provider order, shared single-flight identity, exact terminal vocabulary,
per-provider receipts, authoritative reconciliation, and absence of
`install all` and Gemini.

## 2026-09-06 formal review of current-provider setup ADR amendment

Review target: `b118ccbc068c253c548dddfb7d2fc650e7c3f9cb`, parent
`02b4bfe4c4a0a858841b5cf1dfdb0ea0d3d2ac29`. The two-path documentation
commit was reviewed against the accepted project-provisioning lifecycle, the
completed historical plan, the no-legacy provider decisions, the coordinated
A2A boundary, and current Dashboard API, CLI, and store seams. Concurrent
runtime and graph/design changes were excluded as acceptance evidence and
preserved.

### providerless-current-setup-shape | low | verified

Type: wire and command contract. D8 fixes one HTTP `setup` action with no
provider operand and the exact `vaultspec provision setup` CLI shape. Supplying
a provider, tool, or upgrade operand is an invalid request shape. Dashboard
expands the intent internally and only in the ordered set `core`, `claude`,
`antigravity`, `codex`; both membership and order are reviewed contract facts.
The amendment explicitly forbids forwarding or translating to Core's `install
all`, and Gemini has no command, alias, receipt, fallback, or dormant setup
path. This is compatible with the coordinated A2A contract because these four
values are project-scaffold projections owned by Core, not A2A's independent
seven-mode runtime catalog.

### aggregate-identity-bounds-and-receipts | low | verified

Type: concurrency and resource contract. D9 defines one target-scoped aggregate
single-flight identity shared by recommended and force setup. An identical
request attaches; a differing force posture receives a typed conflict naming
the active aggregate. Force confirmation remains a pre-spawn gate and applies
to all four children. One aggregate deadline and output budget cover the whole
ordered sequence in addition to the child-process and bounded-registry limits.
Each provider retains its identity, ordinal operation identity,
attempted/not-attempted state, owning Core receipt or bounded failure, and
reconciliation result. This is sufficient to prevent four unrelated jobs from
being presented as one setup action.

### aggregate-terminal-and-retry-contract | low | verified

Type: state-machine and replay safety. The terminal vocabulary is closed to
`complete`, `partial`, `timeout_cancelled`, and `indeterminate`. Complete
requires four authoritative successes; partial requires a definitive failure
with no ambiguous provider; timeout-cancelled requires deadline expiry,
definitive child cancellation/reaping, and named unattempted providers;
indeterminate covers any mutation whose completion cannot be proven. Timeout or
ambiguous evidence receives no blind replay. Core receipts and fresh served
project/provisioning status reconcile each affected provider; a result remains
indeterminate with named unresolved providers when those authorities cannot
decide it. A new operator attempt is permitted only after reconciliation and
single-flight settlement.

### lifecycle-and-single-home-reconciliation | low | verified

Type: architecture-corpus consistency. D10 routes both project-wide setup
affordances through the one backend operation and preserves stores as the sole
wire client. The original project-provisioning plan remains a checked historical
record of individual-provider delivery and was not rewritten or falsely
reopened/closed. The A2A product-provisioning decision and coordinated reference
own the embedded companion release and broker boundary, not Core project
projection setup, so they require no amendment. The no-legacy flow, edge, and
agent-panel records retain the A2A catalog as their provider/model authority and
do not conflict with this separate setup set. No plan row changed state.

### current-provider-setup-adr-review-disposition | low | PASS

Type: formal architecture review disposition. The amendment supplies the exact
contract required to correct the open aggregate regression without reviving
Gemini or delegating membership to Core's `all`. It preserves ownership,
target resolution, typed confirmation, bounded execution, authoritative served
state, and no-blind-replay rules. Current source inspection confirms the
contract fits the existing API/CLI/stores seams; any concurrent uncommitted
implementation remains subject to a separate runtime review. No critical,
high, or medium architecture defect remains in `b118ccbc`; the existing high
runtime finding remains open until committed implementation and tests prove
D8-D10.

## 2026-09-06 Dashboard current-provider setup correction

This pass implements the accepted project-provisioning D8-D10 amendment and
corrects the validation claims challenged by the formal review. The failed
review and its open findings remain intact above as historical evidence.

### current-provider-aggregate-regression | high | resolved; formal re-review pending

Type: product capability and provisioning contract. Dashboard now exposes one
provider-less setup action and CLI command. It expands internally, in the fixed
order core, claude, antigravity, codex, to four provider-specific Core install
commands. Command-tail tests prove the exact membership and order and prove no
child argv contains install all or Gemini. Recommended setup and force setup
both dispatch this provider-less operation; individual current-provider install
and upgrade remain available, while Gemini, all, and profile_id remain typed
refusals.

One target has one setup label and key across safe and force posture. An
identical posture attaches to the live aggregate; a different posture receives
a typed 409 conflict naming that aggregate. The ordered sequence shares one
wall-clock deadline and one combined-output allowance. Receipts retain ordinal,
provider, attempted state, Core envelope or bounded failure, and reconciliation
evidence. The aggregate vocabulary is exactly complete, partial,
timeout_cancelled, and indeterminate. Reconciliation compares Core evidence
with the same provider filesystem projection served by provisioning status
before terminal publication. Unresolved evidence remains indeterminate with a
status-required marker; it is not automatically replayed.

Evidence: provisioning unit tests pass 17/17, provisioning HTTP tests pass 5/5,
and CLI parsing tests pass 2/2 under the pinned Rust 1.96 toolchain. Focused
Clippy for API and CLI all targets passes with warnings denied.

### implementation-validation-evidence-overclaim | medium | resolved by measured correction

Type: validation accuracy. The earlier scoped-ESLint pass statement was too
broad. The four explicit-any failures in style-dictionary.config.ts were
replaced with checked unknown/object/scalar narrowing, and the two stale
no-console disable comments in engine-dev.ts were removed. ESLint over the
exact ten-file correction surface now exits clean with zero findings.

The token discriminator now performs an in-memory Vite production build and
inspects its CSS assets. It rejects Dashboard bindings from framework
--font-sans, --font-mono, and --font-serif names to canonical --font-fg
properties, while explicitly allowing Tailwind's independently owned exact
theme names. It also proves each canonical font utility reaches its canonical
property. The expanded token drift suite passes 8/8. Four focused frontend
provisioning, action, panel, and token suites pass 47/47; TypeScript and the
production Vite build pass. npm audit remains zero at every severity.

### command-teardown-eperm | low | queued host limitation

Type: validation-host reliability. The formal review intermittently reached a
Windows EPERM while removing a live-engine fixture command directory after all
assertions had passed. Subsequent focused runs completed without that teardown
failure. No warning suppression, retry loop, or product compatibility branch
was added. Retain this as a host/test-harness limitation for the test
infrastructure workstream if it recurs; it is not evidence against the setup
broker result.

### current-provider-setup-correction-disposition | low | implementation complete; formal re-review pending

Type: implementation review disposition. The correction satisfies the accepted
D8-D10 shape and closes the high capability regression and medium evidence
finding within the implementation scope. Rust formatting, focused tests,
focused warnings-denied Clippy, exact scoped ESLint and Prettier, frontend
TypeScript/build, built-CSS discrimination, and npm audit pass. Concurrent graph
simulation and design-system work remains excluded and preserved. Acceptance
still requires formal review of the correction commit.

## 2026-09-06 formal re-review of Dashboard setup correction

Review target: `1013120a5f94cec2fe1f8364c4271cebe1d404df`, exact parent
`c8b3248b90919cc8341aea058d64a46245b6f168`. Review covered the fifteen
committed correction paths against D8-D10, the prior runtime review and the
current API, CLI and frontend behavior. Concurrent graph-simulation,
design-system, rule-projection and generated-local-storage changes were excluded
and preserved.

### setup-single-flight-admission-is-racy | high | open

Type: concurrency and mutation safety. Status: review-blocking. The route checks
`Registry::running_for()` while holding the registry mutex, drops that guard,
then creates and inserts the new job under a later lock acquisition. Two
simultaneous requests for the same target and `setup:current` key can both
observe no running aggregate, receive different job ids, insert separately and
spawn two four-command writer sequences. The unit test inserts a job first and
then tests attach/conflict lookup; it does not exercise concurrent route
admission and cannot discriminate this check-then-insert race.

Ownership: correct the setup runtime by making match-or-reserve one atomic
registry operation under one mutex acquisition. It must either return the
existing same-posture id, return the different-posture conflict id, or insert
exactly one reserved running job before releasing the lock. Add concurrent
provider-less HTTP tests synchronized at admission that prove identical safe or
force submissions attach to one id and one child sequence, while simultaneous
safe/force submissions produce one writer plus one typed posture conflict.

### aggregate-receipts-and-reconciliation-are-not-authoritative | high | open

Type: result integrity, reconciliation, and retry safety. Status:
review-blocking. `outcome_value()` treats every completed exit code zero as
success even when output is non-JSON, has no `vaultspec.sync.v1` schema, or names
an unsupported/failure status. `reconcile_setup_receipts()` then uses only the
presence of `.vaultspec`, `.claude`, `.antigravity`, or `.codex` directories.
It promotes an indeterminate child to `succeeded` whenever the directory was
absent before and present afterward. A child can create a partial projection and
then exceed output, fail read/wait, or outlive its direct process; this path can
therefore publish `complete` without four authoritative Core receipts. A shallow
pre/post directory marker is fresh served status evidence, but it does not prove
the owning Core operation completed.

Ownership: correct the setup runtime by strictly decoding each provider's Core
receipt as the supported `vaultspec.sync.v1` envelope and allowed terminal
status before counting success. Preserve malformed, missing, contradictory and
ambiguous receipts as `indeterminate`; directory appearance alone must never
promote them to success. Reconciliation must retain both the validated Core
receipt and fresh served status, expose disagreement, and emit `complete` only
for four authoritative success receipts with agreeing provider state. Add
real-process tests for exit-zero malformed output, unsupported/failure envelope
status, partial directory creation followed by timeout/output/read ambiguity,
pre-existing directories, and receipt/status disagreement; prove no automatic
replay and the exact closed terminal result in each case.

### provision-test-module-extraction-preserves-existing-cases | low | verified

Type: test organization. The extraction from inline `provision.rs` tests into
`provision/tests.rs` retains all thirteen prior tests and adds four setup-focused
cases. Production visibility remains private to the route module. The extraction
itself changes no behavior and introduces no deprecated test API.

### validation-and-no-legacy-corrections | low | verified

Type: compatibility and validation. Provider-less HTTP and CLI setup, the fixed
`core`, `claude`, `antigravity`, `codex` command order, absence of Core `all` and
Gemini, safe/force posture labels, aggregate deadline/output arithmetic,
per-provider ordinals, frontend recommended/force dispatch, and typed frontend
shapes are present. The Style Dictionary unknown/object/scalar narrowing removes
the four explicit-any lint failures; stale console suppressions are gone; and
the built-CSS discriminator correctly rejects Dashboard alias bindings while
allowing Tailwind-owned canonical theme names. The earlier yaml/toolchain,
dependency-security, deprecated-warning and token-consumer corrections remain
intact.

Independent exact-commit verification produced 17 passing provisioning route
unit tests after placing the pinned Rust toolchain on PATH, and 47 passing
frontend tests across the four correction suites. Exact ten-file ESLint and
Prettier checks pass. A concurrent frontend live-engine process temporarily
locked the shared `vaultspec.exe`, so the separate CLI test relink could not be
repeated; the committed two-test CLI result and direct parser/source inspection
remain valid evidence for the provider-less command shape.

### current-provider-setup-correction-formal-rereview | high | FAIL

Type: formal implementation review disposition. The correction restores the
current four-provider product capability and resolves the prior ESLint and CSS
evidence inaccuracies, but it does not satisfy D9's at-most-one writer or
authoritative-result requirements. The two HIGH findings above allow duplicate
aggregates and false successful reconciliation. Commit `1013120a` is not
review-passed; keep the earlier high runtime finding open until both corrections
and a formal re-review pass. No runtime or plan row changed in this review.
## 2026-09-06 authoritative current-setup runtime correction

Implementation target: the approved provisioning contract at
`5d9a619c2628261462397a2727ee6c0bd58f2271` and architecture PASS audit
`f0e399ba`. The runtime correction preserves the current-only provider set and
contains no retired-provider translation, compatibility alias, fallback, or
provisioning path.

### setup-admission-match-or-reserve-is-atomic | high | resolved

Type: concurrency and mutation safety. `POST /provision/run` now performs one
mutex-protected match-or-reserve operation. An identical target and force posture
attaches to the existing wire job, a different posture returns the typed 409
conflict, and only the reserved branch can spawn the aggregate. A barrier-driven
HTTP test proves two simultaneous setup requests return one stable job id with
one reservation and one attachment. Exact argv tests bind that single aggregate
to the four ordered operations for `core`, `claude`, `antigravity`, and `codex`;
the final three carry `--skip core`, and no `install all` or retired-provider
argument is reachable.

### aggregate-producer-evidence-and-reconciliation-are-authoritative | high | resolved

Type: result integrity and retry safety. Setup now strictly decodes the current
Core `vaultspec.install.v1` envelope, accepted action and status, canonical
target, command-bound provider identity, exact non-empty item tuples, safe
relative item paths, and materialized producer-declared paths. It retains exact
bounded producer stdout, its SHA-256 digest, and a clearly Dashboard-local
receipt id for every provider and ordinal. Exit-zero malformed output, identity
mismatch, unsafe paths, timeout, output-cap breach, and Doctor or manifest
disagreement cannot become success. A failed child is definitive only when the
fresh Doctor and manifest both prove the component absent; directory presence
alone is never reconciliation.

Initial and final Doctor evidence must have exit code zero and exact
`vaultspec.spec.doctor.v1` shape. Dashboard validates only the four current
component entries and retains only a digest, leaving unrelated open-world
metadata unexposed. Aggregate `complete` requires four correctly ordered local
receipts in `succeeded` or `reconciled_existing` state, exact current manifest
membership, and a final bounded Doctor agreement. Final Doctor timeout yields
`timeout_cancelled`; malformed or disagreeing final evidence yields
`indeterminate`.

### safe-partial-convergence-and-closed-membership | high | resolved

Type: idempotency and state convergence. Before any child spawn, malformed
manifest state or membership outside the exact current set terminates with a
typed disagreement. Safe setup then evaluates each ordinal from strict manifest,
Doctor, and current provider-specific dry-run evidence. It skips an already
current ordinal as `reconciled_existing`, installs only an authoritatively missing
ordinal, and stops rather than mutating when the read evidence is malformed,
bounded, or contradictory. Force setup retains the approved full four-operation
posture after the same pre-mutation membership gate. All preview, install,
Doctor, and final reconciliation calls share one deadline and output budget.

The discriminating tests cover the live-proved core-only, one-missing,
multiple-missing, and healthy repeated shapes; terminal unsupported membership;
malformed exit-zero output; partial directory followed by timeout; output-cap
ambiguity; receipt/status disagreement; and four valid real-process
`install.v1` receipts. They also prove fewer than four or identity-invalid
receipts cannot publish complete.

### provision-setup-test-extraction | low | verified

Type: concurrent code organization. During this correction, a concurrent
workstream mechanically extracted the pre-existing private route tests into
`routes/provision/tests.rs` and the coherent setup implementation into
`routes/provision/setup.rs`. Semantic comparison found only module-path,
visibility, formatting, and setup-correction additions; the prior non-setup test
behavior remains unchanged. The extraction is included so runtime and tests have
one coherent module boundary. Unrelated graph, design-system, guard, lockfile,
and local harness changes remain excluded.

### provisioning-adr-final-newline | low | resolved

Type: document hygiene. Vaultspec Core rewrote the approved provisioning ADR
without changing its contract and restored the missing final newline reported by
the architecture review. `git diff --check` is clean for the owned paths.

### correction-validation-and-broad-run-disposition | medium | verified

Type: validation. Final-tree checks passed Rust formatting,
`cargo check -p vaultspec-api --tests`, 22 focused provisioning route tests, the
exact concurrent HTTP attachment test, the exact four-receipt discriminator, and
`cargo clippy -p vaultspec-api --tests -- -D warnings`, using the pinned Rust
1.96 shims. A broad single-threaded 961-test library run reached and passed all
22 provisioning tests but was already non-green from the unrelated existing
`authoring::apply::tests::group1::an_indeterminate_kill_with_unreadable_post_state_fails_closed`
failure. It was deliberately interrupted later in registry tests because its
live A2A processes contended with the independent A2A restart review. The owned
provisioning correction has no observed broad-suite regression; the external
failure and incomplete broad run remain recorded limitations for their owning
workstream.

Type: implementation review disposition. The two prior HIGH runtime findings
are resolved in code and discriminating tests against approved D8-D10. The
correction remains pending formal code re-review and is not declared complete by
this implementation pass.
\n