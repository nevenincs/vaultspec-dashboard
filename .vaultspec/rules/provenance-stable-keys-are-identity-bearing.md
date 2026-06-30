---
name: provenance-stable-keys-are-identity-bearing
---

# Provenance stable keys are identity-bearing: composition changes are contract events

## Rule

An edge's stable key — the provenance composition that derives its wire id — must be
built only from what the relationship *is* (source, target, relation, tier, and the
provenance fields that name the producing fact), never from volatile inputs or from
resolution/rule outcomes; any change to a stable-key composition is a contract-review
event between the engine and its consumers, never a refactor.

## Why

Stable node/edge ids are a contract guarantee (`2026-06-12-dashboard-foundation-reference`
§2): the GUI caches, animates, and time-travels by id, so an id that shifts when a
resolution state flips or a correlation rule re-fires breaks client state silently.
The constraint held across two independent cycles of the engine build
(`2026-06-12-vaultspec-engine` plan): the W01.P01 review ruled the executor's
edge-id design call (hash the provenance stable key, not full provenance) correct,
and the W02.P07 temporal redline re-derived the same principle when a rule-bearing
key nearly shipped — fixed as the hard W03.P11 gate because it was free before any
endpoint served ids and corpus-breaking after.

## How

- **Good:** a structural edge's key includes the document blob hash, byte span, and
  resolved target name — the facts that make it *that* mention — while its
  resolved/stale/broken state lives outside the key, so re-resolution updates state
  without minting a new identity.
- **Good:** a proposed change to any key composition lands as a contract-reference
  amendment reviewed by both engine and GUI owners, with a migration note for cached
  ids.
- **Bad:** including the temporal correlation rule that fired (a rule outcome) in a
  temporal edge's key — re-running with an added rule re-keys existing edges and the
  GUI's diff clock sees phantom remove/add pairs.

## Status

Active. Enforced by the engine's per-phase review discipline; the key compositions
are documented alongside the wire contract.

## Source

Engine cycle audit `2026-06-12-vaultspec-engine-audit` (W01.P01 design call;
W02.P07 redline 401 and its W03.P11 gate; codification candidate 1). Contract
reference `2026-06-12-dashboard-foundation-reference` §2 identity guarantees.
