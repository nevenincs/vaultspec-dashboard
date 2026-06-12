---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S41'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the map verb listing repo, branches, worktrees, corpus views and classification with json and scope flags

## Scope

- `engine/crates/vaultspec-cli/src/cmd/map.rs`

## Description

- Implement the map verb over workspace discovery: worktrees (path, HEAD, dirty, vault presence, advisory launch-default marker), local branches with advisory classification, remote refs flagged with their degraded tiers.

## Outcome

The section 2 landscape served; live-verified against this repository.

## Notes

Windows extended-length path prefixes are stripped at the wire (clean-path helper) so paths compare and display consistently.
