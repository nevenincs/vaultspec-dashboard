---
tags:
  - '#exec'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b3bcdcf720ad3da3ec0c235bcf0a39dfe8092ada22bd5e7d74f2c045aa80d6a6'
step_id: 'S02'
related:
  - "[[2026-08-01-advanced-service-console-plan]]"
---

# Redesign and relocate the rag console as the service-named TUI pair: identity header (name, version, host:port, pid, storage path), normal-sized lifecycle controls, jobs with existing filters, log tail, storage summary, all over the codified contract reads

## Scope

- `frontend/src/app/settings`
- `frontend/src/app/panels`

## Description

- Replace the retired modal job dashboard with the index console, mounted as the first fold of the Advanced section.
- Add the identity projection deriving what the attached tool is running on from three reads already on the wire: the semantic tier's component handshake, the brokered ops-state snapshot, and the served provisioning projection.
- Render the identity header as one weighted line - status mark, console title, status word, lifecycle actions - over the served identity properties.
- Reshape the lifecycle controls into one weighted verb for the current state with quiet text actions beside it, replacing the wrapping row of equal filled buttons.
- Add the log tail as a props-driven body over the bounded log window, narrowing to the update selected in the monitor table.
- Carry the existing updates table and storage rollup into the console unchanged, so their bounded filters and served counts survive the move.
- Drop the misleading feature name from every rendered string; the console titles itself from the catalog.
- Add the header, log-tail, and identity-projection tests that the retired dashboard's render test used to hold.

## Outcome

The tool has one honest face: who it is, what it is doing, what it is chewing through, what it logged, and what it holds - all Tier-1 codified-contract reads. Nothing recomputes the store's collection-naming scheme, and no Qdrant-native read was added. Every identity fact is served or absent: an unserved field is a missing row, never a blank one and never a substituted neighbour.

## Notes

The Step's own wording asks the header to show the service's host:port and pid. Tracing the wire showed those are not served to a browser client at all - the discovery record carrying them is read by the engine and never forwarded. The header states the STORE's address, process, and version instead, each labelled as the store's, and stays silent about a running port or pid. The governing record has been amended with this correction; serving the tool's own listening identity is a future engine ask.

The Step also asks the console to be SERVICE-named. It was first built to render the tool name the component handshake serves, then corrected during execution: that value is a backend package identifier, and the labels law keeps internal vocabulary off screen whichever tool is attached. The console now titles itself from the catalog, and the projection carries no name field at all. What the Step was really guarding against - the console being named for one of its features - holds either way.

The closing audit found the retired dashboard's render test had been deleted without replacement, taking three proofs with it - including the security-relevant one that a FAILED start renders the authored sentence and never the raw envelope's reason, captured output, pid, or port. All three were rewritten against the new header, plus unit coverage for the identity projection and the log tail's level toning, both of which had none.
