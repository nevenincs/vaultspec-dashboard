---
tags:
  - '#audit'
  - '#agent-panel'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:1f071a02cede987ef79d60cd7d4b524f749767bf95f3bf7798b36f6dbeba0c02'
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

## 2026-09-06 formal review of authoritative current-setup correction

Review target: `160ae18f5a89a94915117c6d1a2edc53e2455bbe`, exact parent
`a93ffc9f42a1e1fedb7a2e16d81393528d40e6ab`. Review covered the exact seven
committed paths against approved provisioning ADR `5d9a619c`, the earlier
architecture PASS and runtime FAIL audits, the strict current-only provider
contract, and the production route, process and test boundaries. Concurrent
graph-simulation, design-system, lockfile and generated-local-storage work was
excluded and preserved.

### safe-preflight-failed-doctor-can-authorize-mutation | high | open

Type: mutation safety and contract validation. Status: review-blocking.
`parse_doctor` accepts any `vaultspec.spec.doctor.v1` object, while
`doctor_proves_missing` does not require top-level `status: unchanged`; for
non-core providers it also does not require `data.framework: present`. A
schema-valid, exit-zero Doctor result that reports a failed status and a
missing-looking provider entry therefore reaches `InstallMissing` and permits a
mutation. D8d says malformed or disagreeing read evidence is never permission
to mutate, and D9b requires both status and framework fields.

Ownership: make the negative Doctor predicate as strict as the positive one:
require the exact successful Doctor status, require the provider-appropriate
framework state, validate the selected current entry's required types and
values, and treat every other shape as indeterminate. Add separate malformed
helper cases for failed status, missing/wrong framework, absent entry, wrong
field types and contradictory missing fields, proving zero install spawn.

### timeout-cancellation-is-not-definitive-on-windows | high | open

Type: process lifetime and retry safety. Status: review-blocking. The bounded
runner kills and reaps only the direct child, but Dashboard can launch Core
through a console or uv wrapper whose descendant can survive direct-child
termination on Windows. `run_capability_with_limits` nevertheless maps every
bounded timeout to `TimeoutCancelled`, and setup releases the single-flight job
under that terminal classification. A later retry can overlap the surviving
writer. This contradicts D4 and D9, which require `timeout_cancelled` only when
the active mutation is definitively cancelled and reaped and otherwise require
indeterminate reconciliation.

Ownership: use a process-tree/job-object cancellation boundary on Windows and
prove the whole mutation tree exited before publishing `timeout_cancelled`.
When that proof is unavailable, publish `indeterminate`, run authoritative
reconciliation, and prevent blind replay or overlapping writers. Add a real
wrapper-plus-descendant discriminator that leaves an observable mutation if
only the wrapper is killed.

### detached-setup-task-can-orphan-a-mutating-child | high | open

Type: cancellation and shutdown safety. Status: review-blocking. The route
throws away the `tokio::spawn` handle, and the child command is not configured
with kill-on-drop or an equivalent task guard. Runtime shutdown or task
cancellation while setup awaits Doctor, preview or install bypasses the normal
timeout branch; the child may continue mutating after the registry and server
that owned its single-flight state disappear.

Ownership: give each aggregate an owned cancellation guard whose drop path
terminates and reaps the full process tree, and retain task ownership through
server shutdown. Persist or reconcile an indeterminate terminal result whenever
definitive cancellation cannot be proved. Add cancellation-at-each-child-phase
coverage with an observable descendant and zero overlapping retry.

### declared-item-containment-is-only-lexical | high | open

Type: target confinement and receipt integrity. Status: review-blocking.
`safe_declared_items` rejects absolute and non-normal lexical components, but
`validate_install_output` proves only `target.join(relative).exists()`. A
symlink or Windows junction below the target can resolve outside it and still be
accepted as a materialized producer item; safe preview reconciliation repeats
the same existence-only check. D9a requires every declared path to exist under
the canonical resolved target.

Ownership: after lexical validation, canonicalize the target and every existing
declared item and require each canonical item to remain under the canonical
target. Keep missing and escaping items as distinct validation failures. Add
file and directory symlink/junction escape discriminators for preview and
install, including a normal in-target control.

### setup-job-registry-allows-unbounded-running-growth | high | open

Type: bounded resources. Status: review-blocking. `MAX_JOBS` and TTL eviction
apply only to completed jobs. `match_or_reserve` inserts a distinct-key running
job even when all slots are occupied, and the committed test explicitly expects
`MAX_JOBS + 5` running jobs to survive. Thus an operator can grow the
process-global registry and spawned work without bound, contrary to D4's
bounded-registry rule.

Ownership: make reservation capacity-aware. After pruning completed entries,
refuse a new distinct reservation with a typed capacity response when no safe
completed victim exists; identical attach and posture conflict must still work
at capacity and no child may spawn on refusal. Add exact-cap concurrent tests
for attach, conflict, distinct-key refusal and later admission after terminal
pruning.

### doctor-evidence-required-by-receipts-is-absent | high | open

Type: evidence and reconciliation observability. Status: review-blocking.
Per-ordinal receipts and final reconciliation publish only Doctor SHA-256
digests. D8b and D9 require the exact validated Doctor evidence plus its digest,
and the current response does not let an operator verify which authoritative
status, framework and selected-provider facts justified `reconciled_existing`
or `succeeded`.

Ownership: publish a bounded, typed current-only Doctor projection containing
schema, status, framework and only the command-bound current provider fields,
plus the digest of the exact bounded producer response. Never return unrelated
Doctor entries or fields. Bind the final projection and digest to every terminal
receipt and test that injected unrelated/retired metadata cannot cross the wire.

### raw-install-stdout-can-expose-open-world-metadata | high | open

Type: wire minimization and no-legacy enforcement. Status: review-blocking.
Install receipt decoding permits additional JSON fields and then returns exact
`producer_stdout` through the polled job response. A producer can therefore add
unrelated provider or retired metadata that Dashboard neither validates nor
intends to serve. This conflicts with the current-only boundary and with the ADR
language requiring unrelated metadata to be discarded, while D9a separately
requires retaining exact stdout.

