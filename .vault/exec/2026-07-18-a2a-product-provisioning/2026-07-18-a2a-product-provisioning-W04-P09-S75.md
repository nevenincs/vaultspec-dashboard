---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
step_id: 'S75'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Install, verify, receipt, update, and remove the complete Windows product tree from the product-owned PowerShell installer

## Scope

- `packaging/install.ps1`

## Description

- Kept the placement and verification the earlier pass had already delivered, and brought the script to the same operation set and the same delegation contract as its macOS and Linux counterpart, so the two installers cannot drift in what they promise.
- Added update, delegated to the product's receipt-gated self-update path, with a re-verification of the tree the updater activated and a refusal-reported-as-success treated as failure.
- Added receipt-aware removal: stop the running app, ask the product authority to drop its owned generations, receipt, and credentials while preserving user data, and delete the tree only afterwards; one tolerated refusal for a never-launched tree, every other refusal aborting with the tree left in place.
- Added honest receipt reporting from the same authority, including a stated reason when the read itself fails.
- Refused to clobber an existing installation, refused an unsupported host architecture rather than serving an uncertified emulated build, and bounded the download with a declared-size check before transfer plus a wall-clock timeout and no retry loop.
- Removed the plan and Step identifiers the earlier pass had embedded in the script's documentation block and comments.

## Outcome

The Windows installer owns the whole lifecycle the Step names, delegating every product decision to the shipped bounded authority, and behaves identically on Windows PowerShell 5.1 and PowerShell 7.

## Notes

Probing found and fixed a live defect rather than confirming a guess. Windows PowerShell turns a native command's standard-error output into a terminating error under the script's error-exit preference, so the first probe of an unreadable receipt aborted the whole run instead of taking the honest reporting branch. Native invocations now capture standard error as text and let the process exit code decide, and error records are flattened to plain text so the surfaced reason is readable rather than a stack-shaped dump.

A second real defect: the script had been authored with non-ASCII punctuation and no byte-order mark, which Windows PowerShell 5.1 renders as mojibake. It is now ASCII-only, which avoids the encoding dependency entirely.

Every operation path was executed against a compiled console stub standing in for the shipped product binary, covering the same matrix as the shell installer, and the hard-refusal case was asserted to leave the tree on disk. This is control-flow evidence: a real install of a real composed tree is not exercisable until the runtime build source reshape owned by another lane lands.
