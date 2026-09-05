---
tags:
  - '#audit'
  - '#agent-panel'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:5bab1525dae137b55ada6cf2284467f7ae446618c0a90e15331dc10c97025914'
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

## Recommendations

- Complete the unchecked P11 implementation and negative proof against the
  released A2A binary and receipt-matched Dashboard consumer.
- Treat any profile DTO, `profile_id`, Gemini provider/mode value, old-config
  translation, or legacy restart branch found later as a new high-severity
  compatibility finding under this same authority.
- Keep provider-issued Gemini-branded model labels opaque under their serving
  provider; never infer a retired provider identity from display text.