Ownership: resolve the ADR tension explicitly. Prefer a closed, typed install
evidence projection plus a digest of the exact bounded stdout on the wire; keep
raw evidence only in a bounded non-wire evidence home if it must be retained.
Alternatively, if exact raw stdout remains public, close the accepted producer
object to an enumerated key schema and reject every extra key before success.
Add injected unknown, unrelated-provider and retired-name fields proving none is
served or accepted silently.

### production-composition-lacks-real-core-target-evidence | high | open

Type: test coverage and integration evidence. Status: review-blocking. The
safe-partial and healthy tests exercise helper predicates. The tests labelled
real process run PowerShell that emits hand-crafted JSON and then call the
validator or `current_setup_outcome`; they do not invoke `run_current_setup`
against a real Core executable and disposable target. Consequently the suite
did not detect the failed-Doctor mutation path and does not prove the composed
Doctor, preview, install, manifest, canonical-path and final-reconciliation
flow.

Ownership: add hermetic real-Core disposable-target integration through the
production aggregate for core-only, one-missing, multiple-missing, healthy
repeat and force. Assert exact spawned sequence, final strict manifest, full
validated frozen/current evidence and digests, and all four ordered receipts.
Keep malformed helper-process cases separate so failure injection remains
deterministic. The integration must use the actual project-locked Core boundary,
not a mock transport or a script that merely prints expected JSON.

### preflight-timeout-loses-terminal-classification | medium | open

Type: result classification. Initial Doctor and provider preview termination is
reduced to missing optional evidence, after which setup emits generic
`indeterminate` with `preflight evidence disagrees`. D8d requires a timeout or
output breach to retain its D9 terminal classification and stop later mutation.

Ownership: carry typed termination through preflight and preserve
`timeout_cancelled` only when definitive full-tree cancellation is proved;
otherwise retain the exact indeterminate/output/read failure reason. Test each
preflight stage and later ordinals.

### concurrent-posture-conflict-is-not-proved-at-the-route | medium | open

Type: concurrency coverage. The barrier-driven HTTP test proves identical safe
requests reserve once and attach once. Safe-versus-force conflict is covered
only by sequential registry calls, so the route's confirmation, atomic
reservation, typed 409 and zero-second-writer composition is not exercised
concurrently.

Ownership: add a barrier-driven provider-less HTTP safe/force test that accepts
either request as the winner, proves one typed posture conflict names that job,
and counts exactly one aggregate/child sequence.

### real-process-tests-have-load-sensitive-five-second-budgets | medium | open

Type: validation reliability. A parallel focused run observed the output-cap
PowerShell process reported timeout and the four-receipt process returned no
exit code; both passed alone, and the complete 22-test provisioning set passed
serially. Fixed five-second ceilings make these environmental process tests
sensitive to host contention and can obscure the intended discriminator.

Ownership: synchronize on process readiness/output rather than scheduler timing,
use a narrowly justified test-only budget, and keep production limits unchanged.
The final broad library run also remains incomplete: it first encountered the
separately owned authoring failure and was later stopped during concurrent live
A2A lifecycle work.

### authoritative-setup-correction-positive-controls | low | verified

Type: architecture and scope. Atomic match-or-reserve, identical-posture attach,
typed different-posture conflict, fixed `core`, `claude`, `antigravity`, `codex`
order, `--skip core`, pre-spawn unsupported-membership refusal, per-ordinal safe
convergence shape, force sequencing, strict manifest membership, aggregate
deadline/output accounting and install envelope identity validation are present.
No Core `all`, Gemini, deprecated setup alias or unrelated committed path was
found. The setup/test extraction is coherent and `git diff --check` is clean.

Independent exact-commit verification passed all 22 provisioning route tests
serially with the pinned Rust 1.96 toolchain. The exact concurrent identical
HTTP and four-receipt tests are included in that result. The implementation
record also reports formatting, check and warnings-denied Clippy green. The
broad run is not acceptance evidence for this correction because it was not
completed.

### authoritative-current-setup-formal-review | high | FAIL

Type: formal implementation review disposition. Commit `160ae18f` resolves the
two earlier runtime defects and preserves the current-only setup shape, but the
seven HIGH findings above expose unsafe mutation admission, non-definitive
process settlement, target escape, unbounded resource growth and incomplete or
open wire evidence. The eighth HIGH finding records the missing real-Core
composition proof required to make those state transitions reviewable. The
commit is not review-passed. Correct every HIGH defect, add the specified
discriminating evidence, and obtain another formal review before acceptance. No
runtime, ADR decision, or plan row changed in this review.

## 2026-09-06 architecture review of provisioning evidence boundary

Review target: `27d29a339bb2e85622d671c06e5ed9898413e6e3`, exact parent
`e2e707652a58f2ca3ae8692df99c11938236e7b9`. This documentation-only review
reconciled the new D4a/b and D9d-f decisions against the runtime FAIL findings,
the accepted setup state machine, live Vaultspec Core 0.1.73 behavior, the
current-only provider boundary, and the single-home-fact rule. Runtime and
unrelated concurrent work were excluded.

### core-missing-doctor-contract-rejects-real-clean-target | high | open

Type: typed missing-state admission and producer-contract drift. D9f requires a
successful exit-zero Doctor envelope with status `unchanged` before any ordinal
may be classified missing, then says core requires framework `missing`. Those
requirements cannot coexist against the current producer. On a disposable
unmanaged Git target, `vaultspec-core spec doctor -t <target> --json` returned
exit 2, schema `vaultspec.spec.doctor.v1`, status `failed`, framework `missing`,
and an empty provider object. The proposed predicate therefore classifies the
real clean target indeterminate and never authorizes its first core install.
The original runtime defect cannot be fixed by broadly accepting failed Doctor
results; core needs its own exact, closed typed negative envelope distinct from
the successful non-core missing contract.

### missing-item-ancestor-containment | high | open

Type: target confinement and pre-mutation safety. D9e canonicalizes the target
and each producer-declared item that already exists. It explicitly permits a
missing preview item to authorize installation after checking only items that
exist. A missing item can be below an existing symlink, junction, or other
redirecting ancestor whose canonical location is outside the target. For
example, an absent provider child beneath an existing redirected provider
directory is not itself canonicalizable under D9e, so preflight can authorize
Core to write outside the target. Post-install item canonicalization detects the
escape only after mutation. The contract must prove containment through the
nearest existing ancestor of every missing declared path, or an equivalent
no-follow resolution, before granting mutation authority.

