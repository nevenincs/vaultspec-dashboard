---
name: served-presets-are-the-router
---

# Served presets are the router

- **Routing is explicit selection.** Solo-vs-team routing is the user's explicit
  preset selection at the composer. NO layer — frontend, engine, or sibling — infers
  topology, team, or agent from prompt text. Misrouting is a user choice to revise,
  never a hidden inference to debug.
- **The composer renders served truth only.** The team/agent selector lists exactly
  the presets served by `presets-list`, and the model picker renders exactly the
  served per-profile summaries (id, default flag, eligibility with reasons) — never a
  client-side catalog, never a hardcoded provider list, never a profile the backend
  did not serve or marked ineligible.
- **Defaults are contextual selection, not inference.** A document open in the dock
  defaults the selector to the solo editor preset with that document as target; an
  empty dock defaults to the team pipeline. Defaults pre-select a SERVED option the
  user can change; they never bypass the selector.
- **What rides the wire is the selection.** The chosen preset id and served
  `profile_id` travel on the existing `run-start` args; free-form provider/model
  fields do not exist on this wire and adding them is a reviewed contract event,
  never a refactor.
- **Provenance:** codifies `2026-08-01-a2a-agent-flow-adr` D1/D3, per the
  mutual-reference discipline of `2026-07-14-a2a-orchestration-edge-adr`.
