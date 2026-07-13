---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# `figma-parity-reconciliation` `W02.P06` summary

P06 rebuilt the remaining overlay and dialog surfaces onto the canonical Figma
role-named token foundation. Across the six Steps the legacy alias shims (the
dense type aliases, the legacy radius scale, and the six-level brand-elevation
scale) were re-keyed to the canonical foundation utilities - the caption and label
type roles, the xs/md/lg/pill radius steps, and the three-level raised, overlay,
and popover elevations - while every surface stayed a dumb projection over its
preserved hook, fetching nothing and reading no raw tiers block.

The timeline (S35) projects the preserved lineage hook and the time-travel stores,
reading the reconnecting row pre-derived from the stores degradation layer rather
than guessing from a transport error. The degradation module (S36) was confirmed
to read availability from the per-tier tiers block through the stores-owned
derivation, and its dev debug overlay was moved off a raw Tailwind palette onto the
semantic OKLCH token tier so it reads correctly under every theme. The discover
overlay (S37) projects the preserved rag-backed query and reads discover-offline
from the stores-derived tiers truth. The settings dialog (S38) and its control kit
(S39 - switch, segmented toggle, slider, text) stay schema-driven from the served
registry, with every rendered row a real consumed setting and no dead controls; the
controls speak the string wire value at their boundaries and carry the correct ARIA
roles. The command palette (S40) projects the preserved command registry over the
engine-enumerated vocabulary and the ops whitelist, keeping its full keyboard,
focus-trap, and arm-to-confirm contract. Perfect-circle liveness dots and switch
knobs stay on the full-round utility by design (a circle is not the pill token).

Files touched across the phase:

- Modified: `frontend/src/app/timeline/Timeline.tsx`
- Modified: `frontend/src/app/degradation/`
- Modified: `frontend/src/app/stage/Discover.tsx`
- Modified: `frontend/src/app/settings/SettingsDialog.tsx`
- Modified: `frontend/src/app/settings/controls/`
- Modified: `frontend/src/app/palette/CommandPalette.tsx`

The phase landed across commits `95d81b0..3fe748f`. Each scoped file passes eslint,
prettier, and tsc cleanly and the settings-control and command-palette suites stay
green; the aggregate frontend gate is red only on the concurrent W03 scene agent's
in-flight, untracked scorecard files under `frontend/src/scene/field/`, which are
outside this phase's scope fence and were not touched.

## Description

W02 carried a phase review with a PASS-WITH-NITS verdict and no CRITICAL or HIGH
findings; P06 held the dumb-projection and schema-driven contracts on every rebuilt
surface and introduced no carry-forward of its own. The two MEDIUM items the W02
review carried forward target W04 - the right-rail IA reconciliation at
W04.P10.S57 and the `useGitHistDiffView` stores read hook - and are recorded in the
W02.P05 summary, where the surfaces that own them were rebuilt.
