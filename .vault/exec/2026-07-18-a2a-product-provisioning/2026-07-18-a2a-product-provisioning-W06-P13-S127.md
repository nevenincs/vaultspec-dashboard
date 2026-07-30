---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
step_id: 'S127'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S127 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Create the mandatory real-artifact certification workflow with network isolation, retained diagnostics, and no skip or expected-failure path and ## Scope

- `.github/workflows/a2a-product-certification.yml` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Create the mandatory real-artifact certification workflow with network isolation, retained diagnostics, and no skip or expected-failure path

## Scope

- `.github/workflows/a2a-product-certification.yml`

## Description

- Created the certification workflow with five jobs: per-target certification of the published archive, the Windows package-manager channels, the complete MSI, a one-release-set inventory comparison, and storage durability.
- Drove the certifier against a real published archive per target on a native runner, staging the asset and refusing a digest that does not match its published sidecar.
- Adopted the certifier's own three-way outcome vocabulary rather than inventing a second one, so an absent-evidence case exits non-zero and can never read as a pass.
- Established real per-platform network isolation before the offline cases run, and verified the teardown restored connectivity instead of assuming it.
- Retained diagnostics for every job on both success and failure, with an explicit retention window and an error when no diagnostics were produced.
- Delegated the Scoop and WinGet legs to the existing phase-zero proof instead of restating the reversible sequence, keeping one definition of what those channels must prove.
- Drove Windows Installer directly for the MSI leg through install, repair, a manager-owned downgrade, and uninstall, treating a reboot-required result as the success it is.
- Compared the supported cells of the support matrix against the assets a release actually published, failing on any asymmetry.
- Made the durability job fail closed, naming the power-interruption evidence required and blocking publication until it exists.

## Outcome

The certification harness exists and is fail-closed throughout. It carries no path by which a job can report success without having driven a real artifact: there is no continue-on-error, no truthy-suffixed command, and no expected-failure branch. The only unconditional steps are diagnostic retention and the isolation teardown, and the teardown verifies its own result rather than trusting it.

The harness is authored, NOT exercised. No published artifact exists for it to certify yet, so every job would currently fail at its staging or preflight step. That is the designed behaviour and it is why only the harness Step is closed here.

## Notes

- Only the harness Step is closed. The per-target certification runs, the channel runs, the inventory comparison, and the durability certification each have an observed run against real published artifacts as their acceptance, and none has occurred. Closing them on authored-but-never-executed workflow text would be exactly the failure this project has been bitten by.
- Storage durability cannot be certified by any runner. Process termination proves nothing about what reached the platter or the disk's own write cache, so that job refuses rather than reporting a green it did not earn.
- Two defects were found and fixed while authoring rather than left for a first run to discover: a reference to a channel script that does not exist, which would have failed at runtime, and a here-string whose terminator must sit at column zero, which broke the document's structure outright.
- The lane originally assigned this produced nothing and did not answer a status check; the work was taken over rather than left blocking, since the harness gates nine downstream Steps.