### transient-producer-evidence-boundary | low | verified

Type: wire minimization and current-only evidence. D9d resolves the earlier
contradiction: exact bounded install and Doctor stdout is transient validation
input used for strict decoding and SHA-256 computation, and is neither persisted
nor returned. The wire contains bounded typed projections and digests only.
Command-bound current provider identity replaces producer authority; unknown
fields, unknown provider entries, and unrelated metadata are discarded before
storage or service. Core receipts omit a provider projection, while each
non-core Doctor projection carries only its own required current entry. This
closes raw open-world stdout exposure without a compatibility surface.

### owned-process-tree-and-hard-capacity | low | verified

Type: cancellation, shutdown, replay, and resource bounds. D4a places every
Doctor, preview, and install process in an aggregate-owned full-tree boundary,
requires Windows Job Object termination-on-close and empty-tree proof before
`timeout_cancelled`, routes timeout, output breach, shutdown, abort, and drop
through one termination/reap path, and retains single-flight exclusion when
proof is unavailable. D4b makes `MAX_JOBS` a hard bound across running and
completed entries, preserves attach/conflict resolution at capacity, permits
only safe completed eviction, and refuses a distinct identity before task or
child spawn when no slot exists. These clauses close the corresponding
architecture gaps; runtime proof remains mandatory.

### non-core-doctor-and-cause-contract | low | verified

Type: typed evidence and terminal classification. For non-core missing state,
D9f requires exit zero, the exact Doctor schema and `unchanged` status,
framework `present`, the selected command-bound current provider object, exact
required types, and mutually consistent `not_installed`/`missing` facts.
Absent, mistyped, failed, wrong-framework, and contradictory evidence is
indeterminate and authorizes no install. Typed timeout, output-cap, read/wait,
malformed, and cancellation causes survive preflight; later mutation stops, and
`timeout_cancelled` remains restricted to proven full-tree settlement.

### current-only-and-lifecycle-boundary | low | verified

Type: no-legacy, no-deprecated, and single-home-fact conformance. The amendment
adds no provider, operation, alias, translation, migration, fallback, or wire
field outside the fixed current setup contract. Unknown and unrelated producer
metadata is validation-only input that is discarded rather than served. The
amendment cites `2026-09-06-agent-panel-no-legacy-curation-audit`, which remains
the single home for the runtime findings it resolves; the ADR records the
chosen correction and does not rewrite the runtime audit's evidence.

### provisioning-adr-markdown-hygiene | low | queued

Type: mechanical documentation hygiene. `vaultspec-core vault check markdown`
reports one extra blank line and a missing final-newline repair in the reviewed
ADR, whose final body also contains a literal `\n` residue. Review-only scope
leaves the target commit unchanged. The next documentation correction should
apply the Core-owned markdown repair and remove the literal residue.

### provisioning-evidence-boundary-architecture-disposition | high | FAIL

Type: formal architecture-review disposition. D4a, D4b, D9d, the non-core half
of D9f, and typed cause preservation close their matching runtime-review
contract gaps. The real clean-target Doctor mismatch and missing-item ancestor
escape leave two high-severity mutation-safety defects. Commit `27d29a33`
cannot authorize runtime wire finalization until both are corrected and
re-reviewed. Existing runtime findings for real-Core production composition,
concurrent posture conflict, and load-stable process tests remain implementation
obligations; this docs-only pass does not close them.

## Provisioning evidence-boundary recommendations

- Define core-missing evidence as its own exact current Core negative contract:
  the expected process exit, Doctor schema/status, framework state, empty or
  otherwise closed provider projection, and required typed fields. Preserve the
  stricter exit-zero/status-unchanged/framework-present/current-entry contract
  for non-core missing. Prove clean-core, failed-but-not-missing, wrong-exit,
  wrong-status, wrong-framework, malformed, and contradictory cases.
- Before authorizing mutation for a missing declared item, canonicalize and
  confine its nearest existing ancestor under the canonical target, and repeat
  canonical item containment after installation. Test missing file and
  directory descendants below escaping symlinks and Windows junctions, plus
  normal in-target missing ancestors and existing-item controls.
- Apply the queued Vaultspec Core markdown repair in the correction pass while
  preserving the evidence and decision boundary.

## 2026-09-06 re-review of exact missing-state confinement correction

Review target: `48c32377598a641fc46735e8d97c49a03b6005e1`, exact parent
`7ced01aea83a1e0d1480266aecd8094ae14865d1`. This documentation-only re-review
reconciled the two open high findings against live Core 0.1.73 output, the
accepted current-only setup contract, canonical filesystem containment, and
Vaultspec mechanical checks. Runtime and unrelated concurrent work were
excluded.

### exact-clean-core-negative-envelope | low | verified

Type: typed missing-state producer contract. The correction replaces the
impossible universal successful-Doctor predicate with one narrow core-only
negative envelope: exit exactly 2, stdout exactly one JSON object, schema
`vaultspec.spec.doctor.v1`, status `failed`, framework `missing`, and providers
exactly an empty object. A live unmanaged target reproduced exactly that stdout
shape; diagnostics remained on stderr and do not alter the one-object stdout
contract. Every different exit, schema, status, framework value, provider
shape or membership, missing field, wrong type, or malformed object is
indeterminate. This closes
`core-missing-doctor-contract-rejects-real-clean-target` without accepting
arbitrary failed Doctor responses.

### strict-non-core-missing-envelope | low | verified

Type: mutation admission. Claude, antigravity, and codex retain the separate
strict successful contract: exit 0, exact Doctor schema, status `unchanged`,
framework `present`, command-bound current provider object, exact required
types, and consistent `not_installed`/`missing` facts. Failed status, missing or
wrong framework, absent selected entry, wrong types, contradictions, and
unrelated metadata cannot authorize installation or cross the wire. No
core-negative exception broadens provider missing-state admission.

### nearest-existing-ancestor-confinement | low | verified

