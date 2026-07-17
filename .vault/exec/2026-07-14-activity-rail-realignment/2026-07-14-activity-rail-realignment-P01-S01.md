---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S01'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Design the rail-footer framework status cluster frame - strip plus the four chips (Search service, Approvals, Backend health, Vault health) with resting, hover, attention-tone, and count-badge states - Kit-composed on the token scale

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w FrameworkStatusCluster`

## Description

## Outcome

## Notes

## Description

- Survey the binding Components page; locate clone sources (`Dialog` 635:3130, `SettingsDialog` 635:3108, `RagOpsConsole` 879:4125) and the free canvas region.
- Create the `[Surface] Control Panels` host frame (node 1089:4308) at x=68200.
- Build the `_StatusChip` component set (1089:4329): Tone=Ok/Attention/Down x State=Resting/Hover, each chip a token-bound dot (status/health-valid, status/health-dangling, status/health-orphaned) + Inter Medium label in ink/muted; Hover variants carry the chrome/paper-sunken wash; Attention variants carry the count text.
- Build the `FrameworkStatusCluster` component (1089:4330): 300-wide horizontal strip, chrome/paper-raised fill, border/subtle top hairline, four chip instances labelled Search / Approvals (count 3) / Backend / Vault.

## Outcome

Cluster and chip states are bound Kit-composed frames in the binding file; screenshot verified.

## Notes

Chip labels are the short plain-language forms (Search, Approvals, Backend, Vault) to fit the 300px rail width.
