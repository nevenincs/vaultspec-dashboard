---
tags:
  - '#audit'
  - '#context-menu-copy-safety'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-06-15-dashboard-context-menus-adr]]"
  - "[[2026-07-14-frontend-localization-adr]]"
  - "[[2026-07-15-context-menu-copy-safety-research]]"
---

# Context-menu copy safety architecture reconciliation

## Decision inventory

- The accepted context-menu decision establishes one shared action and resolver system and
  defines a canonical per-region action inventory.
- The accepted frontend localization decision establishes a later user-facing language and
  data boundary, including a prohibition on wire tokens and diagnostic identifiers in
  general UI.
- Production graph menus still implement the older raw Copy ID inventory.

## Finding

### CMCS-001 | contradiction | Raw graph ID copy conflicts with the user-facing data boundary

The context-menu inventory explicitly requires raw graph-node and island Copy ID actions.
The localization decision prohibits wire tokens and internal identifiers in general UI.
The clipboard is user-facing output, so renaming a raw ID action cannot reconcile the two
decisions. The production graph-node, island, meta-connection, and right-edge menus still
expose variants of this older behavior.

This is a judgment-level ADR contradiction. It is not safe to supersede the entire
context-menu decision because its resolver, action, dispatch, accessibility, and gating
architecture remains valid and implemented.

## Recommended resolution pending approval

Adopt a narrow amendment: general menus may copy only established user-level references.
Document graph nodes reuse the canonical document-link action. Entities without an approved
public reference omit the action. Raw graph and edge identities remain available only to
structured diagnostics or an explicitly production-fenced diagnostic surface. Established
paths, filenames, branches, titles, commit hashes, pull-request numbers, and document links
remain valid user data when labelled honestly.

The proposed context-menu-copy-safety ADR records this amendment and its verification
obligations. No production action will be removed until the proposal receives explicit
approval.

## Mechanical actions

No status or supersession mutation was applied. The conflict is narrow and requires human
approval; the existing ADRs remain accepted while the proposal is under review. Repository-
wide mechanical repair was not run because the shared worktree contains unrelated user
documents that must remain untouched.