Type: pre-mutation target confinement. The corrected D9e applies lexical checks
first, canonicalizes the target and every existing item, and, for each absent
file or directory, walks toward the target to canonicalize the nearest existing
ancestor before granting mutation authority. An escaping symlink, junction, or
other redirecting ancestor is disagreement; a confined ancestor may contribute
only to otherwise authoritative missing evidence. Every created item is then
canonicalized again after installation. This closes
`missing-item-ancestor-containment` for existing and absent declared paths and
preserves distinct missing-versus-escape failures.

### current-only-and-mechanical-reconciliation | low | verified

Type: no-legacy, no-deprecated, and corpus hygiene. The amendment adds no
provider, alias, aggregate, fallback, translation, migration, or compatibility
path beyond the four current setup ordinals. The core-negative projection is
closed, provider projections remain command-bound, and unrelated metadata is
discarded. The correction removes the literal end residue and repairs the
extra-blank/final-newline warning through the Core-maintained document shape.
`vaultspec-core vault check markdown`, frontmatter, links, and modified-stamp
are clean for the reviewed corpus state.

### exact-missing-state-confinement-disposition | low | PASS

Type: formal architecture-review disposition. Commit `48c32377` resolves both
high findings from `7ced01ae`. The exact current Core negative envelope, strict
non-core missing evidence, nearest-existing-ancestor pre-mutation confinement,
post-install item checks, current-only boundary, and mechanical hygiene are
coherent. No critical, high, or medium architecture defect remains. Runtime
wire finalization may proceed, but the production implementation and its
real-process, cancellation, capacity, containment, malformed-evidence, and
concurrency proofs remain subject to the mandatory formal code review.

## Exact missing-state re-review recommendation

- Implement the closed predicates without widening failed-Doctor acceptance,
  and prove absent file and directory descendants beneath escaping symlinks and
  Windows junctions are refused before any mutation. Preserve the audit's
  remaining runtime test obligations through final code review.
## 2026-09-06 implementation correction after architecture PASS

Correction target: the runtime work following formal review FAIL
`e2e707652a58f2ca3ae8692df99c11938236e7b9`, provisioning-contract
corrections `27d29a33` and `48c32377`, and architecture PASS `86470e6c`.
The implementation scope is the Dashboard provisioning route, bounded child
runner, setup reconciler, and discriminating Rust tests. Concurrent graph,
design-system, RAG configuration, root lockfile, and local frontend artifacts
remain excluded.

### strict-doctor-and-current-only-wire-evidence | high | resolved

Type: mutation admission and evidence boundary. The safe preflight now accepts
only the exact current Doctor envelope or the separate exact clean-Core negative
envelope. Provider status, framework status, selected current-provider entry,
manifest, directory, configuration, and clean-content facts must agree before
mutation. Receipts carry only a bounded closed projection and SHA-256 digest;
raw producer stdout, stderr, unknown provider maps, and open-world metadata do
not cross the wire. This resolves
`safe-preflight-failed-doctor-can-authorize-mutation`,
`doctor-evidence-required-by-receipts-is-absent`, and
`raw-install-stdout-can-expose-open-world-metadata` without adding a retired or
compatibility path.

### full-tree-lifecycle-and-owned-shutdown | high | resolved

Type: process ownership. The shared bounded runner now creates an owned process
group, enables kill-on-drop, and kills and waits for the complete group on
wall-clock or output-cap breach. Provisioning retains every aggregate task,
selects it against server shutdown, drains the task registry on serve exit, and
aborts and awaits any task that exceeds the shutdown join deadline. Real
wrapper-plus-descendant tests prove timeout and future-drop stop the descendant
heartbeat. This resolves `timeout-cancellation-is-not-definitive-on-windows`
and `detached-setup-task-can-orphan-a-mutating-child`.

### canonical-items-and-hard-admission-bound | high | resolved

Type: filesystem confinement and resource bounds. The reconciler canonicalizes
the target and every existing declared item; for each missing item it
canonicalizes and confines the nearest existing ancestor before mutation, then
requires every produced item to exist within the target afterward. File and
directory symlink escape tests, including missing descendants, pass on Windows.
The single-mutex match-or-reserve operation enforces `MAX_JOBS`: an identical
request still attaches, a posture mismatch still conflicts, a completed job may
be evicted, and a distinct request is rejected while all capacity is running.
This resolves `declared-item-containment-is-only-lexical` and
`setup-job-registry-allows-unbounded-running-growth`.

### real-core-current-aggregate-matrix | high | resolved

Type: production composition. A project-locked Core integration exercises the
actual reconciler against disposable targets for core-only, one missing,
multiple missing, healthy repeat, and force postures. Every case reaches
complete with the expected attempted-versus-reconciled ordinals, exact current
manifest membership, four validated receipts, and final Doctor agreement. The
fixed operations remain `core`, `claude`, `antigravity`, and `codex`; no `all`
command or retired-provider operation is generated. This resolves
`production-composition-lacks-real-core-target-evidence`.

### typed-preflight-and-http-concurrency-proofs | medium | resolved

Type: terminal classification and concurrency. Doctor/preview timeout stays
`timeout_cancelled`; output exhaustion and runner failure remain typed
`indeterminate` causes. Barrier-driven HTTP tests prove simultaneous identical
safe requests share one stable job and simultaneous safe-versus-force requests
admit one posture and return one typed conflict. Generous readiness and
termination budgets plus heartbeat synchronization replace the prior
load-sensitive assumptions. This resolves
`preflight-timeout-loses-terminal-classification`,
`concurrent-posture-conflict-is-not-proved-at-the-route`, and
`real-process-tests-have-load-sensitive-five-second-budgets`.

### correction-validation | medium | verified

Type: validation evidence. Pinned Rust 1.96 gates are green:
`cargo check -p vaultspec-api --tests`; 26 focused provisioning tests, including
the real Core matrix (99.32 seconds); 12 bounded-child tests; both exact HTTP
barrier tests; and `cargo clippy -p vaultspec-api --tests -- -D warnings`.
Clippy surfaced two test-only findings during the pass: the process-tree helper
had not explicitly waited its spawned descendant and one boolean assertion used
an equality form. Both were corrected without suppression and the affected
suite was rerun green. Raw-byte accounting now enforces the aggregate output
budget even for lossy UTF-8 conversion. The previously recorded unrelated broad
suite failure and A2A-process contention remain assigned to their owning
workstreams; this correction adds no observed provisioning regression.

