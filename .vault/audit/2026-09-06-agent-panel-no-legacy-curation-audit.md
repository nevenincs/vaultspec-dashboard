---
tags:
  - '#audit'
  - '#agent-panel'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:80a627f82a071db0f56e9b8131774fec1bdc84f28e424c1542e63d9e9a6e0422'
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
