---
tags:
  - '#audit'
  - '#agent-panel'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:b4476330629a876c86f5df147fdd748477836dbd057fc6ca4d3802b45dfa48ea'
related:
  - "[[2026-08-01-a2a-agent-flow-adr]]"
  - "[[2026-08-01-agent-panel-shell-integration-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-08-01-agent-panel-plan]]"
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