### implementation-correction-disposition | high | pending-review

Type: rolling review disposition. All eight HIGH and three MEDIUM findings from
`e2e70765` now have code and discriminating evidence, and the architecture PASS
requirements are implemented without legacy or deprecated behavior. Per the
rolling audit mandate, closure remains pending formal code re-review of the
correction commit.
## 2026-09-06 formal re-review of setup lifecycle correction

Review target: `bdc0b45ce6ec7628058c91a340afc5707740eb7c`, exact parent
`4c6883770d23ddad6b9b0652eddb79f72ab4b587`. Review covered the ten committed
paths against the eight HIGH and three MEDIUM findings in `e2e70765`, the
approved D4a/b and D9d-f correction in `86470e6c`, the current-only provider
boundary, the production process runner and setup state machine, and the
reported exact-commit validation. Concurrent graph-simulation, design-system,
RAG configuration, lockfile, generated-local-storage, and performance work was
excluded and preserved.

### failed-child-stderr-crosses-closed-wire | high | open

Type: wire minimization and no-legacy enforcement. `run_current_setup` converts
any non-success child into `Err(capture.stderr.clone())`, then publishes that
unvalidated producer stderr as the receipt's `evidence.validation` value. An
exit-nonzero Core process can therefore serve arbitrary text, unrelated
provider names, retired metadata, paths, or secrets through the polled job
response. This directly contradicts D9d and the implementation record's claim
that raw stdout and stderr never cross the wire. The passing projection tests
cover successful or validator-rejected stdout and do not exercise nonzero
stderr disclosure.

Ownership: replace raw stderr/stdout evidence with a closed typed local failure
kind and the digest of bounded producer bytes. Never place producer stream bytes
in setup receipts. Add a real nonzero child discriminator whose stderr contains
unknown and retired-looking metadata, and prove none of those bytes crosses the
wire while the failure remains diagnosable by typed phase/cause and digest.

### dangling-indirection-bypasses-target-confinement | high | open

Type: target confinement and mutation admission. `declared_item_state` uses
`Path::exists()` both to classify the declared item and while walking to its
nearest existing ancestor. Rust's existence probe follows links and returns
false for a dangling symbolic link. A dangling file link, directory link, or
Windows reparse entry is therefore skipped as though no filesystem entry were
present; the walk reaches a confined parent and returns authoritative missing
state, which can authorize installation. The committed escape tests point links
at live outside targets and do not discriminate this case. D9e requires an
encountered indirection to be resolved and confined before mutation.

Ownership: walk entries with `symlink_metadata` or an equivalent no-follow
existence predicate. Treat every encountered link/reparse entry as an
indirection requiring successful canonical resolution within the canonical
target; unresolved, dangling, or escaping entries are disagreement and cannot
authorize mutation. Add dangling file-link and directory-link cases and a
Windows dangling junction/reparse case alongside the existing live-target
controls, proving zero mutation admission.

### shutdown-drop-does-not-prove-full-tree-settlement | high | open

Type: process ownership and shutdown safety. The shutdown `select!` drops the
active `run_bounded` future, publishes an indeterminate aggregate, and lets the
task remove its own retained handle before `shutdown_jobs` can join it. In the
pinned `command-group` 5.0.1 implementation, the Unix group builder establishes
a process group but does not apply its builder `kill_on_drop` flag to the Tokio
child, so dropping the future can leave the wrapper and descendants running.
On Windows, closing the kill-on-close Job Object requests termination but this
path still does not wait on the completion port to prove the job is empty. The
explicit timeout/output paths call `kill().await` and are sound; the task-abort
and server-shutdown paths are not the same terminate-and-reap path required by
D4a. The only drop discriminator ran on this Windows host and checks heartbeat
cessation, not the route/server shutdown composition or definitive group reap.

Ownership: give the aggregate an explicit cancellation protocol that retains
its group handle, terminates the group, awaits group-empty/reap confirmation,
and only then settles and releases single-flight ownership. Do not depend on
future drop for this guarantee. Cover Unix and Windows wrapper descendants and
exercise actual route/server shutdown during Doctor, preview, and install,
proving no surviving heartbeat and no overlapping retry. Keep the terminal
result indeterminate whenever full-tree proof cannot be obtained.

### malformed-preflight-cause-is-collapsed | medium | open

Type: terminal classification. Timeout, output-cap, and runner termination
causes now survive `preflight_failure`, but Doctor and preview validators are
immediately converted with `.ok()`. Missing fields, malformed JSON, wrong
identity, path escape, and coherent-but-disagreeing current facts all collapse
to `preflight_evidence_disagreement`. D9f requires malformed evidence and other
bounded failure causes to remain specifically identifiable; the correction
therefore closes the original timeout/output examples but not the full typed
preflight contract it claims.

Ownership: preserve validator failures as a bounded closed error enum and emit
the phase plus stable cause without producer text. Add Doctor and preview cases
that distinguish malformed JSON, schema mismatch, target disagreement,
canonical escape, and state disagreement while proving zero install spawn.

### corrected-controls-and-validation-evidence | low | verified

Type: positive controls and scope. Exact current Doctor predicates, including
the narrow exit-2 clean-Core envelope, strict current manifest membership,
canonical containment for resolvable existing/missing items, atomic hard-cap
admission, safe-versus-force single-flight conflict, bounded typed successful
install/Doctor projections and digests, the real project-locked Core five-shape
matrix, and load-stable explicit timeout/output tests are present. The fixed
operations remain core, claude, antigravity, and codex; no `all`, Gemini,
profile, deprecated API, alias, translation, fallback, or compatibility path was
introduced. The correction's ten paths are coherent and scoped; unrelated dirty
work is outside the commit.

Independent pinned-toolchain verification passed all 26 focused provisioning
route tests serially, including the project-locked Core matrix: 26 passed, zero
failed, in 138.67 seconds. `git diff --check` is clean. The implementation
record accurately limits broader acceptance evidence to the reported checks and
keeps the prior unrelated broad-suite failure assigned to its owner; a full
repository test run is not claimed here.

