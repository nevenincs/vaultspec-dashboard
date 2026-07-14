---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S01'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Design the rail-footer framework status cluster frame - strip plus the four chips (Search service, Approvals, Backend health, Vault health) with resting, hover, attention-tone, and count-badge states - Kit-composed on the token scale and ## Scope

- `Figma SlhonORmySdoSMTQgDWw3w FrameworkStatusCluster` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Design the rail-footer framework status cluster frame - strip plus the four chips (Search service, Approvals, Backend health, Vault health) with resting, hover, attention-tone, and count-badge states - Kit-composed on the token scale

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w FrameworkStatusCluster`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Survey the binding Components page; locate clone sources (`Dialog` 635:3130, `SettingsDialog` 635:3108, `RagOpsConsole` 879:4125) and the free canvas region.
- Create the `[Surface] Control Panels` host frame (node 1089:4308) at x=68200.
- Build the `_StatusChip` component set (1089:4329): Tone=Ok/Attention/Down x State=Resting/Hover, each chip a token-bound dot (status/health-valid, status/health-dangling, status/health-orphaned) + Inter Medium label in ink/muted; Hover variants carry the chrome/paper-sunken wash; Attention variants carry the count text.
- Build the `FrameworkStatusCluster` component (1089:4330): 300-wide horizontal strip, chrome/paper-raised fill, border/subtle top hairline, four chip instances labelled Search / Approvals (count 3) / Backend / Vault.

## Outcome

Cluster and chip states are bound Kit-composed frames in the binding file; screenshot verified.

## Notes

Chip labels are the short plain-language forms (Search, Approvals, Backend, Vault) to fit the 300px rail width.