### setup-lifecycle-correction-formal-disposition | high | FAIL

Type: formal implementation review disposition. Commit `bdc0b45c` closes the
strict Doctor, successful-evidence projection, hard-cap, current Core matrix,
safe/force concurrency, explicit timeout/reap, and process-test stability
portions of the prior findings. The three HIGH defects above still permit open
producer stderr on the current-only wire, mutation admission through dangling
filesystem indirections, and server shutdown without cross-platform full-tree
settlement. The MEDIUM finding records the remaining typed-cause loss. The
correction is not review-passed. Resolve all four findings with discriminating
production-path tests and obtain another formal review before acceptance.

## Setup lifecycle re-review recommendations

- Close every setup receipt to Dashboard-authored typed fields and digests; no
  raw producer stdout or stderr may cross the wire.
- Use no-follow filesystem entry detection so dangling and escaping links,
  junctions, and reparse points can never establish authoritative missing state.
- Replace drop-based aggregate cancellation with an explicit cross-platform
  terminate-and-reap protocol retained through server shutdown.
- Preserve closed validator causes through preflight and re-run the focused,
  bounded-child, HTTP concurrency, lint, and project-locked Core gates.
## 2026-09-06 process and evidence correction re-review response

Correction target: formal Dashboard review audit `45e6430696`, following
runtime commit `bdc0b45c` and architecture PASS `86470e6c`. Scope remains the
current four-provider setup aggregate, its bounded process runner, shutdown
ownership, containment validator, and tests. No legacy, deprecated, fallback,
translation, or compatibility behavior is added.

### failed-child-streams-are-not-wire-evidence | high | resolved

Type: evidence disclosure boundary. A failed child no longer contributes raw
stderr through `evidence.validation` or any other setup receipt field. Receipts
serve a closed local `run_cause`, typed validator causes, exit code, closed
producer projections when valid, and allowed SHA-256 digests. A real failing
PowerShell child writes a unique stderr marker; the resulting receipt contains
`child_exit_nonzero` and a digest while neither a stdout/stderr field nor the
marker appears anywhere in the aggregate wire value.

### reparse-aware-component-confinement | high | resolved

Type: filesystem mutation safety. Declared-item validation now walks every path
component with `symlink_metadata`, canonicalizes every present component, and
requires the result to stay within the canonical target. A present component
that cannot canonicalize, including a dangling symlink or junction, is typed
`producer_item_unresolved`; an outside resolution is typed
`producer_item_escape`. Missing normal children remain admissible only after all
present ancestors have passed. Existing file/directory escapes, missing children
below escapes, dangling file links, dangling directory links, and normal
in-target missing descendants are covered by the passing Windows discriminator.

### cancellation-explicitly-kills-and-waits-group-empty | high | resolved

Type: process lifecycle. `run_bounded` wraps every command group in an owned
guard. Cancellation synchronously requests whole-group termination and moves the
group into a retained async waiter. Explicit timeout/output termination also
kills and waits the group. Service shutdown aborts and awaits every owned
aggregate task, drains all retained group waiters, and reports a serve error if
group-empty observation fails. The Unix path no longer depends on the
command-group builder's unsupported kill-on-drop setting; Windows waits its job
completion port. Real wrapper-plus-descendant tests prove timeout, runner-future
abort, and service shutdown all return only after descendant heartbeat stops.

### validator-causes-survive-reconciliation | medium | resolved

Type: state classification. Preflight, post-install, and final Doctor/install
validation no longer discard errors with `.ok()`. Typed malformed, schema,
state, identity, target, unsafe-path, escape, unresolved-item, missing-item, and
producer-error causes flow into the local receipt projection. Timeout,
output-cap, nonzero exit, unobserved exit, runner, manifest, and final
reconciliation causes remain distinct. No raw producer bytes are substituted
for these types.

### process-evidence-correction-validation | medium | verified

Type: validation evidence. Pinned Rust 1.96 checks are green:
`cargo check -p vaultspec-api --tests`; 29 provisioning tests including the real
Core five-state matrix (119.53 seconds); 12 bounded-child tests; exact service
shutdown, failed-child stream, and reparse-containment discriminators; and
`cargo clippy -p vaultspec-api --tests -- -D warnings`. The earlier real Core,
HTTP single-flight/posture conflict, current-only argv, capacity, and aggregate
receipt proofs remain green in the complete provisioning filter.

### process-evidence-correction-disposition | high | pending-review

Type: rolling review disposition. The three HIGH and one MEDIUM findings from
`45e6430696` are implemented and carry discriminating evidence. Closure remains
pending the mandatory formal code re-review of the correction commit.
## 2026-09-06 formal re-review of process and evidence correction

Review target: `5da89420b6b5390c8a22fd52e172d4246e68cac2`, exact parent
`84f7c9130c75daf2dc813311cfd60abc58026d15`. Review covered the exact seven
committed paths against the three HIGH and one MEDIUM findings in `45e64306`,
approved D4a/b and D9d-f, the always-on resource-bound and current-only wire
rules, the pinned `command-group` implementation, and the reported validation.
The parent design-system commit and all concurrent graph, performance, RAG,
lockfile, generated-local-storage, and design-system work were excluded.

### cancelled-group-waiters-and-shutdown-drain-are-unbounded | high | open

Type: process lifecycle and bounded resources. The new cancellation owner
correctly sends a group kill and moves the live `AsyncGroupChild` into a waiter,
but stores every waiter in process-global `REAP_TASKS: Vec<JoinHandle<_>>`.
That accumulator has no capacity, TTL, completed-handle pruning, or steady-state
drain; `reap_terminated_groups` is called only at serve shutdown and in two
tests. Repeated cancellation of any route using the shared bounded runner can
therefore retain completed handles for the process lifetime. At shutdown the
reaper awaits every handle sequentially with no per-waiter or total deadline,
so one group whose empty observation wedges can prevent `serve` from returning
indefinitely. This contradicts the explicit bounded-accumulator rule and the
boot contract that every shutdown wait carries a bound. The passing shutdown
test uses one cooperative group and cannot discriminate either failure mode.

Ownership: replace the append-only waiter vector with self-reaping bounded
ownership whose admission is tied to an explicit cap and which removes terminal
waiters during normal runtime. Drain all remaining groups under one total
shutdown deadline. A deadline breach must return a typed unresolved-cleanup
error without claiming group-empty proof; it must not hang or silently release a
live mutator. Add repeated-cancellation evidence proving completed handles do
not accumulate, exact-cap behavior, and a deliberately wedged/fault-injected
waiter proving shutdown cannot exceed its budget.

### nonzero-preflight-exit-loses-run-cause | medium | open

Type: terminal classification. The correction preserves typed validator faults,
but a completed Doctor or preview process with a nonzero exit does not pass
through `run_cause`. Doctor validation reduces the exit mismatch to
`producer_state_disagreement`; preview explicitly constructs that same fault
when `code != 0`. The receipt therefore loses `child_exit_nonzero` at safe
preflight even though post-install receipts preserve it. This contradicts the
implementation record's claim that nonzero exit remains distinct across
preflight and reconciliation.

Ownership: preserve the closed process cause alongside the validator cause for
Doctor and preview preflight, without exposing stream bytes. Add separate
nonzero Doctor and preview production-path cases proving `child_exit_nonzero`,
the phase, digests, zero install spawn, and no raw stdout/stderr fields.

### prior-wire-confinement-and-cancellation-findings | low | verified

Type: corrected positive controls. No producer stdout or stderr bytes cross the
setup wire; receipts carry Dashboard-authored causes, closed current projections,
and bounded digests. Component-wise `symlink_metadata` plus canonicalization
rejects live escapes and dangling file/directory indirections before mutation.
Explicit timeout/output paths terminate and await the complete process group;
future abort and service shutdown synchronously request group termination,
retain the group handle, and propagate group-wait errors when the waiter
completes. Validator failures now retain closed malformed, schema, state,
identity, target, path, escape, unresolved, missing-item, and producer-error
kinds. The provider set and command sequence remain exactly core, claude,
antigravity, and codex, with no `all`, Gemini, profile, deprecated API, alias,
translation, migration, fallback, or compatibility path.

The committed evidence reports 29 focused provisioning tests including the real
Core five-shape matrix, 12 bounded-child tests, exact shutdown/disclosure/
containment cases, two HTTP concurrency barriers, warnings-denied Clippy, Core
checks, and clean diff. An independent targeted rerun could not start `rustc`
because the shared Windows build path was rejected as an untrusted mount point;
this is validation-transport evidence, not a code failure, and the formal
verdict does not depend on rerunning the already reported green suite. The
correction commit itself contains no unrelated path.

### process-evidence-correction-formal-disposition | high | FAIL

Type: formal implementation review disposition. Commit `5da89420` resolves the
three prior direct HIGH defects and preserves the no-legacy/no-deprecated
boundary, but its retained cleanup implementation creates an unbounded global
accumulator and an unbounded shutdown wait. The remaining MEDIUM finding loses
the nonzero process cause during safe preflight. The correction is not
review-passed. Resolve both findings with discriminating production-path tests
and obtain another formal review before acceptance.

## Process and evidence re-review recommendations

- Make canceled-group ownership self-reaping and explicitly capacity-bounded.
- Apply one total deadline to service-shutdown group settlement and surface a
  typed unresolved-cleanup failure if full-tree proof cannot complete.
- Preserve nonzero Doctor and preview process causes alongside closed validator
  causes, digests, and zero-mutation evidence.
## 2026-09-06 bounded reaper correction re-review response

Correction target: formal Dashboard review audit `72173b06`, following process
and evidence correction `5da89420`. Scope is bounded child-process admission,
cancelled-group ownership and shutdown classification, plus setup preflight
cause preservation. No legacy or deprecated surface is introduced.

### cancelled-group-ownership-is-capped-and-self-pruning | high | resolved

Type: resource ownership. Every bounded child must first acquire one of 64
explicit owned-process-group permits. Cancellation transfers that permit and the
group handle into a keyed waiter registry, so the number of live groups and
waiters cannot exceed admission. A completed waiter observes group-empty,
releases its permit, and removes its own handle during runtime. A repeated real
wrapper/descendant cancellation test drives twelve cancellations without an
explicit drain and proves the waiter count converges to zero; a separate test
reserves all 64 permits and proves the next command is refused before spawn.

### group-shutdown-has-one-terminal-budget | high | resolved

Type: bounded shutdown. Service shutdown drains the bounded waiter map under one
absolute ten-second deadline shared by all group-empty joins. A waiter error is
typed `GroupWaitUnresolved`; deadline exhaustion is typed `DeadlineExceeded`.
Neither condition is reported as definitive cleanup, and the server continues
its remaining cleanup before returning the error. A deliberately pending waiter
proves the drain returns `DeadlineExceeded` within its 150 ms test budget and
does not hang or report success.

### nonzero-preflight-exits-remain-distinct | medium | resolved

Type: aggregate cause fidelity. Doctor and preview validation now combine
process and schema evidence without replacing a completed nonzero child exit
with generic producer state disagreement. `child_exit_nonzero` wins for that
case; timeout, output cap, process-group admission exhaustion, runner failure,
and typed validation disagreement remain separate causes. The discriminator
proves both Doctor and preview preserve the nonzero-exit cause.

### bounded-reaper-correction-validation | medium | verified

Type: validation evidence. Pinned Rust 1.96 gates are green:
`cargo check -p vaultspec-api --tests`; 15 bounded-child tests including
self-pruning, hard admission, and wedged shutdown; exact service-shutdown and
nonzero-preflight discriminators; 30 provisioning tests including the real Core
matrix (67.51 seconds); and `cargo clippy -p vaultspec-api --tests -- -D
warnings`. Existing raw-stream closure, current-only provider, containment,
receipt, HTTP concurrency, and aggregate reconciliation proofs remain intact.

### bounded-reaper-correction-disposition | high | pending-review

Type: rolling review disposition. Both HIGH findings and the MEDIUM finding from
`72173b06` now have bounded implementation and discriminating evidence. Closure
remains pending formal code re-review of the correction commit.
## 2026-09-06 formal re-review of bounded reaper correction

Review target: `9b6ddef2503f8a0308c197432528f771676ea760`, exact parent
`33606a53717bdb1c6e512db7734040bb94be5457`. Review covered the exact nine
committed paths against the HIGH and MEDIUM findings in `72173b06`, the shared
bounded-runner fault adapters, the resource-bound and shutdown contracts, prior
current-only evidence/confinement fixes, and the reported validation. The
parent design-system commit and concurrent graph, performance, RAG, lockfile,
generated-local-storage, and design-system work were excluded.

### provisioning-adapter-swaps-wait-and-capacity-causes | medium | open

Type: typed failure classification. `run_capability_with_limits` maps
`BoundedFault::Read` and `BoundedFault::Wait` to
`RunTermination::AtCapacity`, while the actual `BoundedFault::AtCapacity` arm
returns generic `RunTermination::Indeterminate`. A process read/reap failure is
therefore falsely reported as capacity exhaustion, and the sixty-fifth refused
process group loses the new typed `process_group_at_capacity` cause. The setup
test starts from a synthetic prebuilt `RunCapture::AtCapacity`; the runner-cap
test stops at `BoundedFault::AtCapacity`. Neither crosses the production adapter,
so both pass while the real mapping is reversed.

Ownership: map `Read`/`Wait` to `Indeterminate` and `AtCapacity` to
`AtCapacity`. Add production-adapter discriminators for every `BoundedFault`
variant, including separate Read, Wait, AtCapacity, Timeout, OverCap, and spawn
cases, then prove the setup preflight wire receives
`doctor_process_group_at_capacity` or `preview_process_group_at_capacity` from
a real adapter refusal. Keep all causes closed and free of producer bytes.

### bounded-group-ownership-and-preflight-cause | low | verified

Type: resolved correction controls. A 64-permit semaphore is acquired before
spawn. The permit remains owned by the live group and transfers with a cancelled
group into the keyed waiter; normal group completion, explicit timeout/output
termination, or successful waiter completion releases it. Waiters remove their
keys during normal runtime. Shutdown aborts owned provisioning tasks, then
drains group waiters under one absolute ten-second deadline and distinguishes
`DeadlineExceeded` from `GroupWaitUnresolved`. The repeated-cancellation,
sixty-fifth-admission, cooperative shutdown, and deliberately pending waiter
proofs exercise the intended bounds. The Unix path synchronously sends the
process-group kill without relying on unsupported builder drop behavior, and
Windows retains the Job Object through group-empty waiting.

Doctor and preview validation now prefer `run_cause`, so a completed nonzero
preflight process retains `child_exit_nonzero` instead of collapsing into
producer state disagreement. All earlier raw-stream closure, typed digest,
Doctor/install projection, no-follow component confinement, dangling-link,
hard job-cap, safe/force conflict, and real Core matrix corrections remain in
place. No `all`, Gemini, profile, deprecated API, alias, translation, migration,
fallback, or compatibility path was introduced, and no raw producer stream
bytes cross the setup wire.

The implementation record reports 15 bounded-child tests, 30 provisioning tests
including the real Core matrix, targeted nonzero and service-shutdown cases,
check, warnings-denied Clippy, Core checks, and clean diff. The reviewed commit
is mechanically clean and its nine paths are coherent with the shared runner
change. The validation suite lacks the production-adapter fault mapping proof
needed to catch the open finding above.

### bounded-reaper-correction-formal-disposition | medium | FAIL

Type: formal implementation review disposition. Commit `9b6ddef2` resolves the
unbounded waiter registry, unbounded group-shutdown drain, and nonzero-preflight
cause defects in their core implementations. The production provisioning
adapter reverses the read/wait and capacity classifications, so the promised
typed capacity behavior is not delivered end to end. The correction is not
review-passed. Correct the mapping, add the production-adapter fault matrix, and
obtain another formal review before acceptance.

## Bounded reaper formal re-review recommendations

- Correct the `BoundedFault` to `RunTermination` mapping before further setup
  lifecycle work.
- Exercise every bounded-runner fault through the real provisioning adapter so
  synthetic captures cannot mask future classification drift.
## 2026-09-06 provisioning fault-adapter correction response

Correction target: formal review audit `9a7ab9425bde7117c22bad974f91e1f32917482c`
after bounded ownership commit `9b6ddef2`. Scope is the production
`BoundedFault` adapter, setup preflight cause projection, and discriminating
tests. No producer bytes, legacy provider, deprecated option, or compatibility
behavior is introduced.

### production-fault-adapter-is-bijective | medium | resolved

Type: typed failure classification. The provisioning adapter now maps Spawn,
Timeout, OverCap, Read, Wait, and AtCapacity to six distinct internal terminal
states: `SpawnFailed`, `TimeoutCancelled`, `OutputCapped`, `ReadFailed`,
`WaitFailed`, and `AtCapacity`. Setup causes remain correspondingly distinct as
spawn, timeout, output-cap, read, wait, and process-group-capacity facts; none is
collapsed or swapped. A table-driven discriminator calls the same production
adapter for every `BoundedFault` variant and checks the exact preflight cause.
Existing real-process timeout/output-cap coverage remains green.

### process-capacity-reaches-safe-setup-wire | medium | resolved

Type: end-to-end cause fidelity. The setup discriminator reserves all 64 real
process-group permits, invokes safe current setup, and lets the actual Doctor
spawn cross `run_bounded` and the production provisioning adapter. The aggregate
is `indeterminate`, and its first receipt contains the closed typed cause
`doctor_process_group_at_capacity`; no command is spawned and no raw stream
field is served.

### fault-adapter-correction-validation | medium | verified

Type: validation evidence. Pinned Rust 1.96 `cargo check -p vaultspec-api
--tests` is green. The six-fault production adapter matrix, end-to-end safe setup
capacity case, and existing real-process malformed/timeout/output-cap case are
green. The prior complete 30-test provisioning filter, 15-test bounded-child
suite, real Core matrix, shutdown, containment, and HTTP proofs remain green.
Final warnings-denied Clippy and Vaultspec Core corpus checks are recorded with
the correction commit.

### fault-adapter-correction-disposition | medium | pending-review

Type: rolling review disposition. The open MEDIUM mapping defect from
`9a7ab942` is corrected with production-adapter and end-to-end evidence. Closure
remains pending mandatory formal code re-review.
